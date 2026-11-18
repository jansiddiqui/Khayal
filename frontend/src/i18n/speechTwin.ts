/**
 * Urdu text read with a Hindi voice (Round 2 batch 5). Spoken Urdu and spoken Hindi are the same
 * language, but a Hindi voice can't read Urdu script. When the elder's device has no Urdu voice,
 * read-aloud speaks the Hindi twin of each Urdu sentence instead.
 *
 * `withTwins(ur, hi)` returns the Urdu copy unchanged on screen, and records, for every Urdu string
 * it hands out, the matching Hindi string: plain strings and string lists up front, and function
 * results each time a function is called (its string arguments are first turned into their Hindi
 * twins, so "Tuesday, Wednesday, or Thursday?" built from Urdu day names comes out all in Hindi).
 * Text that is not from the copy (names, reminder titles typed by the family) is spoken as it is.
 */

type Fn = (...args: never[]) => unknown;

export interface Twinned<T> {
  copy: T;
  /** The Hindi version of `text`, sentence by sentence where the whole text is not known. */
  toHindi: (text: string) => string;
}

export function withTwins<T extends object>(ur: T, hi: T): Twinned<T> {
  const twins = new Map<string, string>();
  const remember = (u: unknown, h: unknown) => {
    if (typeof u === "string" && typeof h === "string" && u && h) twins.set(u, h);
  };
  const toHindiArg = (arg: unknown): unknown => {
    if (typeof arg === "string") return twins.get(arg) ?? arg;
    if (Array.isArray(arg)) return arg.map(toHindiArg);
    return arg;
  };

  const wrap = (u: unknown, h: unknown): unknown => {
    if (typeof u === "string") {
      remember(u, h);
      return u;
    }
    if (typeof u === "function" && typeof h === "function") {
      const fu = u as Fn;
      const fh = h as Fn;
      return (...args: never[]) => {
        const out = fu(...args);
        remember(out, fh(...(args.map(toHindiArg) as never[])));
        return out;
      };
    }
    if (Array.isArray(u) && Array.isArray(h)) return u.map((item, i) => wrap(item, h[i]));
    if (u && typeof u === "object" && h && typeof h === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(u)) out[key] = wrap(value, (h as Record<string, unknown>)[key]);
      return out;
    }
    return u;
  };

  const copy = wrap(ur, hi) as T;

  const toHindi = (text: string): string => {
    const whole = twins.get(text);
    if (whole !== undefined) return whole;
    // Sentences joined by the app ("title. intro", question + choices): translate each part.
    return text
      .split(/(?<=[.؟?!۔])\s+/)
      .map((part) => twins.get(part) ?? twins.get(part.replace(/[.۔]$/, "")) ?? part)
      .join(" ");
  };

  return { copy, toHindi };
}
