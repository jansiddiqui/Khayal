import { copy } from "../copy";
import { buildQuestion, seasonOf, timeOfDayOf } from "./dailyOrientation/logic";
import { redChance, waitMs } from "./reactionTap/logic";
import {
  buildWordRound,
  isRecallCorrect,
  missingFirstLetters,
  recallScore,
  WORDS,
  wordCount,
  type WordId,
} from "./wordRecall/logic";

const rng = () => 0.37;

describe("word recall logic", () => {
  it("shows 3 words at level 1 rising to 8 at level 10", () => {
    expect(wordCount(1)).toBe(3);
    expect(wordCount(10)).toBe(8);
    const counts = Array.from({ length: 10 }, (_, i) => wordCount(i + 1));
    counts.slice(1).forEach((c, i) => expect(c).toBeGreaterThanOrEqual(counts[i]!));
  });

  it("has enough everyday words for 8 shown + 8 new", () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(16);
    expect(WORDS).toEqual(expect.arrayContaining(["tea", "bus", "temple", "rice", "umbrella", "market", "doctor", "train", "garden", "mirror"]));
  });

  it("offers the shown words plus the same number of new ones", () => {
    const { shown, options } = buildWordRound(5, rng);
    expect(shown).toHaveLength(5);
    expect(options).toHaveLength(10);
    expect(new Set(options).size).toBe(10);
    shown.forEach((w) => expect(options).toContain(w));
  });

  it("scores (found − wrong) / shown with a 0.8 pass mark", () => {
    const shown: WordId[] = ["tea", "bus", "rice", "train", "garden"];
    expect(recallScore(shown, new Set<WordId>(["tea", "bus", "rice", "train", "garden"]))).toBe(1);
    expect(isRecallCorrect(shown, new Set<WordId>(["tea", "bus", "rice", "train"]))).toBe(true); // 0.8
    expect(isRecallCorrect(shown, new Set<WordId>(["tea", "bus", "rice", "train", "garden", "milk"]))).toBe(true); // 0.8
    expect(isRecallCorrect(shown, new Set<WordId>(["tea", "bus", "rice", "train", "milk"]))).toBe(false); // 0.6
    expect(recallScore(shown, new Set<WordId>(["milk", "lamp"]))).toBe(0); // never negative
  });

  it("gives the first letter of each word not yet picked", () => {
    const shown: WordId[] = ["tea", "bus", "temple"];
    expect(missingFirstLetters(shown, new Set<WordId>(["bus"]))).toEqual(["T", "T"]);
  });
});

describe("daily orientation logic", () => {
  it("maps months to the three Indian seasons", () => {
    const season = (m: number) => seasonOf(new Date(2026, m, 15));
    expect([0, 1, 9, 10, 11].map(season)).toEqual(Array(5).fill("winter"));
    expect([2, 3, 4].map(season)).toEqual(Array(3).fill("summer"));
    expect([5, 6, 7, 8].map(season)).toEqual(Array(4).fill("monsoon"));
  });

  it("maps hours to morning, afternoon and evening", () => {
    const at = (h: number) => timeOfDayOf(new Date(2026, 10, 4, h));
    expect([5, 11].map(at)).toEqual(["morning", "morning"]);
    expect([12, 16].map(at)).toEqual(["afternoon", "afternoon"]);
    expect([17, 23, 2].map(at)).toEqual(["evening", "evening", "evening"]);
  });

  const wednesday = new Date(2026, 10, 4, 10, 30); // Wed 4 Nov 2026, morning

  it("asks day, month, season, time of day and city, with kind replies", () => {
    const qs = [0, 1, 2, 3, 4].map((i) => buildQuestion(i, wednesday, "Pune", rng));
    expect(qs.map((q) => q.answer)).toEqual(["Wednesday", "November", "Winter", "Morning", "Pune"]);
    expect(qs[0]!.reply).toBe("It's Wednesday today.");
    expect(qs[3]!.reply).toBe("It's morning now.");
    expect(qs[4]!.reply).toBe("You're in Pune.");
    qs.forEach((q) => {
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.options.length).toBeLessThanOrEqual(4);
    });
    expect(qs[2]!.options).toHaveLength(3);
  });

  it("asks for the year when no city is set", () => {
    const q = buildQuestion(4, wednesday, null, rng);
    expect(q.prompt).toBe(copy.games.orientation.askYear);
    expect(q.answer).toBe("2026");
  });

  it("does not offer the patient's city twice", () => {
    const q = buildQuestion(4, wednesday, "mumbai", rng);
    expect(q.options.filter((o) => o.toLowerCase() === "mumbai")).toHaveLength(1);
  });
});

describe("reaction tap logic", () => {
  it("waits 2–5 seconds", () => {
    expect(waitMs(() => 0)).toBe(2000);
    expect(waitMs(() => 0.999999)).toBe(5000);
  });

  it("adds red circles from level 4, up to 40%", () => {
    expect([1, 2, 3].map(redChance)).toEqual([0, 0, 0]);
    expect(redChance(4)).toBeCloseTo(0.1);
    expect(redChance(10)).toBeCloseTo(0.4);
    for (let l = 5; l <= 10; l++) expect(redChance(l)).toBeGreaterThan(redChance(l - 1));
  });
});
