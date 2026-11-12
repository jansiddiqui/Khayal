import { Art, STROKE, type ArtProps } from "./Art";

/** A clay diya with its flame. */
export function Diya(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M32 6c6 7 8 12 8 16a8 8 0 0 1-16 0c0-4 2-9 8-16z" fill="#f5b700" {...STROKE} />
      <path d="M32 16c2 3 3 5 3 7a3 3 0 0 1-6 0c0-2 1-4 3-7z" fill="#e65100" />
      <path d="M6 34h52c-2 12-12 20-26 20S8 46 6 34z" fill="#c1502e" {...STROKE} />
      <path d="M14 40h36" fill="none" stroke="#f2c14e" strokeWidth="3" strokeLinecap="round" />
    </Art>
  );
}
