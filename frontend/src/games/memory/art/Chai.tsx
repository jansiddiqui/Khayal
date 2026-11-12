import { Art, STROKE, type ArtProps } from "./Art";

/** A clay kulhad of chai with two wisps of steam. */
export function Chai(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M24 8c-3 4 3 6 0 10M34 8c-3 4 3 6 0 10" fill="none" {...STROKE} />
      <path d="M14 24h36l-5 32H19z" fill="#c8642d" {...STROKE} />
      <ellipse cx="32" cy="24" rx="18" ry="5" fill="#8b4a1c" {...STROKE} />
      <path d="M17 38h30" fill="none" stroke="#9c4a1f" strokeWidth="3" strokeLinecap="round" />
    </Art>
  );
}
