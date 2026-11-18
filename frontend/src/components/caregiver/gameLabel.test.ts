import { gameLabel, PATIENT_TITLES } from "./GamesSettings";
import { GAME_NAMES } from "./TrendCharts";

describe("core games labels", () => {
  it("show the clinical name, what the patient sees, and the domain", () => {
    expect(gameLabel("object_location", "Visuospatial memory: where things are")).toBe(
      "Paired Associates (object location) — “Where did it go?” (Visuospatial memory: where things are)",
    );
    expect(gameLabel("memory_match")).toBe("Memory Match — “Find the Pairs”");
    // A game without its own screen (delayed recall) keeps only the clinical name.
    expect(gameLabel("word_recall_delayed")).toBe("Delayed Word Recall");
  });

  it("cover every game the patient can open", () => {
    for (const game of Object.keys(GAME_NAMES) as (keyof typeof GAME_NAMES)[]) {
      if (game !== "word_recall_delayed") expect(PATIENT_TITLES[game]).toBeTruthy();
    }
  });
});
