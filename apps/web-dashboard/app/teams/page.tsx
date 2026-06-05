"use client";

import type { JSX } from "react";
import { useEffect, useState } from "react";
import { Plus, X, Users } from "lucide-react";
import { apiClient, safeFetch } from "../api-service";
import type { TeamSummary, UserSummary } from "@orbit/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TeamsPage(): JSX.Element {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [addSel, setAddSel] = useState<Record<string, string>>({});

  async function load() {
    const [t, u] = await Promise.all([
      safeFetch(() => apiClient.listTeams(), null),
      safeFetch(() => apiClient.listUsers(), null)
    ]);
    if (t) { setTeams(t.items); setError(null); } else setError("We couldn't load teams. Please try again.");
    if (u) setUsers(u.items.filter((x) => x.active));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  async function createTeam() {
    if (!newName.trim()) return;
    setBusy(true);
    try { await apiClient.createTeam(newName.trim()); setNewName(""); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Create failed."); }
    finally { setBusy(false); }
  }
  async function addMember(teamId: string) {
    const userId = addSel[teamId];
    if (!userId) return;
    try { await apiClient.addTeamMember(teamId, userId); setAddSel((m) => ({ ...m, [teamId]: "" })); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Add failed."); }
  }
  async function removeMember(teamId: string, userId: string) {
    try { await apiClient.removeTeamMember(teamId, userId); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Remove failed."); }
  }
  async function removeTeam(team: TeamSummary) {
    if (!confirm(`Delete team "${team.name}"? Members are unassigned (not deleted).`)) return;
    try { await apiClient.deleteTeam(team.id); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Delete failed."); }
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Teams</h1>
          <p className="mt-1 text-sm text-muted-foreground">Group representatives into teams so managers can plan and report by team.</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${teams.length} ${teams.length === 1 ? "team" : "teams"}`}</Badge>
      </div>

      {error ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-[220px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">New team name</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Bengaluru Central" onKeyDown={(e) => { if (e.key === "Enter") void createTeam(); }} />
          </div>
          <Button onClick={() => void createTeam()} disabled={busy || !newName.trim()}><Plus className="h-4 w-4" /> Create team</Button>
        </CardContent>
      </Card>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading teams…</p>
      ) : teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">No teams yet</h3>
            <p className="text-sm text-muted-foreground">Create your first team above, then add representatives to it.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {teams.map((team) => {
            const available = users.filter((u) => !team.memberIds.includes(u.id));
            return (
              <Card key={team.id}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                  <CardTitle className="text-base">{team.name}</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => void removeTeam(team)}>Delete</Button>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {team.memberIds.length === 0 ? (
                      <span className="text-sm text-muted-foreground">No members yet.</span>
                    ) : team.memberIds.map((id) => (
                      <Badge key={id} variant="secondary" className="gap-1">
                        {userName(id)}
                        <button onClick={() => void removeMember(team.id, id)} aria-label={`Remove ${userName(id)}`} className="ml-1 rounded-sm hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={addSel[team.id] ?? ""} onValueChange={(v) => setAddSel((m) => ({ ...m, [team.id]: v }))}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Add a representative…" /></SelectTrigger>
                      <SelectContent>
                        {available.length === 0 ? <SelectItem value="__none" disabled>Everyone is already a member</SelectItem>
                          : available.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.role.replace(/_/g, " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="secondary" onClick={() => void addMember(team.id)} disabled={!addSel[team.id]}>Add</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
