// Inline SVG icons and responsive images (AVIF then WebP, hashed files with an immutable cache) of the showcase.
import type { ImgHTMLAttributes } from "react";
import { ICONES } from "./icones.gen";
import { IMAGES } from "./images.gen";

/** Decorative icon: `.btp-icone` box sized by the CSS (glyph size = font-size), drawn at 1em. */
export function Icone({ nom }: { nom: keyof typeof ICONES }) {
  return (
    <span className="btp-icone" aria-hidden="true">
      <svg viewBox="0 -960 960 960" width="1em" height="1em" fill="currentColor" focusable="false">
        <path d={ICONES[nom]} />
      </svg>
    </span>
  );
}

const srcset = (variantes: readonly (readonly [string, number])[]) =>
  variantes.map(([u, l]) => `${u} ${l}w`).join(", ");

/** AVIF `srcset` of an image (also used by the index.html preload, checked by serveur.test.ts). */
export const srcsetAvif = (nom: keyof typeof IMAGES) => srcset(IMAGES[nom].avif);

/** `<picture>` AVIF/WebP at the intrinsic dimensions of the original (no layout shift). */
export function Image({
  nom,
  sizes,
  className,
  ...img
}: { nom: keyof typeof IMAGES; sizes: string; className?: string } & Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "srcSet" | "sizes" | "width" | "height"
>) {
  const i = IMAGES[nom];
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={srcset(i.avif)} sizes={sizes} />
      <img
        src={i.webp[i.webp.length - 1]![0]}
        srcSet={srcset(i.webp)}
        sizes={sizes}
        width={i.largeur}
        height={i.hauteur}
        decoding="async"
        {...img}
      />
    </picture>
  );
}
