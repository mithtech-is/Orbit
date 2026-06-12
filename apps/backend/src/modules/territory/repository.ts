import { getDatabasePool, queryRows } from "../../db/client.js";
import type { TerritoryRepository, TerritoryRow } from "./query-service.js";
import type { OutletRow } from "../lead-and-outlet/query-service.js";

export function createTerritoryRepository(): TerritoryRepository {
  return {
    queryTerritories(organisationId) {
      return queryRows<TerritoryRow>(
        `SELECT id,
                organisation_id,
                name,
                ST_YMin(ST_Envelope(boundary)) AS min_latitude,
                ST_YMax(ST_Envelope(boundary)) AS max_latitude,
                ST_XMin(ST_Envelope(boundary)) AS min_longitude,
                ST_XMax(ST_Envelope(boundary)) AS max_longitude
         FROM territory
         WHERE organisation_id = $1
         ORDER BY name ASC`,
        [organisationId]
      );
    }
  };
}

export interface UpsertTerritoryInput {
  id: string;
  organisationId: string;
  name: string;
  /** WKT MultiPolygon string in SRID 4326. */
  boundaryWkt: string;
}

export async function insertTerritory(input: UpsertTerritoryInput): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO territory (id, organisation_id, name, boundary)
     VALUES ($1, $2, $3, ST_GeomFromText($4, 4326))`,
    [input.id, input.organisationId, input.name, input.boundaryWkt]
  );
}

export async function updateTerritory(input: UpsertTerritoryInput): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `UPDATE territory
     SET name = $1, boundary = ST_GeomFromText($2, 4326)
     WHERE id = $3 AND organisation_id = $4`,
    [input.name, input.boundaryWkt, input.id, input.organisationId]
  );
}

export async function deleteTerritory(id: string, organisationId: string): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(`DELETE FROM territory WHERE id = $1 AND organisation_id = $2`, [id, organisationId]);
}

/**
 * Returns all outlets whose `location` falls inside the given territory's `boundary`
 * (PostGIS ST_Contains). Tenant-scoped: outlet AND territory must share organisation_id.
 */
export async function queryOutletsInTerritory(
  organisationId: string,
  territoryId: string
): Promise<OutletRow[]> {
  return queryRows<OutletRow>(
    `SELECT o.id,
            o.organisation_id,
            o.name,
            ST_Y(o.location::geometry) AS latitude,
            ST_X(o.location::geometry) AS longitude
     FROM outlet o
     JOIN territory t
       ON t.organisation_id = o.organisation_id
      AND t.id = $2
     WHERE o.organisation_id = $1
       AND ST_Contains(t.boundary, o.location::geometry)
     ORDER BY o.name ASC`,
    [organisationId, territoryId]
  );
}
