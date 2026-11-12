import { Art, STROKE, type ArtProps } from "./Art";

/** An auto-rickshaw from the side: green body, yellow canopy, two wheels. */
export function Rickshaw(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M10 22c0-6 6-10 14-10h22c5 0 8 4 8 9v1z" fill="#f4c430" {...STROKE} />
      <path d="M8 22h48v20H8z" fill="#2e8b57" {...STROKE} />
      <path d="M14 25h12v10H14z" fill="#e8f4fd" {...STROKE} />
      <path d="M36 25h14v10H36z" fill="#e8f4fd" {...STROKE} />
      <circle cx="17" cy="47" r="7" fill={"#2b2b2b"} {...STROKE} />
      <circle cx="47" cy="47" r="7" fill={"#2b2b2b"} {...STROKE} />
      <circle cx="17" cy="47" r="2.5" fill="#d9d9d9" />
      <circle cx="47" cy="47" r="2.5" fill="#d9d9d9" />
    </Art>
  );
}
