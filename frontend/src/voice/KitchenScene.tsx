/**
 * The voice-task picture: an original flat illustration of a busy Indian home kitchen with
 * several things happening at once, so there is a lot to describe. A mother cooks at the
 * stove while the milk boils over behind her, a child on a stool reaches for the laddoo jar,
 * a cat sniffs a spilled glass of milk, and it is raining outside. No text in the picture.
 * Same style as the Memory Match art: flat fills and a dark outline.
 */
const INK = "#1c1a17";
const LINE = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round" } as const;
const SKIN = "#a86b45";
const HAIR = "#2b1d16";
const WOOD = "#a8714c";
const MILK = "#fffdf6";

export function KitchenScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 360" className={className} role="img" aria-label="A picture of a busy kitchen">
      {/* Wall and tiled floor */}
      <rect x="0" y="0" width="480" height="292" fill="#f3e3c3" />
      <rect x="0" y="290" width="480" height="70" fill="#d08a5c" />
      <path d="M0 290h480M0 322h480M60 290l-14 70M150 290l-6 70M240 290v70M330 290l6 70M420 290l14 70" fill="none" stroke="#b4704a" strokeWidth="2" />
      <path d="M0 290h480" {...LINE} />

      {/* Window with rain */}
      <rect x="40" y="22" width="160" height="120" rx="4" fill="#8a5a3c" {...LINE} />
      <rect x="50" y="32" width="140" height="100" fill="#9bb8cf" {...LINE} />
      <path d="M62 62c0-10 12-14 18-8 4-10 22-10 26 0 8-4 18 2 16 10H62z" fill="#6b7f91" {...LINE} />
      <path d="M128 52c0-8 10-12 15-6 4-8 18-8 21 0 7-3 14 2 13 8h-49z" fill="#6b7f91" {...LINE} />
      <g stroke="#eaf2f8" strokeWidth="2.5" strokeLinecap="round">
        <path d="M66 76l-5 10M86 72l-5 10M104 80l-5 10M74 98l-5 10M96 104l-5 10M62 116l-4 8" />
        <path d="M140 70l-5 10M160 66l-5 10M178 74l-5 10M146 96l-5 10M168 100l-5 10M182 112l-4 8M132 118l-4 8" />
      </g>
      <path d="M120 32v100M50 82h140" fill="none" stroke="#8a5a3c" strokeWidth="6" />
      <rect x="32" y="140" width="176" height="9" rx="2" fill={WOOD} {...LINE} />

      {/* Shelf with a steel tin, the laddoo jar and a small pot */}
      <rect x="330" y="96" width="140" height="9" rx="2" fill={WOOD} {...LINE} />
      <path d="M346 105l12 14v-14M452 105l-12 14v-14" fill={WOOD} {...LINE} />
      <rect x="340" y="68" width="28" height="28" rx="3" fill="#c9d1d8" {...LINE} />
      <path d="M340 75h28" fill="none" {...LINE} />
      <rect x="398" y="58" width="40" height="38" rx="8" fill="#d6ecf2" {...LINE} />
      <rect x="402" y="50" width="32" height="9" rx="2" fill="#c0392b" {...LINE} />
      <g fill="#f0a030" {...LINE} strokeWidth="2">
        <circle cx="409" cy="86" r="6" />
        <circle cx="422" cy="87" r="6" />
        <circle cx="415" cy="75" r="6" />
        <circle cx="428" cy="75" r="5.5" />
      </g>
      <path d="M446 96c-4-14 2-22 10-22s14 8 10 22z" fill="#b5532f" {...LINE} />

      {/* Counter, cupboard doors and the stove */}
      <rect x="14" y="206" width="250" height="86" fill="#6f9b8f" {...LINE} />
      <rect x="24" y="216" width="110" height="66" rx="3" fill="#7fb0a2" {...LINE} />
      <rect x="142" y="216" width="112" height="66" rx="3" fill="#7fb0a2" {...LINE} />
      <circle cx="122" cy="249" r="3.5" fill={INK} />
      <circle cx="154" cy="249" r="3.5" fill={INK} />
      <rect x="8" y="196" width="262" height="12" rx="2" fill="#d9d4c7" {...LINE} />
      <rect x="40" y="181" width="190" height="16" rx="3" fill="#3a3a3a" {...LINE} />
      <circle cx="122" cy="189" r="3.5" fill="#c9d1d8" />
      <circle cx="140" cy="189" r="3.5" fill="#c9d1d8" />
      {/* Blue flames under both pans */}
      <path d="M72 181l5-8 4 8 5-9 4 9 5-8 4 8M170 181l5-8 4 8 5-9 4 9 5-8 4 8" fill="#3d8bfd" stroke="#1f5fbf" strokeWidth="1.5" strokeLinejoin="round" />

      {/* Steel milk pan, boiling over on the left burner */}
      <path d="M58 140h56v34a4 4 0 0 1-4 4H62a4 4 0 0 1-4-4z" fill="#b9c3cc" {...LINE} />
      <path d="M58 150H34" fill="none" {...LINE} strokeWidth="5" />
      <path
        d="M52 142c-6-4-2-14 6-12 0-10 14-12 18-4 4-8 18-8 20 0 6-6 18-2 16 8 8 0 10 10 2 12v10c0 4-6 4-6 0v-6h-2v22c0 5-7 5-7 0v-20H58v12c0 5-7 5-7 0z"
        fill={MILK}
        {...LINE}
      />
      <path d="M50 180c-2 4 2 8 8 8h30c4 0 4-6 0-6H58c-4 0-6-2-8-2z" fill={MILK} {...LINE} />

      {/* Kadai with vegetables on the right burner */}
      <path d="M148 166h74c-4 14-18 20-37 20s-33-6-37-20z" fill="#4a4a4a" {...LINE} />
      <path d="M144 166c-6 0-8-6-2-8M226 166c6 0 8-6 2-8" fill="none" {...LINE} />
      <ellipse cx="185" cy="166" rx="34" ry="5" fill="#e0902f" {...LINE} />
      <path d="M176 156c-4-6 4-8 0-14M194 156c-4-6 4-8 0-14" fill="none" stroke="#9aa3ab" strokeWidth="2.5" strokeLinecap="round" />

      {/* Mother at the stove, stirring the kadai with her back to the milk */}
      <path d="M248 142h38l18 148h-74z" fill="#d9467a" {...LINE} />
      <path d="M231 278h72l1 12h-74z" fill="#2e8b57" {...LINE} />
      <path d="M284 142l14 6 4 96-14-4z" fill="#f2a93b" {...LINE} />
      <path d="M256 156l-38 12" fill="none" stroke={INK} strokeWidth="13" strokeLinecap="round" />
      <path d="M256 156l-38 12" fill="none" stroke={SKIN} strokeWidth="8" strokeLinecap="round" />
      <path d="M216 169l-22 2" fill="none" stroke="#9aa3ab" strokeWidth="4" strokeLinecap="round" />
      <circle cx="267" cy="122" r="17" fill={SKIN} {...LINE} />
      <path d="M268 105c10 0 17 7 17 17 0 6-2 10-6 13-2-10-6-18-14-22-4-2-6-6 3-8z" fill={HAIR} {...LINE} />
      <circle cx="287" cy="114" r="8" fill={HAIR} {...LINE} />
      <circle cx="258" cy="120" r="2" fill={INK} />
      <circle cx="255" cy="113" r="1.8" fill="#c0392b" />

      {/* Child on a stool, on tiptoe, reaching for the laddoo jar */}
      <rect x="370" y="262" width="60" height="10" rx="2" fill={WOOD} {...LINE} />
      <path d="M378 272v18M422 272v18" fill="none" {...LINE} strokeWidth="5" />
      <path d="M393 240v20M407 240v20" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <path d="M393 240v20M407 240v20" fill="none" stroke={SKIN} strokeWidth="5" strokeLinecap="round" />
      <path d="M384 222h32l2 20h-36z" fill="#2c3e75" {...LINE} />
      <path d="M386 184h28l2 40h-32z" fill="#f5c242" {...LINE} />
      <path d="M410 190l10-84" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <path d="M410 190l10-84" fill="none" stroke={SKIN} strokeWidth="5" strokeLinecap="round" />
      <path d="M389 192l-6 26" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <path d="M389 192l-6 26" fill="none" stroke={SKIN} strokeWidth="5" strokeLinecap="round" />
      <circle cx="400" cy="168" r="15" fill={HAIR} {...LINE} />

      {/* A glass of milk knocked over on the floor, and the cat sniffing it */}
      <path d="M262 318l24-8 6 18-24 8z" fill="#dff1f7" {...LINE} />
      <ellipse cx="258" cy="338" rx="30" ry="6" fill={MILK} {...LINE} />
      <path d="M352 318c14-2 18-20 8-30" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
      <path d="M352 318c14-2 18-20 8-30" fill="none" stroke="#e08a3c" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="330" cy="322" rx="26" ry="14" fill="#e08a3c" {...LINE} />
      <path d="M318 334v8M340 334v8" fill="none" {...LINE} strokeWidth="5" />
      <circle cx="301" cy="326" r="11" fill="#e08a3c" {...LINE} />
      <path d="M293 318l-2-10 8 5M305 316l4-9 3 9" fill="#e08a3c" {...LINE} />
      <circle cx="296" cy="326" r="1.6" fill={INK} />
      <path d="M326 312l4 6M336 311l2 7" fill="none" stroke="#b0602a" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
