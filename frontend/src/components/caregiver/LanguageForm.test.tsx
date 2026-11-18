import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as apiClient from "../../api/client";
import type { Patient } from "../../api/client";
import { renderWithProviders } from "../../test/renderWithProviders";
import { LanguageForm } from "./LanguageForm";

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, updatePatient: vi.fn() };
});
const api = vi.mocked(apiClient);

const kamala: Patient = {
  id: 2, name: "Kamala", city: null, pinned_games: null, core_games: [], core_is_default: true, voice_task_enabled: false,
  voice_consent_at: null, photos_enabled: false, has_photo: false, language: "ur",
  voice_check: { lang: "ur", voice: "Google हिन्दी", using: "hi", checked_at: "2026-11-18T10:00:00Z" },
};

beforeEach(() => vi.resetAllMocks());

it("the family picks the elder's language; the elder never has to find it", async () => {
  api.updatePatient.mockResolvedValue({ ...kamala, language: "hi" });
  renderWithProviders(<LanguageForm patient={kamala} />);
  const select = screen.getByRole("combobox", { name: "Language" });
  expect(select).toHaveValue("ur");
  expect(screen.getByText(/no Urdu voice, so Urdu is read aloud with a Hindi voice \(Google हिन्दी\)/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.change(select, { target: { value: "hi" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(api.updatePatient).toHaveBeenCalledWith(2, { language: "hi" }));
});
