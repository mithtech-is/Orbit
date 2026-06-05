import { describe, expect, it } from "vitest";
import { createInMemoryTokenStore } from "./in-memory-token-store";

describe("in-memory token store", () => {
  it("returns null when no token has been saved", async () => {
    const store = createInMemoryTokenStore();
    expect(await store.load()).toBeNull();
  });

  it("round-trips a saved token and clears on demand", async () => {
    const store = createInMemoryTokenStore();
    await store.save("jwt-abc");
    expect(await store.load()).toBe("jwt-abc");

    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
