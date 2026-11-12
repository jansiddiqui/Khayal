import { Art, STROKE, type ArtProps } from "./Art";

const PETALS = [0, 45, 90, 135, 180, 225, 270, 315];

/** A marigold flower: a ring of orange petals around a golden centre. */
export function Marigold(props: ArtProps) {
  return (
    <Art {...props}>
      {PETALS.map((deg) => (
        <ellipse key={deg} cx="32" cy="16" rx="8" ry="11" fill="#f28c28" transform={`rotate(${deg} 32 32)`} {...STROKE} />
      ))}
      <circle cx="32" cy="32" r="12" fill="#f5b700" {...STROKE} />
      <circle cx="32" cy="32" r="5" fill="#e07b00" />
    </Art>
  );
}
