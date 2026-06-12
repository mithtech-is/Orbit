import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildObjectKey,
  extensionForContentType,
  isAllowedContentType,
  createLocalStorageProvider
} from "./storage-provider.js";

describe("content type helpers", () => {
  it("maps known image/pdf types to extensions and rejects others", () => {
    expect(extensionForContentType("image/jpeg")).toBe("jpg");
    expect(extensionForContentType("image/png")).toBe("png");
    expect(extensionForContentType("application/pdf")).toBe("pdf");
    expect(extensionForContentType("application/x-evil")).toBe("bin");
    expect(isAllowedContentType("image/webp")).toBe(true);
    expect(isAllowedContentType("text/html")).toBe(false);
  });
});

describe("buildObjectKey", () => {
  it("namespaces by org + category and sanitises traversal characters", () => {
    const key = buildObjectKey({ organisationId: "org_1", category: "visit_photo", id: "att_9", contentType: "image/jpeg" });
    expect(key).toBe("org_1/visit_photo/att_9.jpg");
  });

  it("strips slashes/dots that could escape the namespace", () => {
    const key = buildObjectKey({ organisationId: "../../etc", category: "x/y", id: "a/../b", contentType: "image/png" });
    expect(key).not.toContain("..");
    expect(key.split("/")).toHaveLength(3); // org/category/id.ext — no extra path segments
  });
});

describe("local storage provider", () => {
  it("round-trips bytes and returns a download url", async () => {
    const root = mkdtempSync(join(tmpdir(), "rp-store-"));
    const store = createLocalStorageProvider(root);
    const key = "org_1/visit_photo/att_1.png";
    const bytes = Buffer.from([1, 2, 3, 4]);
    const { url } = await store.put(key, bytes, "image/png");
    expect(url).toBe("/api/v1/uploads/org_1/visit_photo/att_1.png");
    const got = await store.get(key);
    expect(got?.bytes.equals(bytes)).toBe(true);
    expect(got?.contentType).toBe("image/png");
  });

  it("returns null for a missing object", async () => {
    const root = mkdtempSync(join(tmpdir(), "rp-store-"));
    const store = createLocalStorageProvider(root);
    expect(await store.get("org_1/x/missing.jpg")).toBeNull();
  });

  it("rejects a path-traversal key", async () => {
    const root = mkdtempSync(join(tmpdir(), "rp-store-"));
    const store = createLocalStorageProvider(root);
    await expect(store.put("../../escape.png", Buffer.from([0]), "image/png")).rejects.toThrow(/Invalid storage key/);
  });
});
