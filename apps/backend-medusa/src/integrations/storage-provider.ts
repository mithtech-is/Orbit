import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { getEnv } from "../config/env.js";

/**
 * Pluggable binary object storage for uploads (visit photos, attachments).
 *   - "local" writes under LOCAL_OBJECT_STORAGE_ROOT and serves bytes back via
 *     the /api/v1/uploads/:key download route (good for dev / single-node).
 *   - "s3" uses the AWS SDK (dynamic import) for durable, multi-node storage.
 *
 * Keys are tenant-prefixed and sanitised so one tenant can never read another's
 * objects and a crafted key can't escape the storage root (path traversal).
 */
export interface StorageProvider {
  readonly name: string;
  put(key: string, bytes: Buffer, contentType: string): Promise<{ url: string }>;
  get(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
}

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf"
};

export function extensionForContentType(contentType: string): string {
  return CONTENT_TYPE_EXT[contentType.toLowerCase()] ?? "bin";
}

export function isAllowedContentType(contentType: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONTENT_TYPE_EXT, contentType.toLowerCase());
}

/**
 * Build a safe storage key. Strips anything that could traverse directories and
 * always namespaces by organisation + category. Pure — unit tested.
 */
export function buildObjectKey(input: {
  organisationId: string;
  category: string;
  id: string;
  contentType: string;
}): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const ext = extensionForContentType(input.contentType);
  return `${safe(input.organisationId)}/${safe(input.category)}/${safe(input.id)}.${ext}`;
}

export function createLocalStorageProvider(root: string): StorageProvider {
  const base = resolve(root);
  const pathFor = (key: string): string => {
    // Defense against traversal: the resolved path must stay under `base`.
    const target = resolve(base, key);
    if (target !== base && !target.startsWith(base + sep)) {
      throw new Error("Invalid storage key");
    }
    return target;
  };
  return {
    name: "local",
    async put(key, bytes) {
      const target = pathFor(key);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
      return { url: `/api/v1/uploads/${key}` };
    },
    async get(key) {
      try {
        const bytes = await readFile(pathFor(key));
        const ext = key.split(".").pop() ?? "";
        const contentType =
          Object.entries(CONTENT_TYPE_EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
        return { bytes, contentType };
      } catch {
        return null;
      }
    }
  };
}

// Non-literal specifier so the optional AWS SDK isn't required at build time —
// it's only present when OBJECT_STORAGE_PROVIDER=s3.
async function loadS3(): Promise<{
  S3Client: new (opts: unknown) => { send(cmd: unknown): Promise<{ Body?: { transformToByteArray(): Promise<Uint8Array> }; ContentType?: string }> };
  PutObjectCommand: new (opts: unknown) => unknown;
  GetObjectCommand: new (opts: unknown) => unknown;
}> {
  const specifier = "@aws-sdk/client-s3";
  return import(specifier);
}

export function createS3StorageProvider(): StorageProvider {
  const bucket = process.env.S3_BUCKET ?? "";
  return {
    name: "s3",
    async put(key, bytes, contentType) {
      const { S3Client, PutObjectCommand } = await loadS3();
      const client = new S3Client({ region: process.env.S3_REGION });
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }));
      const base = process.env.S3_PUBLIC_BASE_URL ?? `https://${bucket}.s3.${process.env.S3_REGION}.amazonaws.com`;
      return { url: `${base}/${key}` };
    },
    async get(key) {
      const { S3Client, GetObjectCommand } = await loadS3();
      const client = new S3Client({ region: process.env.S3_REGION });
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = res.Body;
      if (!body) return null;
      const bytes = Buffer.from(await body.transformToByteArray());
      return { bytes, contentType: res.ContentType ?? "application/octet-stream" };
    }
  };
}

let cached: StorageProvider | undefined;
export function getStorageProvider(): StorageProvider {
  if (!cached) {
    const env = getEnv();
    cached = env.objectStorageProvider === "s3" ? createS3StorageProvider() : createLocalStorageProvider(env.localObjectStorageRoot);
  }
  return cached;
}

export function resetStorageProviderCache(): void {
  cached = undefined;
}
