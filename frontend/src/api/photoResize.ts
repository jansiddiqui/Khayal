/**
 * Photos are made small in the browser before they are uploaded: at most 800 px on the long side,
 * JPEG at quality 0.85, drawn through a canvas (which drops EXIF metadata such as GPS and turns
 * phone photos upright). A 4 MB phone photo becomes about 100 KB, so the upload is quick and the
 * free server (0.1 CPU) usually has nothing to re-encode. The server still checks every photo
 * and resizes it itself when needed (backend/app/services/family.py).
 */

export const MAX_SIDE = 800;
export const JPEG_QUALITY = 0.85;

/** The size that fits within `max` px on the long side, keeping the shape; never enlarged. */
export function fitWithin(width: number, height: number, max: number = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * The photo as a small JPEG without metadata. If the browser cannot do it (very old browsers, or
 * a file it cannot decode), the original file is returned and the server resizes it instead.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.fillStyle = "#ffffff"; // transparent PNG areas become white, as on the server
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return blob && blob.size > 0 ? blob : file;
  } catch {
    return file;
  }
}
