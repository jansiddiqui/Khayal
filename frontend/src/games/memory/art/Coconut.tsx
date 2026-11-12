import { Art, STROKE, type ArtProps } from "./Art";

/** A coconut cut in half: brown shell, white flesh. */
export function Coconut(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M6 30h52a26 26 0 0 1-52 0z" fill="#7b4a2a" {...STROKE} />
      <path d="M12 30h40a20 20 0 0 1-40 0z" fill="#fffaf0" {...STROKE} />
      <ellipse cx="32" cy="30" rx="26" ry="6" fill="#7b4a2a" {...STROKE} />
      <ellipse cx="32" cy="30" rx="19" ry="3.5" fill="#fffaf0" />
    </Art>
  );
}
