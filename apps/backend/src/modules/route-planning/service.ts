export default class RoutePlanningModuleService {
  listTenantModules() {
    return ["route_plans", "route_stops", "optimisation_requests", "route_versions"];
  }
}
