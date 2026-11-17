import { AxiosError, CanceledError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, describeRequestError, UPLOAD_TIMEOUT_MS, uploadFamilyPhoto, UploadTimeoutError } from "./client";

/** A server that never answers: the request only ends when it is cancelled. */
const silentServer: AxiosAdapter = (config) =>
  new Promise((_, reject) => {
    config.signal?.addEventListener?.("abort", () => reject(new CanceledError(undefined, undefined, config)));
  });

const testAdapter = api.defaults.adapter;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  api.defaults.adapter = testAdapter;
});

describe("family photo upload", () => {
  it("gives up after 60 seconds with no answer", async () => {
    api.defaults.adapter = silentServer;
    const result = uploadFamilyPhoto(2, 1, new File([new Uint8Array(25_000)], "a.jpg", { type: "image/jpeg" }));
    const settled = vi.fn();
    result.then(settled, settled);
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).rejects.toBeInstanceOf(UploadTimeoutError);
    expect(describeRequestError(await result.catch((e: unknown) => e))).toBe("No answer from the server after 60 seconds.");
  });

  it("passes the server's error through, with its status", async () => {
    api.defaults.adapter = (config: InternalAxiosRequestConfig) =>
      Promise.reject(
        new AxiosError("Request failed with status code 413", "ERR_BAD_REQUEST", config, null, {
          status: 413, statusText: "Content Too Large", data: { detail: "Photos must be 5 MB or smaller." }, headers: {}, config,
        }),
      );
    const error = await uploadFamilyPhoto(2, 1, new File(["x"], "a.jpg", { type: "image/jpeg" })).catch((e: unknown) => e);
    expect(describeRequestError(error)).toBe("Error 413: Photos must be 5 MB or smaller.");
  });
});

describe("describeRequestError", () => {
  it("names the status even when the server sent no message, and explains a missing answer", () => {
    const config = {} as InternalAxiosRequestConfig;
    const bare = new AxiosError("Request failed with status code 502", "ERR_BAD_RESPONSE", config, null, {
      status: 502, statusText: "Bad Gateway", data: "<html>", headers: {}, config,
    });
    expect(describeRequestError(bare)).toBe("Error 502: Bad Gateway");
    expect(describeRequestError(new AxiosError("Network Error", "ERR_NETWORK", config))).toBe("No answer from the server (Network Error).");
  });
});
