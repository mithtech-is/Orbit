export default class VisitModuleService {
  listTenantModules() {
    return ["visits", "checkins", "checkouts", "outcomes", "attachments", "exceptions"];
  }
}
