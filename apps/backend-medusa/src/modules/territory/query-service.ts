export interface TerritoryContainmentInput {
  outlet: {
    latitude: number;
    longitude: number;
  };
  territory: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  };
}

export interface TerritoryRow {
  id: string;
  organisation_id: string;
  name: string;
  min_latitude: string | number;
  max_latitude: string | number;
  min_longitude: string | number;
  max_longitude: string | number;
}

export interface TerritorySummary {
  id: string;
  organisationId: string;
  name: string;
  bounds: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  };
}

export interface TerritoryRepository {
  queryTerritories(organisationId: string): Promise<TerritoryRow[]>;
}

export async function listTenantTerritories(
  repository: TerritoryRepository,
  organisationId: string
): Promise<TerritorySummary[]> {
  const rows = await repository.queryTerritories(organisationId);

  return rows.map((row) => ({
    id: row.id,
    organisationId: row.organisation_id,
    name: row.name,
    bounds: {
      minLatitude: Number(row.min_latitude),
      maxLatitude: Number(row.max_latitude),
      minLongitude: Number(row.min_longitude),
      maxLongitude: Number(row.max_longitude)
    }
  }));
}

export function isOutletInsideTerritory({ outlet, territory }: TerritoryContainmentInput): boolean {
  return (
    outlet.latitude >= territory.minLatitude &&
    outlet.latitude <= territory.maxLatitude &&
    outlet.longitude >= territory.minLongitude &&
    outlet.longitude <= territory.maxLongitude
  );
}
