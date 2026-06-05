export default class IdentityAndAccessModuleService {
  listTenantModules() {
    return ["users", "roles", "permissions", "devices"];
  }
}
