import { Module } from "@medusajs/framework/utils";
import RoutePlanningModuleService from "./service";

export const ROUTE_PLANNING_MODULE = "route_planning";

export default Module(ROUTE_PLANNING_MODULE, {
  service: RoutePlanningModuleService
});
