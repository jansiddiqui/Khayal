import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import * as apiClient from "../api/client";
import type { FamilyMember, User } from "../api/client";
import { App } from "../App";
import { copy } from "../copy";
import { buildQuestion, buildWhoIsThisQuestion, canAskWhoIsThis } from "../games/dailyOrientation/logic";
import { DailyOrientationRound } from "../games/dailyOrientation/DailyOrientation";
import { renderWithProviders } from "../test/renderWithProviders";
import { photoProblem } from "./caregiver/Family";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    getMe: vi.fn(),
    listPatients: vi.fn(),
    listFamily: vi.fn(),
    createFamilyMember: vi.fn(),
    updateFamilyMember: vi.fn(),
    deleteFamilyMember: vi.fn(),
    uploadFamilyPhoto: vi.fn(),
    deleteFamilyPhoto: vi.fn(),
    fetchPhotoBlob: vi.fn(),
  };
});
const api = vi.mocked(apiClient);

const kamala: User = { id: 2, name: "Kamala Devi", email: "k@khayal.test", role: "patient", created_at: "", city: "Pune", pinned_games: null, voice_task_enabled: false, voice_consent_at: null };
const priya: User = { id: 1, name: "Priya", email: "p@khayal.test", role: "caregiver", created_at: "", city: null, pinned_games: null, voice_task_enabled: false, voice_consent_at: null };

function person(id: number, name: string, relation: string, photos: number, note: string | null = null): FamilyMember {
  return {
    id,
    patient_id: 2,
    name,
    relation,
    note,
    photos: Array.from({ length: photos }, (_, i) => ({
      id: `${id}${"0".repeat(31)}`.slice(0, 31) + i,
      url: `/patients/2/family/${id}/photos/p${id}${i}`,
    })),
  };
}

const rahul = person(1, "Rahul", "Grandson", 2, "Lives in Pune, visits on Sundays.");
const meena = person(2, "Meena", "Daughter", 1);
const anil = person(3, "Anil", "Son", 1);
const noPhoto = person(4, "Sita", "Friend", 0);

function signInAs(user: User) {
  localStorage.setItem("khayal.token", "t");
  api.getMe.mockResolvedValue(user);
}

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchPhotoBlob.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
});

describe("who-is-this wording", () => {
  it("names the relation, and reads the note after it", () => {
    expect(copy.whoIsThis.thisIs("Rahul", "Grandson")).toBe("This is Rahul, your grandson.");
    expect(copy.whoIsThis.thisIs("Sita", "Other")).toBe("This is Sita.");
    expect(copy.whoIsThis.thisIs("Raju", "Neighbour")).toBe("This is Raju, your neighbour.");
    expect(copy.whoIsThis.spoken("Rahul", "Grandson", "Lives in Pune, visits on Sundays.")).toBe(
      "This is Rahul, your grandson. Lives in Pune, visits on Sundays.",
    );
    expect(copy.whoIsThis.spoken("Meena", "Daughter", null)).toBe("This is Meena, your daughter.");
  });
});

describe("About Today 'Who is this?' question", () => {
  const rng = () => 0.3;

  it("needs 3 or more people with photos and different names", () => {
    expect(canAskWhoIsThis([rahul, meena, anil])).toBe(true);
    expect(canAskWhoIsThis([rahul, meena, noPhoto])).toBe(false);
    expect(canAskWhoIsThis([rahul, meena, { ...anil, name: "rahul" }])).toBe(false);
    expect(canAskWhoIsThis(undefined)).toBe(false);
  });

  it("offers one photo and 3 different names including the right one", () => {
    for (let seed = 0; seed < 10; seed++) {
      const q = buildWhoIsThisQuestion([rahul, meena, anil, noPhoto], () => (seed / 10 + 0.05) % 1);
      expect(q.options).toHaveLength(3);
      expect(new Set(q.options).size).toBe(3);
      expect(q.options).toContain(q.answer);
      expect(q.options).not.toContain("Sita"); // no photo, never offered
      const who = [rahul, meena, anil].find((m) => m.name === q.answer)!;
      expect(who.photos.map((p) => p.url)).toContain(q.photoUrl);
      expect(q.reply).toBe(copy.whoIsThis.thisIs(who.name, who.relation));
    }
  });

  it("replaces the city question only when enough photos exist", () => {
    const now = new Date(2026, 10, 4, 10);
    expect(buildQuestion(4, now, "Pune", rng, [rahul, meena, anil]).prompt).toBe(copy.games.orientation.askWhoIsThis);
    expect(buildQuestion(4, now, "Pune", rng, [rahul, meena]).prompt).toBe(copy.games.orientation.askCity);
    expect(buildQuestion(4, now, null, rng, []).prompt).toBe(copy.games.orientation.askYear);
  });

  it("shows the photo and replies kindly with the person's name", async () => {
    signInAs(kamala);
    api.listFamily.mockResolvedValue([rahul, meena, anil]);
    const onComplete = vi.fn();
    renderWithProviders(<DailyOrientationRound level={1} roundIndex={4} onComplete={onComplete} rng={() => 0} />);

    expect(await screen.findByText(copy.games.orientation.askWhoIsThis)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("img", { name: copy.games.orientation.askWhoIsThis })).toHaveAttribute("src", "blob:test-photo"),
    );
    expect(api.listFamily).toHaveBeenCalledWith(2);
    const choices = screen.getAllByRole("button");
    expect(choices).toHaveLength(3);

    const wrong = choices.find((c) => !c.textContent?.includes("Rahul"))!;
    fireEvent.click(wrong);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ correct: false }), "This is Rahul, your grandson.");
  });

  it("asks the city when there are not enough photos", async () => {
    signInAs(kamala);
    api.listFamily.mockResolvedValue([rahul]);
    renderWithProviders(<DailyOrientationRound level={1} roundIndex={4} onComplete={vi.fn()} rng={() => 0} />);
    expect(await screen.findByText(copy.games.orientation.askCity)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pune" })).toBeInTheDocument();
  });
});

describe("patient Who is this?", () => {
  const spoken: string[] = [];

  beforeEach(() => {
    signInAs(kamala);
    spoken.length = 0;
    localStorage.setItem("khayal.readAloud", "on");
    vi.stubGlobal("SpeechSynthesisUtterance", class {
      constructor(public text: string) {}
    });
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak: (u: { text: string }) => spoken.push(u.text) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows every photo with name and relation, and skips people without photos", async () => {
    api.listFamily.mockResolvedValue([rahul, meena, noPhoto]);
    renderWithProviders(<App />, { route: "/patient/who-is-this" });
    const tiles = await screen.findAllByRole("button", { name: /, / });
    expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual(["Rahul, Grandson", "Rahul, Grandson", "Meena, Daughter"]);
    expect(screen.queryByText("Sita")).toBeNull();
  });

  it("opens a photo big, reads who it is aloud, and goes back", async () => {
    api.listFamily.mockResolvedValue([rahul, meena]);
    renderWithProviders(<App />, { route: "/patient/who-is-this" });
    fireEvent.click((await screen.findAllByRole("button", { name: "Rahul, Grandson" }))[0]!);

    expect(screen.getByRole("heading", { name: "Rahul" })).toBeInTheDocument();
    expect(screen.getByText("This is Rahul, your grandson.")).toBeInTheDocument();
    expect(screen.getByText("Lives in Pune, visits on Sundays.")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: copy.whoIsThis.photoOf("Rahul") })).toBeInTheDocument();
    await waitFor(() => expect(spoken[spoken.length - 1]).toBe("This is Rahul, your grandson. Lives in Pune, visits on Sundays."));
    // Help, not a test: nothing to answer, just Back (and "Say it again", since Read aloud is on).
    expect(within(screen.getByRole("main")).getAllByRole("button").map((b) => b.textContent)).toEqual([
      expect.stringContaining(copy.nav.sayItAgain),
      expect.stringContaining(copy.whoIsThis.back),
    ]);
    spoken.length = 0;
    fireEvent.click(screen.getByRole("button", { name: copy.nav.sayItAgain }));
    expect(spoken).toEqual(["This is Rahul, your grandson. Lives in Pune, visits on Sundays."]);

    fireEvent.click(screen.getByRole("button", { name: copy.whoIsThis.back }));
    expect(screen.getByRole("heading", { name: copy.whoIsThis.title })).toBeInTheDocument();
  });

  it("is calm when there are no photos yet", async () => {
    api.listFamily.mockResolvedValue([noPhoto]);
    renderWithProviders(<App />, { route: "/patient/who-is-this" });
    expect(await screen.findByText(copy.whoIsThis.empty)).toBeInTheDocument();
  });
});

describe("caregiver family page", () => {
  beforeEach(() => {
    signInAs(priya);
    api.listPatients.mockResolvedValue([{ id: 2, name: "Kamala Devi", email: "k@khayal.test", city: null, pinned_games: null, voice_task_enabled: false, voice_consent_at: null, cognitive_index: null, cognitive_status: "insufficient" as const }]);
    api.listFamily.mockResolvedValue([rahul]);
  });

  it("checks photo files before uploading", () => {
    const file = (type: string, size: number) => new File([new Uint8Array(size)], "p", { type });
    expect(photoProblem(file("image/jpeg", 1000))).toBeNull();
    expect(photoProblem(file("image/png", 1000))).toBeNull();
    expect(photoProblem(file("image/gif", 1000))).toBe("Only JPG and PNG photos are allowed.");
    expect(photoProblem(file("image/jpeg", 5 * 1024 * 1024 + 1))).toBe("Photos must be 5 MB or smaller.");
  });

  it("adds a person with a custom relation and a note", async () => {
    api.createFamilyMember.mockResolvedValue(meena);
    renderWithProviders(<App />, { route: "/caregiver/patients/2/family" });
    const form = within(await screen.findByRole("form", { name: "Add person" }));
    fireEvent.change(form.getByLabelText("Name"), { target: { value: " Raju " } });
    fireEvent.change(form.getByLabelText("Relation"), { target: { value: "Other" } });
    fireEvent.change(form.getByLabelText("Relation (your words)"), { target: { value: "Neighbour" } });
    fireEvent.change(form.getByLabelText(/Note/), { target: { value: "Brings the newspaper." } });
    fireEvent.click(form.getByRole("button", { name: "Add person" }));
    await waitFor(() =>
      expect(api.createFamilyMember).toHaveBeenCalledWith(2, { name: "Raju", relation: "Neighbour", note: "Brings the newspaper." }),
    );
  });

  it("edits, deletes, and manages photos", async () => {
    api.updateFamilyMember.mockResolvedValue(rahul);
    api.deleteFamilyMember.mockResolvedValue(undefined);
    api.deleteFamilyPhoto.mockResolvedValue(rahul);
    api.uploadFamilyPhoto.mockResolvedValue(rahul);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProviders(<App />, { route: "/caregiver/patients/2/family" });

    const card = within(await screen.findByRole("listitem", { name: "Rahul" }));
    expect(card.getAllByRole("img")).toHaveLength(2);
    expect(card.getByText("2 / 5 photos · JPG or PNG, up to 5 MB")).toBeInTheDocument();

    const input = card.getByLabelText("Add photo") as HTMLInputElement;
    const gif = new File(["x"], "a.gif", { type: "image/gif" });
    await act(async () => fireEvent.change(input, { target: { files: [gif] } }));
    expect(card.getByRole("alert")).toHaveTextContent("Only JPG and PNG photos are allowed.");
    expect(api.uploadFamilyPhoto).not.toHaveBeenCalled();

    const jpg = new File(["x"], "a.jpg", { type: "image/jpeg" });
    await act(async () => fireEvent.change(input, { target: { files: [jpg] } }));
    await waitFor(() => expect(api.uploadFamilyPhoto).toHaveBeenCalledWith(2, 1, jpg));

    fireEvent.click(card.getByRole("button", { name: "Remove Rahul photo 1" }));
    await waitFor(() => expect(api.deleteFamilyPhoto).toHaveBeenCalledWith(2, 1, rahul.photos[0]!.id));

    fireEvent.click(card.getByRole("button", { name: "Edit" }));
    const form = within(screen.getByRole("form", { name: "Save changes" }));
    expect(form.getByLabelText("Relation")).toHaveValue("Grandson");
    fireEvent.change(form.getByLabelText(/Note/), { target: { value: "" } });
    fireEvent.click(form.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateFamilyMember).toHaveBeenCalledWith(2, 1, { name: "Rahul", relation: "Grandson", note: null }));

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteFamilyMember).toHaveBeenCalledWith(2, 1));
  });

  it("stops new uploads at 5 photos and shows custom relations when editing", async () => {
    api.listFamily.mockResolvedValue([person(9, "Raju", "Neighbour", 5)]);
    renderWithProviders(<App />, { route: "/caregiver/patients/2/family" });
    const card = within(await screen.findByRole("listitem", { name: "Raju" }));
    expect(card.getByLabelText("Add photo")).toBeDisabled();
    fireEvent.click(card.getByRole("button", { name: "Edit" }));
    const form = within(screen.getByRole("form", { name: "Save changes" }));
    expect(form.getByLabelText("Relation")).toHaveValue("Other");
    expect(form.getByLabelText("Relation (your words)")).toHaveValue("Neighbour");
  });
});
