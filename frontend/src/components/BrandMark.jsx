import React from "react";
import site from "../config/site.js";
import { markDataUri } from "../utils/metadata.js";

// Marca oficial = o próprio símbolo do favicon. Renderiza o vetor SVG original
// (data-URI, sem arquivo físico) como imagem, então header público, sidebar do
// admin e aba do navegador mostram exatamente o mesmo desenho em qualquer
// tamanho. Decorativa: o nome da marca acompanha em texto ao lado.
export default function BrandMark({ className = "", size = 34 }) {
  const src = markDataUri(site.logo, site.metadata?.faviconVariant);
  if (!src) return null;
  return (
    <img
      className={`brand-mark${className ? ` ${className}` : ""}`}
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable="false"
    />
  );
}
