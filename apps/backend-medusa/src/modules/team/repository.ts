import { randomUUID } from "node:crypto";
import { getDatabasePool, queryRows } from "../../db/client.js";

export interface TeamWithMembers {
  id: string;
  name: string;
  memberIds: string[];
}

/** Teams in an org with their member user ids (for the Teams admin page). */
export async function listTeams(organisationId: string): Promise<TeamWithMembers[]> {
  const teams = await queryRows<{ id: string; name: string }>(
    `SELECT id, name FROM team WHERE organisation_id = $1 ORDER BY name`,
    [organisationId]
  );
  if (teams.length === 0) return [];
  const members = await queryRows<{ team_id: string; user_id: string }>(
    `SELECT tm.team_id, tm.user_id
     FROM team_member tm JOIN team t ON t.id = tm.team_id
     WHERE t.organisation_id = $1`,
    [organisationId]
  );
  const byTeam = new Map<string, string[]>();
  for (const m of members) {
    const list = byTeam.get(m.team_id) ?? [];
    list.push(m.user_id);
    byTeam.set(m.team_id, list);
  }
  return teams.map((t) => ({ id: t.id, name: t.name, memberIds: byTeam.get(t.id) ?? [] }));
}

export async function createTeam(organisationId: string, name: string): Promise<{ id: string; name: string }> {
  const id = `team_${randomUUID().slice(0, 8)}`;
  await getDatabasePool().query(
    `INSERT INTO team (id, organisation_id, name) VALUES ($1, $2, $3)`,
    [id, organisationId, name]
  );
  return { id, name };
}

export async function renameTeam(organisationId: string, teamId: string, name: string): Promise<boolean> {
  const res = await getDatabasePool().query(
    `UPDATE team SET name = $1 WHERE id = $2 AND organisation_id = $3`,
    [name, teamId, organisationId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function deleteTeam(organisationId: string, teamId: string): Promise<boolean> {
  const res = await getDatabasePool().query(
    `DELETE FROM team WHERE id = $1 AND organisation_id = $2`,
    [teamId, organisationId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** Add a member to a team (idempotent). Validates the team + user are in the org. */
export async function addTeamMember(organisationId: string, teamId: string, userId: string): Promise<boolean> {
  const ok = await queryRows<{ id: string }>(
    `SELECT t.id FROM team t WHERE t.id = $1 AND t.organisation_id = $2
       AND EXISTS (SELECT 1 FROM app_user u WHERE u.id = $3 AND u.organisation_id = $2)`,
    [teamId, organisationId, userId]
  );
  if (ok.length === 0) return false;
  await getDatabasePool().query(
    `INSERT INTO team_member (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [teamId, userId]
  );
  return true;
}

export async function removeTeamMember(organisationId: string, teamId: string, userId: string): Promise<void> {
  await getDatabasePool().query(
    `DELETE FROM team_member tm USING team t
     WHERE tm.team_id = t.id AND t.organisation_id = $1 AND tm.team_id = $2 AND tm.user_id = $3`,
    [organisationId, teamId, userId]
  );
}

/** User ids belonging to a team (used to scope route plans / reports to a team). */
export async function teamMemberIds(organisationId: string, teamId: string): Promise<string[]> {
  const rows = await queryRows<{ user_id: string }>(
    `SELECT tm.user_id FROM team_member tm JOIN team t ON t.id = tm.team_id
     WHERE t.organisation_id = $1 AND tm.team_id = $2`,
    [organisationId, teamId]
  );
  return rows.map((r) => r.user_id);
}
