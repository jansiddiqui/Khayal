import { buildDeck, CARD_FACES, isBoardCorrect, memoryMatchConfig } from "./memoryMatch/logic";
import { buildSequence, sequenceConfig } from "./sequenceRecall/logic";
import { shuffle } from "./types";

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

describe("memory match logic", () => {
  it("scales pairs 2 -> 10 and shortens the preview with level", () => {
    expect(memoryMatchConfig(1)).toEqual({ pairs: 2, previewMs: 6000 });
    expect(memoryMatchConfig(5).pairs).toBe(6);
    expect(memoryMatchConfig(9).pairs).toBe(10);
    expect(memoryMatchConfig(10)).toEqual({ pairs: 10, previewMs: 2400 });
    expect(memoryMatchConfig(99).pairs).toBe(10);
  });

  it("has enough everyday faces for the hardest level", () => {
    expect(CARD_FACES.length).toBeGreaterThanOrEqual(10);
  });

  it("builds a deck with exactly two of each chosen face", () => {
    const deck = buildDeck(6, seeded(1));
    expect(deck).toHaveLength(12);
    const counts = new Map<string, number>();
    deck.forEach((c) => counts.set(c.face, (counts.get(c.face) ?? 0) + 1));
    expect(counts.size).toBe(6);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
  });

  it("counts a board as correct when mistakes <= pairs", () => {
    expect(isBoardCorrect(0, 3)).toBe(true);
    expect(isBoardCorrect(3, 3)).toBe(true);
    expect(isBoardCorrect(4, 3)).toBe(false);
  });
});

describe("sequence recall logic", () => {
  it("scales sequence length 2 -> 7 with level", () => {
    const lengths = Array.from({ length: 10 }, (_, i) => sequenceConfig(i + 1).length);
    expect(lengths[0]).toBe(2);
    expect(lengths[9]).toBe(7);
    lengths.slice(1).forEach((len, i) => expect(len).toBeGreaterThanOrEqual(lengths[i]!));
  });

  it("never repeats a tile twice in a row", () => {
    for (let seed = 0; seed < 50; seed++) {
      const seq = buildSequence(7, seeded(seed));
      expect(seq).toHaveLength(7);
      seq.slice(1).forEach((tile, i) => expect(tile).not.toBe(seq[i]));
    }
  });
});

describe("shuffle", () => {
  it("keeps every item and does not mutate the input", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, seeded(7));
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});
