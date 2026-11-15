import { screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import * as apiClient from "./client";
import { DemoBanner } from "../components/DemoBanner";
import { copy } from "../copy";
import { DEMO } from "../test/appConfigState";
import { renderWithProviders } from "../test/renderWithProviders";
import { CONFIG_RETRY_MS } from "./useAppConfig";

// The real hook here, not the test stand-in from setup.ts.
vi.unmock("./useAppConfig");
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, getAppConfig: vi.fn() };
});

const api = vi.mocked(apiClient);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.getAppConfig.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a sleeping backend", () => {
  it("shows the waking notice after a failure and retries every 5 s until it answers", async () => {
    api.getAppConfig.mockRejectedValueOnce(new Error("timeout")).mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(DEMO);
    renderWithProviders(<DemoBanner />);

    expect(await screen.findByRole("status")).toHaveTextContent(copy.demo.waking);
    expect(api.getAppConfig).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(CONFIG_RETRY_MS));
    expect(api.getAppConfig).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent(copy.demo.waking);

    await act(() => vi.advanceTimersByTimeAsync(CONFIG_RETRY_MS));
    expect(api.getAppConfig).toHaveBeenCalledTimes(3);
    expect(await screen.findByRole("note")).toHaveTextContent(copy.demo.banner);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says it is waking up when the first answer is slow, before any failure", async () => {
    api.getAppConfig.mockReturnValue(new Promise(() => undefined)); // never answers
    renderWithProviders(<DemoBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByRole("status")).toHaveTextContent(copy.demo.waking);
  });
});
