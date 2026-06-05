import { Module } from "@medusajs/framework/utils";
import LeadAndOutletModuleService from "./service";

export const LEAD_AND_OUTLET_MODULE = "lead_and_outlet";

export default Module(LEAD_AND_OUTLET_MODULE, {
  service: LeadAndOutletModuleService
});
