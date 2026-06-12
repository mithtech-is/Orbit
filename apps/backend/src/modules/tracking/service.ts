export default class TrackingModuleService {
  listTenantModules() {
    return ["consent", "work_sessions", "location_pings", "last_known_locations"];
  }
}
