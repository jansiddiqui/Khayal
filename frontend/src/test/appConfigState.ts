import type { AppConfig } from "../api/client";
import type { AppConfigState } from "../api/useAppConfig";

/** Not the public demo (the default in tests). */
export const NOT_DEMO: AppConfig = { demo_mode: false, recording_limit_seconds: 180, demo_account_days: 7 };
/** The public demo. */
export const DEMO: AppConfig = { demo_mode: true, recording_limit_seconds: 120, demo_account_days: 7 };

const DEFAULT: AppConfigState = { config: NOT_DEMO, waking: false };
let current: AppConfigState = DEFAULT;

/** What useAppConfig / useAppConfigState return in tests (see setup.ts). */
export function testAppConfigState(): AppConfigState {
  return current;
}

export function setTestAppConfig(state: Partial<AppConfigState>): void {
  current = { ...current, ...state };
}

export function resetTestAppConfig(): void {
  current = DEFAULT;
}
