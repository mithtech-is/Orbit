import { describe, expect, it, vi } from "vitest";
import { mountMedusaRoute } from "./medusa-adapter.js";
import type { MedusaRouteRequest, MedusaRouteResponse } from "./types.js";

describe("mountMedusaRoute", () => {
  it("forwards headers + body to the wrapped handler and writes status/json through the Medusa response", async () => {
    const handler = vi.fn(async (req: MedusaRouteRequest, res: MedusaRouteResponse) => {
      const sample = (req.body as Record<string, string> | undefined)?.name ?? "";
      res.status(201).json({ ok: true, name: sample, ua: req.headers["user-agent"] });
    });

    const wrapped = mountMedusaRoute(handler);

    const medusaStatus = vi.fn().mockReturnThis();
    const medusaJson = vi.fn();
    const medusaRes = { status: medusaStatus, json: medusaJson };
    await wrapped(
      { url: "/api/v1/things", headers: { "user-agent": "test/1.0" }, body: { name: "abc" } },
      medusaRes
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(medusaStatus).toHaveBeenCalledWith(201);
    expect(medusaJson).toHaveBeenCalledWith({ ok: true, name: "abc", ua: "test/1.0" });
  });

  it("propagates Medusa-parsed :id params via x-resource-id header", async () => {
    const handler = vi.fn(async (req: MedusaRouteRequest, res: MedusaRouteResponse) => {
      res.status(200).json({ id: req.headers["x-resource-id"] });
    });
    const wrapped = mountMedusaRoute(handler);

    const json = vi.fn();
    await wrapped(
      { url: "/api/v1/leads/lead_42", headers: {}, params: { id: "lead_42" } },
      { status: () => ({ json } as never), json }
    );
    expect(json).toHaveBeenCalledWith({ id: "lead_42" });
  });

  it("appends raw url via x-request-url so query-string parsing inside the handler still works", async () => {
    const handler = vi.fn(async (req: MedusaRouteRequest, res: MedusaRouteResponse) => {
      res.status(200).json({ raw: req.headers["x-request-url"] });
    });
    const wrapped = mountMedusaRoute(handler);

    const json = vi.fn();
    await wrapped(
      { url: "/api/v1/audit-log?actionPrefix=tracking.", headers: {} },
      { status: () => ({ json } as never), json }
    );
    expect(json).toHaveBeenCalledWith({ raw: "/api/v1/audit-log?actionPrefix=tracking." });
  });
});
