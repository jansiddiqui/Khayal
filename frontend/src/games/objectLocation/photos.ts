import type { ObjectId } from "./logic";

/** Photo URLs per object (docs/games/image-sources.md): WebP first, JPEG as the fallback. */
const files = import.meta.glob<string>("./photos/*.{webp,jpg}", { eager: true, query: "?url", import: "default" });

export interface PhotoSources {
  webp: string;
  jpg: string;
}

export function photoFor(id: ObjectId): PhotoSources {
  return { webp: files[`./photos/${id}.webp`] ?? "", jpg: files[`./photos/${id}.jpg`] ?? "" };
}

/** Every photo file name, for the licence-log test. */
export const PHOTO_FILES = Object.keys(files).map((path) => path.replace("./photos/", ""));
