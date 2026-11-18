import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as apiClient from "../api/client";
import type { Memory, User } from "../api/client";
import { App } from "../App";
import { copy } from "../copy";
import { renderWithProviders } from "../test/renderWithProviders";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    getMe: vi.fn(),
    getMoodToday: vi.fn(),
    answerMood: vi.fn(),
    getTodayReminders: vi.fn(),
    getTodaysGames: vi.fn(),
    listFamily: vi.fn(),
    listMemories: vi.fn(),
    listPatients: vi.fn(),
    createMemory: vi.fn(),
    addMemoryPhoto: vi.fn(),
    fetchPhotoBlob: vi.fn(),
  };
});
const api = vi.mocked(apiClient);

const kamala: User = { id: 2, name: "Kamala Devi", email: null, role: "patient", created_at: "", city: null, pinned_games: null, voice_task_enabled: false, voice_consent_at: null };
const priya: User = { id: 1, name: "Priya", email: "p@khayal.test", role: "caregiver", created_at: "", city: null, pinned_games: null, voice_task_enabled: false, voice_consent_at: null };
const memory = (id: number, title: string, photos = 2): Memory => ({
  id, patient_id: 2, title, story: `${title}: a happy day.`,
  photos: Array.from({ length: photos }, (_, i) => ({ id: `${id}${i}`.padEnd(32, "0"), url: `/patients/2/memories/${id}/photos/${i}` })),
  voice_url: null, voice_ms: null, created_at: "2026-11-10T00:00:00Z", updated_at: "2026-11-10T00:00:00Z",
});

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem("khayal.token", "t");
  api.getTodayReminders.mockResolvedValue([]);
  api.getTodaysGames.mockResolvedValue({ games: [] } as never);
  api.listFamily.mockResolvedValue([]);
  api.fetchPhotoBlob.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});

it("asks how they feel once a day: three answers and Skip, then a kind reply and Continue", async () => {
  api.getMe.mockResolvedValue(kamala);
  api.getMoodToday.mockResolvedValueOnce({ asked: false, mood: null }).mockResolvedValue({ asked: true, mood: "not_so_good" });
  api.answerMood.mockResolvedValue({ asked: true, mood: "not_so_good" });
  renderWithProviders(<App />, { route: "/patient" });
  expect(await screen.findByRole("heading", { name: copy.mood.question })).toBeInTheDocument();
  const answers = within(screen.getByRole("group", { name: copy.mood.question }));
  expect(answers.getAllByRole("button").map((b) => b.textContent)).toEqual([copy.mood.good, copy.mood.okay, copy.mood.notSoGood]);
  expect(screen.getByRole("button", { name: copy.mood.skip })).toBeInTheDocument();
  fireEvent.click(answers.getByRole("button", { name: copy.mood.notSoGood }));
  expect(await screen.findByRole("heading", { name: copy.mood.thanks })).toBeInTheDocument();
  expect(screen.getByText(copy.mood.gentle)).toBeInTheDocument();
  expect(api.answerMood).toHaveBeenCalledWith("not_so_good");
  fireEvent.click(screen.getByRole("button", { name: copy.mood.continue }));
  expect(await screen.findByRole("link", { name: /Play a game/ })).toBeInTheDocument();
});

it("Skip goes straight to Home; an answered day doesn't ask again", async () => {
  api.getMe.mockResolvedValue(kamala);
  api.getMoodToday.mockResolvedValueOnce({ asked: false, mood: null }).mockResolvedValue({ asked: true, mood: null });
  api.answerMood.mockResolvedValue({ asked: true, mood: null });
  renderWithProviders(<App />, { route: "/patient" });
  fireEvent.click(await screen.findByRole("button", { name: copy.mood.skip }));
  expect(await screen.findByRole("link", { name: /Who is this\?/ })).toBeInTheDocument();
  expect(api.answerMood).toHaveBeenCalledWith(null);
});

it("Memories: switch from People, open a memory, tap for the next photo, go to the next memory", async () => {
  api.getMe.mockResolvedValue(kamala);
  api.listMemories.mockResolvedValue([memory(7, "Our wedding, 1972"), memory(8, "Diwali in Pune", 1)]);
  renderWithProviders(<App />, { route: "/patient/who-is-this" });
  const nav = await screen.findByRole("navigation", { name: copy.memories.switchLabel });
  fireEvent.click(within(nav).getByRole("link", { name: copy.memories.memories }));
  fireEvent.click(await screen.findByRole("button", { name: /Our wedding, 1972/ }));
  expect(await screen.findByRole("heading", { name: "Our wedding, 1972" })).toBeInTheDocument();
  expect(screen.getByText(/Photo 1 of 2/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Photo 1 of 2/ }));
  expect(screen.getByText(/Photo 2 of 2/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: copy.memories.readStory })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(copy.memories.nextMemory) }));
  expect(await screen.findByRole("heading", { name: "Diwali in Pune" })).toBeInTheDocument();
});

it("caregiver memory book: needs the photos opt-in; a new memory saves its photos", async () => {
  api.getMe.mockResolvedValue(priya);
  const base: apiClient.PatientSummary = { id: 2, name: "Kamala Devi", photos_enabled: false, has_photo: false, city: null, pinned_games: null, core_games: [], core_is_default: true, voice_task_enabled: false, voice_consent_at: null, cognitive_index: null, cognitive_status: "insufficient" };
  api.listPatients.mockResolvedValueOnce([base]);
  const first = renderWithProviders(<App />, { route: "/caregiver/patients/2/memories" });
  expect(await screen.findByRole("link", { name: "Turn on family photos" })).toHaveAttribute("href", "/caregiver/patients/2#privacy");
  first.unmount();

  api.listPatients.mockResolvedValue([{ ...base, photos_enabled: true }]);
  api.listMemories.mockResolvedValue([]);
  api.createMemory.mockResolvedValue(memory(9, "Pune, 1990", 0));
  api.addMemoryPhoto.mockResolvedValue(memory(9, "Pune, 1990", 1));
  renderWithProviders(<App />, { route: "/caregiver/patients/2/memories" });
  fireEvent.click(await screen.findByRole("button", { name: "Add a memory" }));
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Pune, 1990" } });
  const file = new File(["jpg"], "pune.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText(/Photos \(1 to 5\)/), { target: { files: [file] } });
  expect(screen.getByText(/Voice notes need the voice opt-in/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save memory" }));
  await waitFor(() => expect(api.addMemoryPhoto).toHaveBeenCalledWith(2, 9, file));
  expect(api.createMemory).toHaveBeenCalledWith(2, "Pune, 1990", "");
});
