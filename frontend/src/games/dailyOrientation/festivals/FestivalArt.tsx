import type { ComponentType } from "react";
import { Art, STROKE, type ArtProps } from "../../memory/art/Art";
import { Diya } from "../../memory/art/Diya";
import { Elephant } from "../../memory/art/Elephant";
import { Kite } from "../../memory/art/Kite";
import type { FestivalId } from "./index";

/**
 * One simple picture per festival, in the Memory Match style (64×64, flat fills, 3px outline):
 * everyday objects of the day, never people or faces, always shown with the festival's name.
 */

function Colours(props: ArtProps) {
  return (
    <Art {...props}>
      <circle cx="22" cy="24" r="14" fill="#e0457b" {...STROKE} />
      <circle cx="42" cy="26" r="13" fill="#f5b700" {...STROKE} />
      <circle cx="32" cy="43" r="14" fill="#2e9e5b" {...STROKE} />
    </Art>
  );
}

function Crescent(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M38 8a24 24 0 1 0 18 38A20 20 0 1 1 38 8z" fill="#f2c14e" {...STROKE} />
      <path d="M48 16l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" fill="#f2c14e" {...STROKE} />
    </Art>
  );
}

/** Muharram: the thin new moon that starts the year, outlined (not the Eid crescent and star). */
function NewMoon(props: ArtProps) {
  return (
    <Art {...props}>
      <circle cx="32" cy="32" r="26" fill="#1f3b4d" {...STROKE} />
      <path d="M40 10a22 22 0 1 1-22 38a26 26 0 0 0 22-38z" fill="#f2c14e" {...STROKE} />
    </Art>
  );
}

/** Milad-un-Nabi: a hanging lantern, as lights are put up for the day. */
function Lantern(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M32 4v8" fill="none" {...STROKE} />
      <path d="M24 12h16l-2 6H26z" fill="#2e9e5b" {...STROKE} />
      <path d="M22 18h20c4 10 4 22 0 32H22c-4-10-4-22 0-32z" fill="#f5b700" {...STROKE} />
      <path d="M32 22v24M26 34h12" fill="none" stroke="#e65100" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 50h16l-3 6H27z" fill="#2e9e5b" {...STROKE} />
    </Art>
  );
}

function Wheat(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M32 60V14" fill="none" {...STROKE} />
      {[16, 26, 36].map((y) => (
        <g key={y}>
          <ellipse cx="25" cy={y} rx="5" ry="8" transform={`rotate(-30 25 ${y})`} fill="#e0a526" {...STROKE} />
          <ellipse cx="39" cy={y} rx="5" ry="8" transform={`rotate(30 39 ${y})`} fill="#e0a526" {...STROKE} />
        </g>
      ))}
      <ellipse cx="32" cy="8" rx="4" ry="7" fill="#e0a526" {...STROKE} />
    </Art>
  );
}

function Rakhi(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M4 34c10-6 18-6 28 0s18 6 28 0" fill="none" stroke="#c1502e" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="33" r="14" fill="#f5b700" {...STROKE} />
      <circle cx="32" cy="33" r="6" fill="#e65100" {...STROKE} />
    </Art>
  );
}

function Flute(props: ArtProps) {
  return (
    <Art {...props}>
      <rect x="4" y="27" width="56" height="10" rx="5" transform="rotate(-30 32 32)" fill="#c88a4a" {...STROKE} />
      {[-14, -5, 4, 13].map((d) => (
        <circle key={d} cx={32 + d * 0.87} cy={32 - d * 0.5} r="2" fill="#1c1a17" />
      ))}
      <path d="M50 46c4-6 10-6 10 0s-6 8-10 4z" fill="#1f8a7a" {...STROKE} />
    </Art>
  );
}

function Star(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M32 6l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 23l16-2z" fill="#f5b700" {...STROKE} />
      <path d="M32 56v4" fill="none" {...STROKE} />
    </Art>
  );
}

function Lights(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M4 14c10 8 46 8 56 0" fill="none" {...STROKE} />
      {[14, 32, 50].map((x) => (
        <g key={x}>
          <path d={`M${x} ${x === 32 ? 20 : 18}v4`} fill="none" {...STROKE} />
          <path d={`M${x} ${x === 32 ? 24 : 22}c-7 6-7 14 0 20 7-6 7-14 0-20z`} fill="#f5b700" {...STROKE} />
        </g>
      ))}
    </Art>
  );
}

function Pot(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M18 24c-10 6-12 30 14 34 26-4 24-28 14-34z" fill="#c1502e" {...STROKE} />
      <path d="M16 24h32" fill="none" {...STROKE} />
      <path d="M18 24c0-8 6-10 8-6 2-6 10-6 12 0 2-4 8-2 8 6z" fill="#fff8e7" {...STROKE} />
      <path d="M20 40h24" fill="none" stroke="#f2c14e" strokeWidth="3" strokeLinecap="round" />
    </Art>
  );
}

function FlowerCarpet(props: ArtProps) {
  return (
    <Art {...props}>
      <circle cx="32" cy="32" r="27" fill="#2e9e5b" {...STROKE} />
      <circle cx="32" cy="32" r="19" fill="#f5b700" {...STROKE} />
      <circle cx="32" cy="32" r="11" fill="#e65100" {...STROKE} />
      <circle cx="32" cy="32" r="4" fill="#fff8e7" {...STROKE} />
    </Art>
  );
}

function Drum(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M12 18h40v28H12z" fill="#c1502e" {...STROKE} />
      <ellipse cx="32" cy="18" rx="20" ry="7" fill="#fff8e7" {...STROKE} />
      <path d="M12 46c0 4 9 7 20 7s20-3 20-7" fill="none" {...STROKE} />
      <path d="M12 22l40 20M52 22L12 42" fill="none" stroke="#f2c14e" strokeWidth="3" />
    </Art>
  );
}

function BowArrow(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M14 6c22 10 22 42 0 52" fill="none" stroke="#8a5a2b" strokeWidth="6" strokeLinecap="round" />
      <path d="M14 6v52" fill="none" {...STROKE} />
      <path d="M6 32h50" fill="none" {...STROKE} />
      <path d="M50 26l8 6-8 6z" fill="#1c1a17" {...STROKE} />
    </Art>
  );
}

export const FESTIVAL_ART: Record<FestivalId, ComponentType<ArtProps>> = {
  makar_sankranti: Kite,
  pongal: Pot,
  holi: Colours,
  eid_ul_fitr: Crescent,
  vaisakhi: Wheat,
  bakrid: Crescent,
  muharram: NewMoon,
  milad_un_nabi: Lantern,
  onam: FlowerCarpet,
  raksha_bandhan: Rakhi,
  janmashtami: Flute,
  ganesh_chaturthi: Elephant,
  durga_puja: Drum,
  dussehra: BowArrow,
  diwali: Diya,
  guru_nanak_jayanti: Lights,
  christmas: Star,
};
