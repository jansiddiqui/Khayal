import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import { AxiosError } from "axios";
import { afterEach, vi } from "vitest";
import { api } from "../api/client";
import { resetTestAppConfig } from "./appConfigState";

// Every page is lazy-loaded (App.tsx); the first load of a page in a test run compiles it,
// which can take longer than the default 1 s wait. Only failing waits get slower.
configure({ asyncUtilTimeout: 8000 });

// No real network in tests: a request no test mocked fails at once (as if offline) instead
// of trying to reach a server. Tests that exercise the client pass their own adapter.
api.defaults.adapter = async (config) => {
  throw new AxiosError("No network in tests (mock this API call)", "ERR_NETWORK", config);
};

// jsdom has no object URLs; private photos are shown through them.
URL.createObjectURL = () => "blob:test-photo";
URL.revokeObjectURL = () => undefined;

// jsdom has no layout, so Recharts' ResponsiveContainer would measure 0×0 and warn.
// In tests it renders its chart at a fixed size instead.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const ResponsiveContainer = ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
    cloneElement(children, { width: 800, height: 300 });
  return { ...actual, ResponsiveContainer };
});

// The backend's public settings: loaded and not the public demo, unless a test calls
// setTestAppConfig (test/appConfigState.ts). No real requests. Plain functions, not vi.fn,
// so vi.resetAllMocks() in a test cannot wipe them.
vi.mock("../api/useAppConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/useAppConfig")>();
  const { testAppConfigState } = await import("./appConfigState");
  return {
    ...actual,
    useAppConfigState: () => testAppConfigState(),
    useAppConfig: () => testAppConfigState().config,
  };
});

// jsdom has no IntersectionObserver (motion's on-scroll reveals use it): report everything as visible.
globalThis.IntersectionObserver = class {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target, intersectionRatio: 1 } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
};

// jsdom has no ResizeObserver; some components still ask for one.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

afterEach(() => {
  cleanup();
  resetTestAppConfig();
  localStorage.clear();
});
