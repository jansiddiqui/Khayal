import { Art, STROKE, type ArtProps } from "./Art";

/** An elephant from the side, trunk curled down. */
export function Elephant(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M22 22h22c8 0 12 6 12 14v8H18V30c0-5 2-8 4-8z" fill="#8e8e93" {...STROKE} />
      <path d="M22 44v10h7V44M42 44v10h7V44" fill="#8e8e93" {...STROKE} />
      <circle cx="17" cy="28" r="10" fill="#8e8e93" {...STROKE} />
      <path d="M9 32c-3 6-2 13 3 17" fill="none" stroke="#1c1a17" strokeWidth="7" strokeLinecap="round" />
      <path d="M9 32c-3 6-2 13 3 17" fill="none" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 21c6-3 11 1 10 8-1 6-6 8-10 6z" fill="#b5b5ba" {...STROKE} />
      <circle cx="14" cy="26" r="1.8" fill="#1c1a17" />
    </Art>
  );
}
