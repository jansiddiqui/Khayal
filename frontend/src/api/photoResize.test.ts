import { afterEach, describe, expect, it, vi } from "vitest";
import { fitWithin, JPEG_QUALITY, shrinkPhoto } from "./photoResize";

describe("fitWithin", () => {
  it("fits the long side into 800 px, keeps the shape, never enlarges", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 600, height: 800 });
    expect(fitWithin(1080, 1080)).toEqual({ width: 800, height: 800 });
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(5000, 2)).toEqual({ width: 800, height: 1 });
  });
});

describe("shrinkPhoto", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A browser that can decode a 4000 × 3000 phone photo and draw it on a canvas. */
  function fakeBrowser(result: Blob | null = new Blob(["small"], { type: "image/jpeg" })) {
    const bitmap = { width: 4000, height: 3000, close: vi.fn() };
    const createImageBitmap = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn(), imageSmoothingQuality: "low" };
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(canvas, "toBlob").mockImplementation((done) => done(result));
    vi.spyOn(document, "createElement").mockReturnValueOnce(canvas);
    return { bitmap, createImageBitmap, context, canvas, toBlob };
  }

  it("draws the photo upright at 800 px on white and re-encodes it as JPEG 0.85 (no metadata)", async () => {
    const browser = fakeBrowser();
    const file = new File([new Uint8Array(4_000_000)], "phone.png", { type: "image/png" });
    const out = await shrinkPhoto(file);

    expect(out.type).toBe("image/jpeg");
    expect(out.size).toBe(5);
    expect(browser.createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect([browser.canvas.width, browser.canvas.height]).toEqual([800, 600]);
    expect(browser.context.fillStyle).toBe("#ffffff");
    expect(browser.context.drawImage).toHaveBeenCalledWith(browser.bitmap, 0, 0, 800, 600);
    expect(browser.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", JPEG_QUALITY);
    expect(browser.bitmap.close).toHaveBeenCalled();
  });

  it("sends the original when the browser cannot resize it (the server resizes instead)", async () => {
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    vi.stubGlobal("createImageBitmap", undefined);
    expect(await shrinkPhoto(file)).toBe(file);
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("cannot decode")));
    expect(await shrinkPhoto(file)).toBe(file);
    fakeBrowser(null);
    expect(await shrinkPhoto(file)).toBe(file);
  });
});
