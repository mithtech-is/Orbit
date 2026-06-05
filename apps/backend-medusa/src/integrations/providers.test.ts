import { describe, it, expect } from "vitest";
import { selectEmailProvider, createLogEmailProvider } from "./email-provider.js";
import { selectPushProvider, createLogPushProvider } from "./push-provider.js";

describe("email provider selection", () => {
  it("selects log vs smtp by name", () => {
    expect(selectEmailProvider("log").name).toBe("log");
    expect(selectEmailProvider("smtp").name).toBe("smtp");
  });

  it("log provider reports success", async () => {
    const r = await createLogEmailProvider().send({ to: "a@b.c", subject: "hi", text: "body" });
    expect(r.ok).toBe(true);
  });
});

describe("push provider selection", () => {
  it("selects log vs expo by name", () => {
    expect(selectPushProvider("log").name).toBe("log");
    expect(selectPushProvider("expo").name).toBe("expo");
  });

  it("log provider counts recipients and no-ops on empty", async () => {
    const provider = createLogPushProvider();
    expect((await provider.send({ to: [], title: "t", body: "b" })).sent).toBe(0);
    expect((await provider.send({ to: ["d1", "d2"], title: "t", body: "b" })).sent).toBe(2);
  });
});
