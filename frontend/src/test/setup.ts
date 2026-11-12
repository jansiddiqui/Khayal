import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import { afterEach, vi } from "vitest";

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

// jsdom has no ResizeObserver; some components still ask for one.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});
