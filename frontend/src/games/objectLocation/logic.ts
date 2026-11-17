import type { copy } from "../../copy";
import { shuffle, type Rng } from "../types";

/**
 * "Where did it go?" (object location, after the CANTAB PAL task idea; docs/games/research.md 2.1).
 * Everyday objects are shown one at a time, each in its own box; then each object appears in the
 * middle and the patient taps the box where it was.
 */

export type ObjectId = keyof typeof copy.objects;
export type ObjectKind = "household" | "food";

/** Every object has a photo in ./photos (docs/games/image-sources.md). */
export const OBJECTS: readonly { id: ObjectId; kind: ObjectKind }[] = [
  { id: "key", kind: "household" },
  { id: "glasses", kind: "household" },
  { id: "lock", kind: "household" },
  { id: "comb", kind: "household" },
  { id: "cup", kind: "household" },
  { id: "umbrella", kind: "household" },
  { id: "spoon", kind: "household" },
  { id: "banana", kind: "food" },
  { id: "tomato", kind: "food" },
  { id: "onion", kind: "food" },
];

export interface ObjectLocationConfig {
  objects: number;
  boxes: 4 | 6 | 9;
  /** Grid columns: 2×2, 2×3 (2 columns, 3 rows, for a phone held upright) or 3×3. */
  cols: 2 | 3;
  /** All objects from one kind (household things look more alike than a mix). */
  similar: boolean;
}

const LEVELS: readonly [objects: number, boxes: 4 | 6 | 9, similar?: boolean][] = [
  [2, 4],
  [2, 6],
  [3, 6],
  [4, 6],
  [4, 9],
  [5, 9],
  [6, 9],
  [6, 9, true],
  [7, 9],
  [8, 9],
];

/** Levels 1–10 from research.md 2.1; the practice round is easier still (1 object, 4 boxes). */
export function objectLocationConfig(level: number, practice = false): ObjectLocationConfig {
  if (practice) return { objects: 1, boxes: 4, cols: 2, similar: false };
  const l = Math.min(10, Math.max(1, Math.round(level)));
  const [objects, boxes, similar = false] = LEVELS[l - 1]!;
  return { objects, boxes, cols: boxes === 9 ? 3 : 2, similar };
}

export interface Placement {
  object: ObjectId;
  box: number;
}

export interface Board {
  /** In the order they are shown while studying. */
  placements: Placement[];
  /** The order the objects are asked about (different from the study order). */
  askOrder: ObjectId[];
}

export function buildBoard(config: ObjectLocationConfig, rng: Rng): Board {
  const pool = config.similar ? OBJECTS.filter((o) => o.kind === "household") : OBJECTS;
  const objects = shuffle(pool, rng).slice(0, config.objects).map((o) => o.id);
  const boxes = shuffle(
    Array.from({ length: config.boxes }, (_, i) => i),
    rng,
  ).slice(0, config.objects);
  const placements = objects.map((object, i) => ({ object, box: boxes[i]! }));
  let askOrder = shuffle(objects, rng);
  // Asking in the same order as shown makes it a sequence task; turn it round if so.
  if (objects.length > 1 && askOrder.every((o, i) => o === objects[i])) askOrder = [...askOrder].reverse();
  return { placements, askOrder };
}

/** Median of a non-empty list (reaction time per placement, as PAL reports per trial). */
export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}
