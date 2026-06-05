import { defineConfig } from "@medusajs/framework/utils";

const medusaConfig = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      jwtSecret: process.env.MEDUSA_JWT_SECRET,
      cookieSecret: process.env.MEDUSA_COOKIE_SECRET,
      authCors: process.env.AUTH_CORS ?? "http://localhost:3000,http://localhost:5173",
      storeCors: process.env.STORE_CORS ?? "http://localhost:3000,http://localhost:5173",
      adminCors: process.env.ADMIN_CORS ?? "http://localhost:3000,http://localhost:5173"
    }
  },
  admin: {
    backendUrl: process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9001"
  },
  modules: {
    organisation: { resolve: "./src/modules/organisation" },
    identity_and_access: { resolve: "./src/modules/identity-and-access" },
    territory: { resolve: "./src/modules/territory" },
    lead_and_outlet: { resolve: "./src/modules/lead-and-outlet" },
    visit: { resolve: "./src/modules/visit" },
    tracking: { resolve: "./src/modules/tracking" },
    route_planning: { resolve: "./src/modules/route-planning" },
    sync: { resolve: "./src/modules/sync" },
    notification: { resolve: "./src/modules/notification" },
    audit_and_compliance: { resolve: "./src/modules/audit-and-compliance" }
  }
});

export default medusaConfig;
