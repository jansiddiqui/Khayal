import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { isAxiosError } from "axios";
import { vi } from "vitest";
import { api, checkApiUrl, errorStatus } from "./client";

/** A fake server answer, so the real interceptors run without any network. */
function answer(status: number, contentType: string | undefined, data: unknown): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => ({
    data,
    status,
    statusText: "OK",
    headers: contentType ? { "content-type": contentType } : {},
    config,
    request: {},
  });
}

const INDEX_HTML = "<!doctype html><html><body><div id=\"root\"></div></body></html>";

describe("API responses must be JSON", () => {
  it("rejects the web page a host serves when VITE_API_URL was missing", async () => {
    const request = api.get("/config", { adapter: answer(200, "text/html; charset=utf-8", INDEX_HTML) });
    await expect(request).rejects.toSatisfy((err: unknown) => isAxiosError(err) && err.code === "ERR_NOT_JSON");
    // Not mistaken for a real answer: there is no status to act on.
    await request.catch((err: unknown) => expect(errorStatus(err)).toBeUndefined());
  });

  it("rejects a 200 with no content type and a text body", async () => {
    await expect(api.get("/config", { adapter: answer(200, undefined, INDEX_HTML) })).rejects.toThrow(/Expected JSON/);
  });

  it("accepts JSON, empty answers and blob downloads", async () => {
    const config = { demo_mode: true, recording_limit_seconds: 120, demo_account_days: 7 };
    await expect(api.get("/config", { adapter: answer(200, "application/json", config) })).resolves.toMatchObject({ data: config });
    await expect(api.delete("/patients/1/reminders/2", { adapter: answer(204, undefined, "") })).resolves.toMatchObject({ status: 204 });
    await expect(
      api.get("/patients/1/speech/2/audio", { responseType: "blob", adapter: answer(200, "audio/webm", new Blob(["x"])) }),
    ).resolves.toMatchObject({ status: 200 });
  });
});

describe("VITE_API_URL check", () => {
  it("logs a clear error only for a production build without VITE_API_URL", () => {
    const log = vi.fn();
    expect(checkApiUrl({ PROD: true, VITE_API_URL: "" }, log)).toBe(false);
    expect(checkApiUrl({ PROD: true }, log)).toBe(false);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]![0]).toMatch(/VITE_API_URL was empty/);

    log.mockClear();
    expect(checkApiUrl({ PROD: true, VITE_API_URL: "https://khayal-api.example.app" }, log)).toBe(true);
    expect(checkApiUrl({ PROD: false, VITE_API_URL: "" }, log)).toBe(true); // development uses the /api proxy
    expect(log).not.toHaveBeenCalled();
  });
});
