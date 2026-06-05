import { Module } from "@medusajs/framework/utils";
import IdentityAndAccessModuleService from "./service";

export const IDENTITY_AND_ACCESS_MODULE = "identity_and_access";

export default Module(IDENTITY_AND_ACCESS_MODULE, {
  service: IdentityAndAccessModuleService
});
