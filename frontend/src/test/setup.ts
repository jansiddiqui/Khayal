import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import { AxiosError } from "axios";
import { afterEach, beforeAll, vi } from "vitest";
import { api } from "../api/client";
import { resetTestAppConfig } from "./appConfigState";
import { EMPTY_WEEK } from "./fixtures";

// findBy / waitFor wait up to 8 s instead of Testing Library's 1 s, for a busy machine (a full
// parallel run, or the backend suite beside it). Only waits that would fail anyway get slower;
// the per-test limit stays 20 s (vite.config.ts).
configure({ asyncUtilTimeout: 8000 });

// Every page is lazy-loaded (App.tsx). The first import of a page compiles it and its charts,
// which on a loaded machine took several seconds and used to run inside a test's timed wait.
// Load the caregiver and admin pages once per test file, before its tests start. In beforeAll,
// so each file's vi.mock of the API client is already in place when the pages import it.
const LAZY_PAGES = [
  () => import("../pages/caregiver/Dashboard"),
  () => import("../pages/caregiver/PatientDetail"),
  () => import("../pages/caregiver/Reminders"),
  () => import("../pages/caregiver/Report"),
  () => import("../pages/caregiver/MemoryBook"),
  () => import("../pages/caregiver/Family"),
  () => import("../pages/caregiver/Account"),
  () => import("../pages/admin/Admin"),
];
beforeAll(async () => {
  await Promise.all(LAZY_PAGES.map((load) => load()));
}, 60_000);

// No real network in tests. The read-only panels every caregiver or patient page loads around
// what a test is about (mood, weekly card, timeline, insights, devices, consents, share links,
// game catalog, glance) answer here with empty data, so pages render their normal empty state.
// A test that cares mocks the API function itself, which never reaches this adapter.
const READ_DEFAULTS: [RegExp, () => unknown][] = [
  [/^\/me\/mood\/today$/, () => ({ asked: true, mood: null })],
  [/^\/patients\/\d+\/mood$/, () => []],
  [/^\/patients\/\d+\/weekly$/, () => ({ this_week: EMPTY_WEEK, last_week: EMPTY_WEEK })],
  [/^\/patients\/\d+\/timeline(\?|$)/, () => []],
  [/^\/patients\/\d+\/insights$/, () => []],
  [/^\/patients\/\d+\/(devices|consents|shares)$/, () => []],
  [/^\/games\/catalog$/, () => []],
  [/^\/caregiver\/glance$/, () => []],
];
// Any other request no test mocked fails the test (after it runs), so a new unmocked call
// shows up at once instead of quietly turning into a network error on a page.
const unmocked: string[] = [];
api.defaults.adapter = async (config) => {
  const url = config.url ?? "";
  const known = config.method === "get" ? READ_DEFAULTS.find(([pattern]) => pattern.test(url)) : undefined;
  if (known) return { data: known[1](), status: 200, statusText: "OK", headers: {}, config, request: {} };
  unmocked.push(`${config.method?.toUpperCase()} ${url}`);
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
  const calls = unmocked.splice(0);
  if (calls.length) throw new Error(`Unmocked API requests (mock them in the test): ${[...new Set(calls)].join(", ")}`);
});
