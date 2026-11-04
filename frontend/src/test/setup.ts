import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no object URLs; private photos are shown through them.
URL.createObjectURL = () => "blob:test-photo";
URL.revokeObjectURL = () => undefined;

afterEach(() => {
  cleanup();
  localStorage.clear();
});
