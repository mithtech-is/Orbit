import { Module } from "@medusajs/framework/utils";
import NotificationModuleService from "./service";

export const NOTIFICATION_MODULE = "notification";

export default Module(NOTIFICATION_MODULE, {
  service: NotificationModuleService
});
