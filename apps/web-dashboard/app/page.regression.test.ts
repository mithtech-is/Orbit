import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const overviewSrc = readFileSync(join(here, "page.tsx"), "utf8");

describe("dashboard overview regression", () => {
  it("does not contain hardcoded demo metrics", () => {
    // Block the specific patterns that the previous demo overview hardcoded.
    expect(overviewSrc).not.toMatch(/"Active reps",\s*"3"/);
    expect(overviewSrc).not.toMatch(/"Visits planned",\s*"18"/);
    expect(overviewSrc).not.toMatch(/"Route adherence",\s*"82%"/);
    expect(overviewSrc).not.toMatch(/"Review alerts",\s*"2"/);
  });

  it("renders metrics from the reports summary API", () => {
    expect(overviewSrc).toContain("apiClient.getReportSummary");
    expect(overviewSrc).toContain("summary?.activeSessionCount");
    expect(overviewSrc).toContain("summary?.outletCount");
    expect(overviewSrc).toContain("summary?.leadCount");
    expect(overviewSrc).toContain("summary?.visitCount");
    expect(overviewSrc).toContain("summary?.orderCount");
  });
});
