import { Art, STROKE, type ArtProps } from "./Art";

/** A round roti with a few toasted spots. */
export function Roti(props: ArtProps) {
  return (
    <Art {...props}>
      <circle cx="32" cy="32" r="25" fill="#ecc47e" {...STROKE} />
      <g fill="#b07a3b">
        <circle cx="24" cy="24" r="4" />
        <circle cx="40" cy="22" r="3" />
        <circle cx="38" cy="38" r="5" />
        <circle cx="22" cy="40" r="3" />
        <circle cx="31" cy="31" r="2" />
      </g>
    </Art>
  );
}
