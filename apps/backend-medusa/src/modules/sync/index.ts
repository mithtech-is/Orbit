import { Module } from "@medusajs/framework/utils";
import SyncModuleService from "./service";

export const SYNC_MODULE = "sync";

export default Module(SYNC_MODULE, {
  service: SyncModuleService
});
