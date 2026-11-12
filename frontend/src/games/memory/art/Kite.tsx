import { Art, STROKE, type ArtProps } from "./Art";

/** A diamond kite in two colours with a short tail. */
export function Kite(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M30 4L50 24 30 48 10 24z" fill="#1e88e5" {...STROKE} />
      <path d="M30 4L50 24H10z" fill="#e53935" {...STROKE} />
      <path d="M30 4v44" fill="none" {...STROKE} />
      <path d="M30 48c2 4-2 6 0 9s5 2 6 4" fill="none" {...STROKE} />
      <path d="M33 55l5-2-2 5z" fill="#f5b700" {...STROKE} />
    </Art>
  );
}
