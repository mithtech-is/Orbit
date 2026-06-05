import { describe, expect, it } from "vitest";
import { createApiClient } from "./client.js";

describe("api client", () => {
  it("passes auth headers to session endpoint", async () => {
    const calls: Array<{ url: string; headers?: HeadersInit }> = [];
    const client = createApiClient({
      baseUrl: "http://localhost:9000",
      headers: {
        "x-field-sales-user-id": "user_1"
      },
      fetcher: async (url, init) => {
        calls.push({ url: String(url), headers: init?.headers });
        return Response.json({
          userId: "user_1",
          organisationId: "org_1",
          role: "organisation_admin",
          permissions: ["organisation:manage"]
        });
      }
    });

    const session = await client.getSession();

    expect(session.organisationId).toBe("org_1");
    expect(calls[0]).toEqual({
      url: "http://localhost:9000/api/v1/auth/session",
      headers: {
        "x-field-sales-user-id": "user_1"
      }
    });
  });

  it("requests lead, outlet and territory lists from versioned endpoints", async () => {
    const paths: string[] = [];
    const client = createApiClient({
      baseUrl: "http://localhost:9000",
      fetcher: async (url) => {
        paths.push(String(url));
        return Response.json({ organisationId: "org_acme", dataSource: "test", items: [] });
      }
    });

    await client.listLeads();
    await client.listOutlets();
    await client.listTerritories();

    expect(paths).toEqual([
      "http://localhost:9000/api/v1/leads",
      "http://localhost:9000/api/v1/outlets",
      "http://localhost:9000/api/v1/territories"
    ]);
  });

  it("reads visit proof photos from visit extras", async () => {
    const client = createApiClient({
      baseUrl: "http://localhost:9000",
      fetcher: async () => Response.json({
        organisationId: "org_1",
        visitId: "visit_1",
        feedbackRating: null,
        npsScore: null,
        feedbackText: null,
        signedBy: null,
        signaturePath: null,
        totalExpenseCents: 0,
        expenses: [],
        competitorIntel: [],
        samples: [],
        proofPhotos: [{
          id: "att_1",
          contentType: "image/jpeg",
          caption: "Visit proof photo",
          sizeBytes: 1200,
          url: "/api/v1/uploads/att_1",
          createdAt: "2026-06-03T10:00:00.000Z"
        }]
      })
    });

    const extras = await client.getVisitExtras("visit_1");

    expect(extras.proofPhotos[0].url).toBe("/api/v1/uploads/att_1");
  });
});
