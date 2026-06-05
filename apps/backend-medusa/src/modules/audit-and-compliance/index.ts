import { Module } from "@medusajs/framework/utils";
import AuditAndComplianceModuleService from "./service";

export const AUDIT_AND_COMPLIANCE_MODULE = "audit_and_compliance";

export default Module(AUDIT_AND_COMPLIANCE_MODULE, {
  service: AuditAndComplianceModuleService
});
