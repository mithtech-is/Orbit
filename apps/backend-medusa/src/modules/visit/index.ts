import { Module } from "@medusajs/framework/utils";
import VisitModuleService from "./service";

export const VISIT_MODULE = "visit";

export default Module(VISIT_MODULE, {
  service: VisitModuleService
});
