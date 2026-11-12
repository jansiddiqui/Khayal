import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import * as apiClient from "../api/client";
import type { Patient, SpeechSample } from "../api/client";
import { VoiceRecordings } from "../components/caregiver/VoiceRecordings";
import { copy } from "../copy";
import { renderWithProviders } from "../test/renderWithProviders";
import { AUTO_STOP_MS } from "../voice/useRecorder";
import { Games } from "./patient/Games";
import { VoiceTask } from "./patient/VoiceTask";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    getMe: vi.fn(),
    getTodaysGames: vi.fn(),
    uploadRecording: vi.fn(),
    listRecordings: vi.fn(),
    updatePatient: vi.fn(),
    fetchAudioBlob: vi.fn(),
  };
});

const api = vi.mocked(apiClient);
const v = copy.voiceTask;

/** A stand-in MediaRecorder: records nothing, hands back one small chunk when stopped. */
class FakeRecorder {
  static isTypeSupported = (t: string) => t.startsWith("audio/webm");
  static last: FakeRecorder | null = null;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["webm-bytes"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

const track = { stop: vi.fn() };
let getUserMedia: ReturnType<typeof vi.fn>;
const spoken: string[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  spoken.length = 0;
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] });
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    lang = "";
    rate = 1;
    constructor(public text: string) {}
  });
  vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak: (u: { text: string }) => spoken.push(u.text) });
  api.getTodaysGames.mockResolvedValue({
    pinned: false,
    games: [
      { game_type: "daily_orientation", done_today: true },
      { game_type: "memory_match", done_today: false },
      { game_type: "voice_task", done_today: true },
    ],
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const sample: SpeechSample = {
  id: 7,
  recorded_at: "2026-11-04T05:00:00Z",
  duration_ms: 95_000,
  transcript: null,
  risk_score: null,
  model_version: "stub-0",
  audio_url: "/patients/2/speech/7/audio",
};

describe("Tell me about a picture", () => {
  it("shows the picture, the instruction and one Start button, and reads the instruction aloud", () => {
    localStorage.setItem("khayal.readAloud", "on");
    renderWithProviders(<VoiceTask />);
    expect(screen.getByRole("img", { name: "A picture of a busy kitchen" })).toBeInTheDocument();
    expect(screen.getByText(v.instruction)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: v.start })).toBeInTheDocument();
    expect(spoken.some((t) => t.includes(v.instruction))).toBe(true);
    // No text in the picture.
    expect(screen.getByRole("img", { name: "A picture of a busy kitchen" }).querySelector("text")).toBeNull();
  });

  it("records, shows Stop with a sound bar and no countdown, then uploads and thanks the patient", async () => {
    api.uploadRecording.mockResolvedValue(sample);
    renderWithProviders(<VoiceTask />);
    fireEvent.click(screen.getByRole("button", { name: v.start }));

    const stop = await screen.findByRole("button", { name: v.stop });
    expect(screen.queryByRole("button", { name: v.start })).toBeNull();
    expect(screen.getByText(v.listening)).toBeInTheDocument();
    expect(screen.queryByText(/\d:\d\d/)).toBeNull(); // no countdown or clock

    fireEvent.click(stop);
    expect(await screen.findByText(v.thanks)).toBeInTheDocument();
    const [audio, durationMs] = api.uploadRecording.mock.calls[0]!;
    expect(audio.type).toBe("audio/webm");
    expect(durationMs).toBeGreaterThanOrEqual(0);
    expect(track.stop).toHaveBeenCalled(); // microphone released
    // The next game on today's list that isn't done yet.
    expect(await screen.findByRole("link", { name: `${copy.games.nextGame} ${copy.games.memoryMatch.title}` })).toHaveAttribute(
      "href",
      "/patient/games/memory_match",
    );
  });

  it("stops by itself after 3 minutes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.uploadRecording.mockResolvedValue(sample);
    renderWithProviders(<VoiceTask />);
    fireEvent.click(screen.getByRole("button", { name: v.start }));
    await screen.findByRole("button", { name: v.stop });
    act(() => vi.advanceTimersByTime(AUTO_STOP_MS - 1000));
    expect(api.uploadRecording).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(await screen.findByText(v.thanks)).toBeInTheDocument();
  });

  it("asks for help kindly when the microphone can't be used", async () => {
    getUserMedia.mockRejectedValue(new Error("NotAllowedError"));
    renderWithProviders(<VoiceTask />);
    fireEvent.click(screen.getByRole("button", { name: v.start }));
    expect(await screen.findByText(v.micProblem)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.games.backHome })).toBeInTheDocument();
  });

  it("offers Try again when saving fails, and keeps the recording", async () => {
    api.uploadRecording.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(sample);
    renderWithProviders(<VoiceTask />);
    fireEvent.click(screen.getByRole("button", { name: v.start }));
    fireEvent.click(await screen.findByRole("button", { name: v.stop }));
    fireEvent.click(await screen.findByRole("button", { name: v.tryAgain }));
    expect(await screen.findByText(v.thanks)).toBeInTheDocument();
    expect(api.uploadRecording).toHaveBeenCalledTimes(2);
    expect(api.uploadRecording.mock.calls[1]![0]).toBe(api.uploadRecording.mock.calls[0]![0]);
  });
});

it("today's games list links the voice task in slot 3", async () => {
  api.getTodaysGames.mockResolvedValue({
    pinned: false,
    games: [
      { game_type: "daily_orientation", done_today: false },
      { game_type: "word_recall", done_today: false },
      { game_type: "voice_task", done_today: false },
    ],
  });
  renderWithProviders(<Games />);
  const list = within(await screen.findByRole("navigation", { name: "Games" }));
  expect(list.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
    "/patient/games/daily_orientation",
    "/patient/games/word_recall",
    "/patient/voice",
  ]);
  expect(list.getByRole("link", { name: v.title })).toBeInTheDocument();
});

describe("caregiver voice recordings", () => {
  const kamala: Patient = {
    id: 2,
    name: "Kamala Devi",
    email: "kamala@khayal.test",
    city: null,
    pinned_games: null,
    voice_task_enabled: false,
    voice_consent_at: null,
  };

  it("turns the voice task on with consent", async () => {
    api.listRecordings.mockResolvedValue([]);
    api.updatePatient.mockResolvedValue({ ...kamala, voice_task_enabled: true, voice_consent_at: "2026-11-04T05:00:00Z" });
    renderWithProviders(<VoiceRecordings patient={kamala} />);
    const toggle = screen.getByRole("checkbox", { name: "Voice task enabled" });
    expect(toggle).not.toBeChecked();
    expect(await screen.findByText("No recordings yet.")).toBeInTheDocument();
    fireEvent.click(toggle);
    await waitFor(() => expect(api.updatePatient).toHaveBeenCalledWith(2, { voice_task_enabled: true }));
  });

  it("lists recordings with date and length, plays them on request, and shows no score", async () => {
    api.listRecordings.mockResolvedValue([sample]);
    api.fetchAudioBlob.mockResolvedValue(new Blob(["x"], { type: "audio/webm" }));
    renderWithProviders(<VoiceRecordings patient={{ ...kamala, voice_task_enabled: true, voice_consent_at: "2026-10-01T05:00:00Z" }} />);
    const list = within(await screen.findByRole("list", { name: "Recordings" }));
    expect(list.getByText("Length 1:35")).toBeInTheDocument();
    expect(list.getByText("Analysis coming soon")).toBeInTheDocument();
    expect(api.fetchAudioBlob).not.toHaveBeenCalled();
    fireEvent.click(list.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(api.fetchAudioBlob).toHaveBeenCalledWith(sample.audio_url));
    await waitFor(() => expect(document.querySelector("audio")).not.toBeNull());
    expect(screen.queryByText(/risk|score/i)).toBeNull();
  });
});
