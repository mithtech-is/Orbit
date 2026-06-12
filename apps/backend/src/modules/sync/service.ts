export default class SyncModuleService {
  listTenantModules() {
    return ["device_cursors", "client_mutations", "idempotency_keys", "conflicts"];
  }
}
