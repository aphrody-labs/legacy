// DynamicScheme variants of Material Color Utilities, shared by the generators (adapters.ts; build.ts and runtime.ts
// can import it instead of redeclaring the table).
import {
  argbFromHex,
  Hct,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeTonalSpot,
  SchemeVibrant,
  type DynamicScheme,
} from "@material/material-color-utilities";

export type Variant =
  | "tonal-spot"
  | "vibrant"
  | "expressive"
  | "content"
  | "fidelity"
  | "monochrome"
  | "neutral";

export const SCHEMES: Record<
  Variant,
  new (h: Hct, dark: boolean, contrast: number) => DynamicScheme
> = {
  "tonal-spot": SchemeTonalSpot,
  vibrant: SchemeVibrant,
  expressive: SchemeExpressive,
  content: SchemeContent,
  fidelity: SchemeFidelity,
  monochrome: SchemeMonochrome,
  neutral: SchemeNeutral,
};

/** DynamicScheme of a hex seed for a variant, a mode and a contrast (0, 0.5, 1). */
export function dynamicScheme(
  seed: string,
  variant: string,
  dark = false,
  contrast = 0,
): DynamicScheme {
  const S = SCHEMES[variant as Variant];
  if (!S) throw new Error(`variante inconnue : ${variant}`);
  return new S(Hct.fromInt(argbFromHex(seed)), dark, contrast);
}
