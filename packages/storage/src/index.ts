import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Local filesystem storage for uploaded documents. Phase 6 swaps these two
 * functions for S3/R2 + a TTL; nothing else changes.
 *
 * The uploads dir is anchored to the repo root via this module's location, so
 * the api (writer) and worker (reader) agree regardless of their cwd. An
 * absolute UPLOADS_DIR env var overrides it.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const uploadsDir =
  process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.startsWith("/")
    ? process.env.UPLOADS_DIR
    : resolve(repoRoot, ".uploads");

/** Accepted upload media types → file extension. */
export const MEDIA_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** File extension → media type (inverse of MEDIA_EXT, plus aliases). */
export const EXT_MEDIA: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function mediaTypeForRef(fileRef: string): string {
  const ext = fileRef.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MEDIA[ext] ?? "application/octet-stream";
}

export async function saveUpload(
  fileRef: string,
  bytes: Buffer | Uint8Array,
): Promise<void> {
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(join(uploadsDir, fileRef), bytes);
}

export async function readUpload(fileRef: string): Promise<Buffer> {
  return readFile(join(uploadsDir, fileRef));
}
