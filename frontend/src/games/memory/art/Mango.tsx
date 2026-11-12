import { Art, STROKE, type ArtProps } from "./Art";

/** A ripe mango, long and tilted, with its stem and one leaf. */
export function Mango(props: ArtProps) {
  return (
    <Art {...props}>
      <ellipse cx="30" cy="38" rx="15" ry="22" transform="rotate(35 30 38)" fill="#f4a628" {...STROKE} />
      <path d="M22 50c-4-4-5-10-3-15" fill="none" stroke="#e07b00" strokeWidth="3" strokeLinecap="round" />
      <path d="M41 21l4-7" fill="none" {...STROKE} />
      <path d="M45 14c6-6 14-5 17-1-5 6-12 7-17 1z" fill="#3e8e41" {...STROKE} />
    </Art>
  );
}
