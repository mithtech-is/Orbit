import type { RoutePlanDetail } from "@orbit/api-client";

/** Returns YYYY-MM-DD for the local date of `at`. */
export function isoDate(at: Date = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface GroupedRoutes {
  today: RoutePlanDetail[];
  upcoming: RoutePlanDetail[];
  past: RoutePlanDetail[];
}

export function groupRoutesByDate(
  plans: RoutePlanDetail[],
  reference: string = isoDate()
): GroupedRoutes {
  const today: RoutePlanDetail[] = [];
  const upcoming: RoutePlanDetail[] = [];
  const past: RoutePlanDetail[] = [];

  for (const plan of plans) {
    if (plan.routeDate === reference) today.push(plan);
    else if (plan.routeDate > reference) upcoming.push(plan);
    else past.push(plan);
  }

  upcoming.sort((a, b) => a.routeDate.localeCompare(b.routeDate));
  past.sort((a, b) => b.routeDate.localeCompare(a.routeDate));
  return { today, upcoming, past };
}
