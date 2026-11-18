import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as apiClient from "../api/client";
import type { User } from "../api/client";
import { copy } from "../copy";
import { renderWithProviders } from "../test/renderWithProviders";
import { PatientFeedback } from "./PatientFeedback";
import { SettingsSheet } from "./SettingsSheet";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, getMe: vi.fn(), sendFeedback: vi.fn(), sendFeedbackVoice: vi.fn() };
});
const api = vi.mocked(apiClient);

const kamala = (voice: boolean): User => ({
  id: 2, name: "Kamala", email: null, role: "patient", created_at: "", city: null, pinned_games: null,
  voice_task_enabled: voice, voice_consent_at: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem("khayal.token", "t");
  api.sendFeedback.mockResolvedValue(11);
});

it("two big choices, then a few words and Send; no voice note without the voice opt-in", async () => {
  api.getMe.mockResolvedValue(kamala(false));
  const done = vi.fn();
  renderWithProviders(<PatientFeedback onDone={done} />, { route: "/patient/games" });
  const buttons = await screen.findAllByRole("button");
  expect(buttons).toHaveLength(3); // at most 3 controls (CLAUDE.md section 4)
  fireEvent.click(screen.getByRole("button", { name: copy.feedback.hard }));
  expect(await screen.findByRole("textbox", { name: copy.feedback.words })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: copy.feedback.record })).toBeNull();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "The clock was small" } });
  fireEvent.click(screen.getByRole("button", { name: copy.feedback.send }));
  expect(await screen.findByText(copy.feedback.thanks)).toBeInTheDocument();
  expect(api.sendFeedback).toHaveBeenCalledWith("hard", "The clock was small", "/patient/games");
  expect(api.sendFeedbackVoice).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: copy.settings.done }));
  expect(done).toHaveBeenCalled();
});

it("offers a voice note when the voice opt-in is on", async () => {
  api.getMe.mockResolvedValue(kamala(true));
  renderWithProviders(<PatientFeedback onDone={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: copy.feedback.liked }));
  await waitFor(() => expect(screen.getByRole("button", { name: copy.feedback.record })).toBeInTheDocument());
});

it("the Settings sheet keeps its 3 controls and opens feedback from a quiet link", async () => {
  api.getMe.mockResolvedValue(kamala(false));
  renderWithProviders(<SettingsSheet open onClose={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: copy.settings.tellUs }));
  expect(await screen.findByRole("heading", { name: copy.feedback.title })).toBeInTheDocument();
});
