// Messages whose `{$name}` placeholders are React nodes (links, emphasis); kept apart from i18n.ts so the public pages
// (which do not ship React) do not pull it in.
import { createElement, Fragment, type ReactNode } from "react";
import { t } from "./i18n";

/** The text of the message is split around each placeholder, which is replaced by its node. */
export function rich(key: string, nodes: Record<string, ReactNode>, args: Record<string, unknown> = {}): ReactNode {
  const marques = Object.fromEntries(Object.keys(nodes).map((k) => [k, `\u0001${k}\u0001`]));
  const parts = t(key, { ...args, ...marques }).split(/\u0001(\w+)\u0001/);
  return createElement(
    Fragment,
    null,
    ...parts.map((p, i) => (i % 2 ? createElement(Fragment, { key: i }, nodes[p]) : p)),
  );
}
