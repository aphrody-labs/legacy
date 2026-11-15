// Agent loop: OpenAI-compatible LLM with tool calls, tools executed against the /v1 API.
import type { ClientLlm, Message, OutilLlm } from "@auto/ingest/llm";
import { ErreurApi, type ApiAuto } from "./api";
import { OUTILS, type Outil } from "./outils";

export const SYSTEME = `You are the management assistant of a French company (quotes, invoices, payments, reminders, absences).
You act only through the tools provided, with the rights of the user. Amounts in cents, VAT in tenths of a percent.
Before issuing a document or recording a payment, check the identifier with a read tool.
Never invent data: if information is missing, ask for it. Reply briefly, in the language of the user.`;

export const versLlm = (outils: Outil[]): OutilLlm[] =>
  outils.map((o) => ({
    type: "function",
    function: { name: o.nom, description: o.description, parameters: o.schema },
  }));

/** Runs a tool; an error is returned to the model (and to the MCP caller) as an error result. */
export async function appelerOutil(
  api: ApiAuto,
  outils: Outil[],
  nom: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; texte: string; valeur?: unknown }> {
  const o = outils.find((x) => x.nom === nom);
  if (!o) return { ok: false, texte: JSON.stringify({ erreur: `unknown tool: ${nom}` }) };
  try {
    const v = await o.executer(api, args);
    return { ok: true, texte: typeof v === "string" ? v : JSON.stringify(v), valeur: v };
  } catch (e) {
    const err =
      e instanceof ErreurApi
        ? { erreur: e.message, status: e.status, details: e.details }
        : { erreur: (e as Error).message ?? String(e) };
    return { ok: false, texte: JSON.stringify(err) };
  }
}

export interface OptionsAgent {
  llm: ClientLlm;
  api: ApiAuto;
  outils?: Outil[];
  /** History of a conversation in progress (without the system message). */
  historique?: Message[];
  maxEtapes?: number;
  /** Trace of the tool calls (CLI: printed on stderr). */
  surOutil?: (nom: string, args: unknown, ok: boolean) => void;
}

export interface Tour {
  reponse: string;
  messages: Message[];
  appels: { nom: string; args: Record<string, unknown>; ok: boolean }[];
}

export async function executerAgent(demande: string, o: OptionsAgent): Promise<Tour> {
  const outils = o.outils ?? OUTILS;
  const messages: Message[] = [...(o.historique ?? []), { role: "user", content: demande }];
  const appels: Tour["appels"] = [];
  const tools = versLlm(outils);
  for (let etape = 0; etape < (o.maxEtapes ?? 10); etape++) {
    const r = await o.llm.completer({ messages: [{ role: "system", content: SYSTEME }, ...messages], tools });
    messages.push({ role: "assistant", content: r.content, ...(r.tool_calls ? { tool_calls: r.tool_calls } : {}) });
    if (!r.tool_calls?.length) return { reponse: r.content ?? "", messages, appels };
    for (const c of r.tool_calls) {
      let args: Record<string, unknown> = {};
      let res: Awaited<ReturnType<typeof appelerOutil>>;
      try {
        args = c.function.arguments ? (JSON.parse(c.function.arguments) as Record<string, unknown>) : {};
        res = await appelerOutil(o.api, outils, c.function.name, args);
      } catch {
        res = { ok: false, texte: JSON.stringify({ erreur: "invalid JSON arguments" }) };
      }
      appels.push({ nom: c.function.name, args, ok: res.ok });
      o.surOutil?.(c.function.name, args, res.ok);
      messages.push({ role: "tool", tool_call_id: c.id, content: res.texte });
    }
  }
  return { reponse: "Maximum number of steps reached without a final answer.", messages, appels };
}
