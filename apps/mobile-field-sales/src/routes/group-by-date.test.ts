import { describe, expect, it } from "vitest";
import { groupRoutesByDate, isoDate } from "./group-by-date";
import type { RoutePlanDetail } from "@orbit/api-client";

function plan(id: string, routeDate: string): RoutePlanDetail {
  return {
    id,
    organisationId: "org_acme",
    assignedUserId: "user_rep_1",
    routeDate,
    status: "planned",
    plannedDistanceMeters: 0,
    plannedDurationMinutes: 0,
    provider: "mock",
    stops: []
  };
}

describe("groupRoutesByDate", () => {
  it("partitions plans into today / upcoming / past relative to a reference date", () => {
    const result = groupRoutesByDate(
      [
        plan("a", "2026-05-28"),
        plan("b", "2026-05-29"),
        plan("c", "2026-05-27"),
        plan("d", "2026-05-28"),
        plan("e", "2026-06-01")
      ],
      "2026-05-28"
    );

    expect(result.today.map((p) => p.id)).toEqual(["a", "d"]);
    expect(result.upcoming.map((p) => p.id)).toEqual(["b", "e"]);
    expect(result.past.map((p) => p.id)).toEqual(["c"]);
  });

  it("sorts upcoming ascending and past descending", () => {
    const result = groupRoutesByDate(
      [
        plan("p1", "2026-05-25"),
        plan("p2", "2026-05-20"),
        plan("u1", "2026-06-10"),
        plan("u2", "2026-06-02")
      ],
      "2026-05-28"
    );

    expect(result.upcoming.map((p) => p.id)).toEqual(["u2", "u1"]);
    expect(result.past.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("isoDate formats local date as YYYY-MM-DD", () => {
    const fixed = new Date(2026, 4, 28, 14, 30); // May = month 4
    expect(isoDate(fixed)).toBe("2026-05-28");
  });
});
