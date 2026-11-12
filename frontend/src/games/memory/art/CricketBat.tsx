import { Art, STROKE, type ArtProps } from "./Art";

/** A cricket bat with a red ball beside it. */
export function CricketBat(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M40 6l6 6-6 6-6-6z" fill="#5b3a1e" {...STROKE} />
      <path d="M37 15l6 6-22 34c-2 3-6 3-9 1s-3-5-1-8z" fill="#e3c08d" {...STROKE} />
      <circle cx="48" cy="46" r="8" fill="#c62828" {...STROKE} />
      <path d="M43 41c3 3 7 7 9 10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </Art>
  );
}
