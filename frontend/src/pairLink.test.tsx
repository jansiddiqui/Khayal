import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "./api/client";
import { PairDevicePanel } from "./components/caregiver/PairDevicePanel";
import { codeFromLink, languageFromLink, pairLink } from "./pairLink";
import { t } from "./t";
import { renderWithProviders } from "./test/renderWithProviders";

vi.mock("./api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/client")>();
  return { ...actual, createPairingCode: vi.fn(), listDevices: vi.fn() };
});
const api = vi.mocked(apiClient);

describe("pairing link (pair-entry)", () => {
  it("carries the code and the elder's language", () => {
    expect(pairLink("https://khayal.example", "482913", "hi")).toBe("https://khayal.example/pair?code=482913&lang=hi");
    expect(pairLink("https://khayal.example", "482913", "en")).toBe("https://khayal.example/pair?code=482913");
    expect(pairLink("https://khayal.example", "482913", "fr")).toBe("https://khayal.example/pair?code=482913");
  });

  it("reads only a 6-digit code, and a language only on /pair", () => {
    expect(codeFromLink("?code=482913&lang=ur")).toBe("482913");
    expect(codeFromLink("?code=4829")).toBe("");
    expect(codeFromLink("")).toBe("");
    expect(languageFromLink("/pair", "?code=482913&lang=ur")).toBe("ur");
    expect(languageFromLink("/pair", "?lang=xx")).toBeNull();
    expect(languageFromLink("/caregiver", "?lang=hi")).toBeNull();
  });
});

describe("caregiver pairing panel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.listDevices.mockResolvedValue([]);
  });

  it("shows the code with a QR code, a copyable link and WhatsApp", async () => {
    api.createPairingCode.mockResolvedValue({ code: "482913", expires_at: new Date(Date.now() + 600_000).toISOString() });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderWithProviders(<PairDevicePanel patientId={2} patientName="Kamala" patientLanguage="hi" />);
    fireEvent.click(screen.getByRole("button", { name: t.elderPanels.pair.showCode }));

    expect(await screen.findByText("482913")).toBeInTheDocument();
    const url = `${window.location.origin}/pair?code=482913&lang=hi`;
    const qr = screen.getByRole("img", { name: t.elderPanels.pair.qrLabel("Kamala") });
    expect(qr.querySelector("path")?.getAttribute("d")).toMatch(/^M\d/);
    expect(screen.getByRole("textbox", { name: t.elderPanels.pair.linkLabel })).toHaveValue(url);
    const whatsapp = screen.getByRole("link", { name: t.elderPanels.pair.whatsapp });
    expect(whatsapp.getAttribute("href")).toBe(`https://wa.me/?text=${encodeURIComponent(t.elderPanels.pair.shareMessage("Kamala", url))}`);
    fireEvent.click(screen.getByRole("button", { name: t.elderPanels.pair.copyLink }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
    expect(await screen.findByRole("button", { name: t.elderPanels.pair.copied })).toBeInTheDocument();
  });
});
