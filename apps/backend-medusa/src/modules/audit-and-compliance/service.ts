export default class AuditAndComplianceModuleService {
  listTenantModules() {
    return ["audit_logs", "data_exports", "data_deletions", "retention_jobs"];
  }
}
