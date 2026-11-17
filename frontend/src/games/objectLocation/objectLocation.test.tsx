import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { copy } from "../../copy";
import { buildBoard, OBJECTS, objectLocationConfig } from "./logic";
import { ObjectLocationRound } from "./ObjectLocation";
import { PHOTO_FILES } from "./photos";
import log from "../../../../docs/games/image-sources.md?raw";

const t = copy.games.objectLocation;
const rng = () => 0.42;

describe("Where did it go? logic", () => {
  it("follows the levels in research.md 2.1", () => {
    expect(objectLocationConfig(1)).toEqual({ objects: 2, boxes: 4, cols: 2, similar: false });
    expect(objectLocationConfig(4)).toEqual({ objects: 4, boxes: 6, cols: 2, similar: false });
    expect(objectLocationConfig(8)).toEqual({ objects: 6, boxes: 9, cols: 3, similar: true });
    expect(objectLocationConfig(10)).toEqual({ objects: 8, boxes: 9, cols: 3, similar: false });
    expect(objectLocationConfig(3, true)).toEqual({ objects: 1, boxes: 4, cols: 2, similar: false });
  });

  it("puts each object in its own box and asks in a different order", () => {
    for (let level = 1; level <= 10; level++) {
      const config = objectLocationConfig(level);
      const board = buildBoard(config, Math.random);
      expect(new Set(board.placements.map((p) => p.box)).size).toBe(config.objects);
      expect(new Set(board.placements.map((p) => p.object)).size).toBe(config.objects);
      expect(board.placements.every((p) => p.box < config.boxes)).toBe(true);
      expect([...board.askOrder].sort()).toEqual(board.placements.map((p) => p.object).sort());
      if (config.objects > 1) expect(board.askOrder).not.toEqual(board.placements.map((p) => p.object));
      if (config.similar) {
        const kinds = new Set(board.placements.map((p) => OBJECTS.find((o) => o.id === p.object)!.kind));
        expect([...kinds]).toEqual(["household"]);
      }
    }
  });

  it("every object has a WebP and a JPEG photo, and every photo is in the licence log", () => {
    for (const o of OBJECTS) {
      expect(PHOTO_FILES).toContain(`${o.id}.webp`);
      expect(PHOTO_FILES).toContain(`${o.id}.jpg`);
    }
    for (const file of PHOTO_FILES) {
      const stem = file.replace(/\.(webp|jpg)$/, "");
      expect(log).toContain(`objectLocation/photos/${stem}.{webp,jpg}`);
    }
    const logged = [...log.matchAll(/`objectLocation\/photos\/(\w+)\.\{webp,jpg\}`/g)].map((m) => m[1]);
    for (const stem of logged) expect(PHOTO_FILES).toContain(`${stem}.webp`);
  });
});

describe("Where did it go? round", () => {
  const board = buildBoard(objectLocationConfig(1), rng);
  const boxOf = (id: string) => board.placements.find((p) => p.object === id)!.box;
  const tapBox = (box: number) => fireEvent.click(screen.getByRole("button", { name: t.box(box + 1) }));
  const study = () => {
    fireEvent.click(screen.getByRole("button", { name: t.next }));
    fireEvent.click(screen.getByRole("button", { name: t.ready }));
  };

  it("shows each object in its box, then asks where each one was", () => {
    const onComplete = vi.fn();
    render(<ObjectLocationRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    const first = board.placements[0]!;
    expect(screen.getByRole("button", { name: t.boxWith(first.box + 1, copy.objects[first.object]) })).toBeInTheDocument();
    study();
    for (const id of board.askOrder) {
      expect(screen.getByText(t.whereWas(copy.objects[id]))).toBeInTheDocument();
      tapBox(boxOf(id));
    }
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: true, hint_used: false, errors: 0 }));
    expect(onComplete.mock.calls[0]![0].study_ms).toBeGreaterThanOrEqual(0);
  });

  it("shows misplaced ones again and gives a second try, which counts as a hint", () => {
    const onComplete = vi.fn();
    render(<ObjectLocationRound level={1} roundIndex={0} onComplete={onComplete} rng={rng} />);
    study();
    const [a, b] = board.askOrder as [string, string];
    const wrongBox = [0, 1, 2, 3].find((x) => x !== boxOf(a) && x !== boxOf(b))!;
    tapBox(wrongBox);
    tapBox(boxOf(b));
    expect(screen.getByText(t.again)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.next }));
    expect(screen.getByText(t.whereWas(copy.objects[a as keyof typeof copy.objects]))).toBeInTheDocument();
    tapBox(boxOf(a));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: true, hint_used: true, errors: 1 }));
  });

  it("practice points to the right box after a slip", () => {
    const onComplete = vi.fn();
    render(<ObjectLocationRound level={1} practice roundIndex={0} onComplete={onComplete} rng={rng} />);
    const practice = buildBoard(objectLocationConfig(1, true), rng);
    fireEvent.click(screen.getByRole("button", { name: t.ready }));
    const right = practice.placements[0]!.box;
    tapBox((right + 1) % 4);
    expect(screen.getByText(t.practiceHint)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    tapBox(right);
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
