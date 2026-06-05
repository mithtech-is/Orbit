import { Module } from "@medusajs/framework/utils";
import TerritoryModuleService from "./service";

export const TERRITORY_MODULE = "territory";

export default Module(TERRITORY_MODULE, {
  service: TerritoryModuleService
});
