import type { DemoUser } from "@orbit/shared-types";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const organisation = {
  id: "mithtech",
  name: "MithTech",
  slug: "mithtech"
};

const users: DemoUser[] = [
  { id: "user_admin", organisationId: organisation.id, email: "admin@acme-fieldsales.test", name: "Anika Rao", role: "organisation_admin" },
  { id: "user_manager", organisationId: organisation.id, email: "manager@acme-fieldsales.test", name: "Vikram Mehta", role: "sales_manager" },
  { id: "user_ops", organisationId: organisation.id, email: "ops@acme-fieldsales.test", name: "Neha Kapoor", role: "operations_user" },
  { id: "user_rep_1", organisationId: organisation.id, email: "rep1@acme-fieldsales.test", name: "Rohan Iyer", role: "field_sales_representative" },
  { id: "user_rep_2", organisationId: organisation.id, email: "rep2@acme-fieldsales.test", name: "Farah Khan", role: "field_sales_representative" },
  { id: "user_rep_3", organisationId: organisation.id, email: "rep3@acme-fieldsales.test", name: "Amit Das", role: "field_sales_representative" }
];

const outlets = [
  { id: "outlet_1", name: "Indiranagar Fresh Mart", latitude: 12.9719, longitude: 77.6412 },
  { id: "outlet_2", name: "Koramangala Daily Needs", latitude: 12.9352, longitude: 77.6245 },
  { id: "outlet_3", name: "MG Road Super Store", latitude: 12.9756, longitude: 77.6068 },
  { id: "outlet_4", name: "Ulsoor Market Point", latitude: 12.9817, longitude: 77.6286 },
  { id: "outlet_5", name: "Domlur Corner Retail", latitude: 12.9611, longitude: 77.6387 },
  { id: "outlet_6", name: "Jayanagar Value Store", latitude: 12.925, longitude: 77.5938 },
  { id: "outlet_7", name: "BTM Provision House", latitude: 12.9166, longitude: 77.6101 },
  { id: "outlet_8", name: "HSR Daily Basket", latitude: 12.9116, longitude: 77.6474 },
  { id: "outlet_9", name: "Whitefield Trade Mart", latitude: 12.9698, longitude: 77.75 },
  { id: "outlet_10", name: "Marathahalli Fresh Hub", latitude: 12.9569, longitude: 77.7011 },
  { id: "outlet_11", name: "Malleshwaram Essentials", latitude: 13.0031, longitude: 77.5643 },
  { id: "outlet_12", name: "Rajajinagar Wholesale", latitude: 12.9915, longitude: 77.5523 },
  { id: "outlet_13", name: "Hebbal Super Bazaar", latitude: 13.0358, longitude: 77.597 },
  { id: "outlet_14", name: "Yelahanka Retail Point", latitude: 13.1007, longitude: 77.5963 },
  { id: "outlet_15", name: "Electronic City Quick Shop", latitude: 12.8399, longitude: 77.677 }
];

const leads = Array.from({ length: 20 }, (_, index) => ({
  id: `lead_${index + 1}`,
  name: `Lead ${index + 1} Bengaluru`,
  outletId: outlets[index % outlets.length].id,
  status: index % 4 === 0 ? "qualified" : "new",
  priority: 1 + (index % 5),
  assignedUserId: `user_rep_${(index % 3) + 1}`
}));

const products = [
  { id: "prod_1", sku: "FS-BEV-001", name: "Sparkling Water 500ml", inventoryAvailable: 420, unitPriceCents: 5500 },
  { id: "prod_2", sku: "FS-SNK-002", name: "Trail Mix Pack", inventoryAvailable: 260, unitPriceCents: 12500 },
  { id: "prod_3", sku: "FS-HPC-003", name: "Handwash Refill", inventoryAvailable: 180, unitPriceCents: 9900 },
  { id: "prod_4", sku: "FS-DAL-004", name: "Organic Dal 1kg", inventoryAvailable: 310, unitPriceCents: 14500 },
  { id: "prod_5", sku: "FS-OIL-005", name: "Cold Pressed Oil 1L", inventoryAvailable: 95, unitPriceCents: 42500 }
];

const territories = [
  { id: "territory_central", name: "Bengaluru Central", wkt: "MULTIPOLYGON(((77.55 12.90,77.68 12.90,77.68 13.02,77.55 13.02,77.55 12.90)))" },
  { id: "territory_east", name: "Bengaluru East", wkt: "MULTIPOLYGON(((77.63 12.88,77.78 12.88,77.78 13.02,77.63 13.02,77.63 12.88)))" }
];

const routePlans = ["user_rep_1", "user_rep_2", "user_rep_3"].map((repId, index) => ({
  id: `route_${index + 1}`,
  assignedUserId: repId,
  routeDate: "2026-05-27",
  status: "assigned",
  plannedDistanceMeters: 9800 + index * 1600,
  plannedDurationMinutes: 260 + index * 20,
  provider: "mock",
  providerReference: `mock-route-${index + 1}`
}));

const routeStops = routePlans.flatMap((route, routeIndex) =>
  outlets.slice(routeIndex * 5, routeIndex * 5 + 5).map((outlet, stopIndex) => ({
    id: `route_stop_${routeIndex + 1}_${stopIndex + 1}`,
    routePlanId: route.id,
    outletId: outlet.id,
    stopOrder: stopIndex + 1,
    status: stopIndex < 2 ? "completed" : "planned",
    expectedDurationMinutes: 25
  }))
);

const visits = routeStops.map((stop, index) => ({
  id: `visit_${index + 1}`,
  outletId: stop.outletId,
  assignedUserId: routePlans.find((route) => route.id === stop.routePlanId)?.assignedUserId ?? "user_rep_1",
  visitDate: "2026-05-27",
  status: stop.status === "completed" ? "completed" : "scheduled",
  outcome: stop.status === "completed" ? "order_taken" : null,
  notes: stop.status === "completed" ? "Shelf check completed and buyer confirmed reorder." : null
}));

const orders = [
  { id: "order_online_1", outletId: "outlet_1", repUserId: "user_rep_1", status: "accepted", source: "online", totalCents: 84500 },
  { id: "order_online_2", outletId: "outlet_6", repUserId: "user_rep_2", status: "accepted", source: "online", totalCents: 121000 },
  { id: "order_offline_1", outletId: "outlet_11", repUserId: "user_rep_3", status: "synced", source: "offline", totalCents: 67500 }
];

const notifications = [
  { id: "notif_1", userId: "user_rep_1", type: "route.assigned", title: "Today route assigned", status: "unread" },
  { id: "notif_2", userId: "user_manager", type: "sync.failed", title: "One order needed sync retry", status: "unread" },
  { id: "notif_3", userId: "user_ops", type: "geofence.exception", title: "Check-in exception pending review", status: "unread" }
];

const permissionsByRole = {
  organisation_admin: [
    "organisation:manage", "user:manage", "team:manage", "policy:manage",
    "audit:read", "report:read",
    "lead:read", "lead:write", "outlet:read", "outlet:write",
    "territory:manage", "route:plan", "tracking:view_live"
  ],
  sales_manager: ["lead:read", "lead:write", "outlet:read", "route:plan", "tracking:view_live", "report:read"],
  operations_user: ["lead:read", "lead:write", "outlet:read", "outlet:write", "route:plan", "order:create", "report:read"],
  field_sales_representative: ["lead:read", "outlet:read", "visit:write", "tracking:send", "order:create"],
  readonly_analyst: ["report:read"],
  platform_admin: ["organisation:manage", "audit:read"]
} as const;

const seedData = { organisation, users, outlets, territories, leads, products, routePlans, routeStops, visits, orders, notifications };
const mode = process.argv.includes("--json") ? "json" : process.argv.includes("--sql") ? "sql" : "db";
/** --minimal seeds ONLY the bare tenant scaffold (organisation, organisation_setting,
 *  app_user, role_permission, one team, team_member). No outlets / leads / territories /
 *  routes / visits / orders / notifications. Use this when you want a clean install
 *  and intend to add all business data through the UI / API. */
const minimal = process.argv.includes("--minimal");

if (mode === "json") {
  process.stdout.write(`${JSON.stringify(seedData, null, 2)}\n`);
} else if (mode === "sql") {
  process.stdout.write(generateSeedSql());
} else {
  await seedDatabase();
}

async function seedDatabase() {
  const connectionString = process.env.DATABASE_URL ?? "postgres://fieldsales:fieldsales@localhost:5432/fieldsales";
  const client = new pg.Client({ connectionString });
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const schemaSql = await readFile(join(root, "apps/backend-medusa/src/db/schema.sql"), "utf8");

  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query(schemaSql);
    await client.query(
      `INSERT INTO organisation (id, name, slug)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
      [organisation.id, organisation.name, organisation.slug]
    );
    await client.query(
      `INSERT INTO organisation_setting (organisation_id)
       VALUES ($1)
       ON CONFLICT (organisation_id) DO NOTHING`,
      [organisation.id]
    );

    for (const user of users) {
      await client.query(
        `INSERT INTO app_user (id, organisation_id, email, name, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role`,
        [user.id, user.organisationId, user.email, user.name, user.role]
      );
    }

    for (const [role, permissions] of Object.entries(permissionsByRole)) {
      for (const permission of permissions) {
        await client.query(
          `INSERT INTO role_permission (organisation_id, role, permission)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [organisation.id, role, permission]
        );
      }
    }

    await client.query(
      `INSERT INTO team (id, organisation_id, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      ["team_bengaluru_central", organisation.id, "Bengaluru Central"]
    );

    for (const userId of ["user_manager", "user_rep_1", "user_rep_2", "user_rep_3"]) {
      await client.query(
        `INSERT INTO team_member (team_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        ["team_bengaluru_central", userId]
      );
    }

    if (!minimal) {
      for (const outlet of outlets) {
        await client.query(
          `INSERT INTO outlet (id, organisation_id, name, location)
           VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location`,
          [outlet.id, organisation.id, outlet.name, outlet.longitude, outlet.latitude]
        );
      }

      await applySeedSql(client, generateDomainSeedStatements());
    }

    await client.query(
      `INSERT INTO audit_log (organisation_id, actor_user_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [organisation.id, "user_admin", minimal ? "tenant.bootstrapped" : "demo.seeded", "organisation", organisation.id, JSON.stringify({ users: users.length, outlets: minimal ? 0 : outlets.length, mode: minimal ? "minimal" : "demo" })]
    );

    await client.query("COMMIT");
    if (minimal) {
      process.stdout.write(`Bootstrapped tenant ${organisation.id} with ${users.length} users and 0 outlets (minimal mode).\n`);
    } else {
      process.stdout.write(`Seeded demo organisation ${organisation.id} with ${users.length} users and ${outlets.length} outlets.\n`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function applySeedSql(client: pg.Client, statements: string[]) {
  for (const statement of statements) {
    await client.query(statement);
  }
}

function generateSeedSql(): string {
  const parts = minimal
    ? generateBootstrapSeedStatements()
    : [...generateBootstrapSeedStatements(), ...generateDomainSeedStatements()];
  return `${parts.join("\n")}\n`;
}

function generateBootstrapSeedStatements(): string[] {
  const sql: string[] = [
    `INSERT INTO organisation (id, name, slug) VALUES (${q(organisation.id)}, ${q(organisation.name)}, ${q(organisation.slug)}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;`,
    `INSERT INTO organisation_setting (organisation_id) VALUES (${q(organisation.id)}) ON CONFLICT (organisation_id) DO NOTHING;`,
    `INSERT INTO team (id, organisation_id, name) VALUES ('team_bengaluru_central', ${q(organisation.id)}, 'Bengaluru Central') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;`
  ];

  for (const user of users) {
    sql.push(`INSERT INTO app_user (id, organisation_id, email, name, role) VALUES (${q(user.id)}, ${q(user.organisationId)}, ${q(user.email)}, ${q(user.name)}, ${q(user.role)}) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role;`);
  }

  for (const [role, permissions] of Object.entries(permissionsByRole)) {
    for (const permission of permissions) {
      sql.push(`INSERT INTO role_permission (organisation_id, role, permission) VALUES (${q(organisation.id)}, ${q(role)}, ${q(permission)}) ON CONFLICT DO NOTHING;`);
    }
  }

  for (const userId of ["user_manager", "user_rep_1", "user_rep_2", "user_rep_3"]) {
    sql.push(`INSERT INTO team_member (team_id, user_id) VALUES ('team_bengaluru_central', ${q(userId)}) ON CONFLICT DO NOTHING;`);
  }

  if (!minimal) {
    for (const outlet of outlets) {
      sql.push(`INSERT INTO outlet (id, organisation_id, name, location) VALUES (${q(outlet.id)}, ${q(organisation.id)}, ${q(outlet.name)}, ST_SetSRID(ST_MakePoint(${outlet.longitude}, ${outlet.latitude}), 4326)::geography) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location;`);
    }
  } else {
    // Suppress lint when the loop body is gated above.
    void outlets;
  }

  sql.push(`INSERT INTO audit_log (organisation_id, actor_user_id, action, target_type, target_id, metadata) VALUES (${q(organisation.id)}, 'user_admin', 'demo.seeded', 'organisation', ${q(organisation.id)}, '${JSON.stringify({ users: users.length, outlets: outlets.length }).replaceAll("'", "''")}');`);

  return sql;
}

function generateDomainSeedStatements(): string[] {
  const sql: string[] = [];

  for (const territory of territories) {
    sql.push(`INSERT INTO territory (id, organisation_id, name, boundary) VALUES (${q(territory.id)}, ${q(organisation.id)}, ${q(territory.name)}, ST_GeomFromText(${q(territory.wkt)}, 4326)) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, boundary = EXCLUDED.boundary;`);
  }

  for (const lead of leads) {
    sql.push(`INSERT INTO lead (id, organisation_id, outlet_id, name, status, priority, assigned_user_id) VALUES (${q(lead.id)}, ${q(organisation.id)}, ${q(lead.outletId)}, ${q(lead.name)}, ${q(lead.status)}, ${lead.priority}, ${q(lead.assignedUserId)}) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, priority = EXCLUDED.priority, assigned_user_id = EXCLUDED.assigned_user_id;`);
  }

  for (const product of products) {
    sql.push(`INSERT INTO field_product (id, organisation_id, sku, name, inventory_available, unit_price_cents) VALUES (${q(product.id)}, ${q(organisation.id)}, ${q(product.sku)}, ${q(product.name)}, ${product.inventoryAvailable}, ${product.unitPriceCents}) ON CONFLICT (id) DO UPDATE SET inventory_available = EXCLUDED.inventory_available, unit_price_cents = EXCLUDED.unit_price_cents;`);
  }

  for (const route of routePlans) {
    sql.push(`INSERT INTO route_plan (id, organisation_id, assigned_user_id, route_date, status, planned_distance_meters, planned_duration_minutes, provider, provider_reference) VALUES (${q(route.id)}, ${q(organisation.id)}, ${q(route.assignedUserId)}, ${q(route.routeDate)}, ${q(route.status)}, ${route.plannedDistanceMeters}, ${route.plannedDurationMinutes}, ${q(route.provider)}, ${q(route.providerReference)}) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;`);
  }

  for (const stop of routeStops) {
    sql.push(`INSERT INTO route_stop (id, organisation_id, route_plan_id, outlet_id, stop_order, status, expected_duration_minutes) VALUES (${q(stop.id)}, ${q(organisation.id)}, ${q(stop.routePlanId)}, ${q(stop.outletId)}, ${stop.stopOrder}, ${q(stop.status)}, ${stop.expectedDurationMinutes}) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;`);
  }

  for (const visit of visits) {
    sql.push(`INSERT INTO visit (id, organisation_id, outlet_id, assigned_user_id, visit_date, status, outcome, notes) VALUES (${q(visit.id)}, ${q(organisation.id)}, ${q(visit.outletId)}, ${q(visit.assignedUserId)}, ${q(visit.visitDate)}, ${q(visit.status)}, ${nullable(visit.outcome)}, ${nullable(visit.notes)}) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, outcome = EXCLUDED.outcome, notes = EXCLUDED.notes;`);
  }

  for (const order of orders) {
    sql.push(`INSERT INTO field_order (id, organisation_id, outlet_id, rep_user_id, status, source, total_cents) VALUES (${q(order.id)}, ${q(organisation.id)}, ${q(order.outletId)}, ${q(order.repUserId)}, ${q(order.status)}, ${q(order.source)}, ${order.totalCents}) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;`);
  }

  for (const notification of notifications) {
    sql.push(`INSERT INTO notification (id, organisation_id, user_id, type, title, status) VALUES (${q(notification.id)}, ${q(organisation.id)}, ${q(notification.userId)}, ${q(notification.type)}, ${q(notification.title)}, ${q(notification.status)}) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;`);
  }

  return sql;
}

function q(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function nullable(value: string | null): string {
  return value === null ? "NULL" : q(value);
}
