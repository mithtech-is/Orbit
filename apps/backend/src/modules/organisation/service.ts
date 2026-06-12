export default class OrganisationModuleService {
  listTenantModules() {
    return ["organisation", "teams", "memberships", "tenant_settings"];
  }
}
