import { Club, Fixture, TableEntry } from '../types';
import { world } from './worldManager';

export const ARG_LEAGUE_ID = 'L_ARG_1';

/** Fixtures de la fase de zonas (solo grupo regular senior). */
function argGroupFixtures(fixtures: Fixture[]): Fixture[] {
  return fixtures.filter(f => f.competitionId === ARG_LEAGUE_ID && f.squadType === 'SENIOR' && f.stage === 'GROUP');
}

/** Clubes participantes de la fase de zonas, derivados de los fixtures (no del estado actual). */
function participantClubs(fixtures: Fixture[]): Club[] {
  const ids = new Set(argGroupFixtures(fixtures).flatMap(f => [f.homeTeamId, f.awayTeamId]));
  return [...ids].map(id => world.getClub(id)).filter((c): c is Club => Boolean(c));
}

/**
 * Asignación determinística de zonas: clubes ordenados por reputación desc,
 * repartidos alternando (Zona A = pares, Zona B = impares). Así los clásicos
 * (River/Boca, Racing/Independiente, etc.) quedan en zonas distintas.
 * Debe coincidir con `Scheduler.generateZonedLeagueFixtures`.
 */
export function argentineZoneAssignments(fixtures: Fixture[]): { zoneA: Club[]; zoneB: Club[]; zoneOf: Map<string, number> } {
  const clubs = participantClubs(fixtures).sort((a, b) => b.reputation - a.reputation);
  const zoneA: Club[] = [];
  const zoneB: Club[] = [];
  const zoneOf = new Map<string, number>();
  clubs.forEach((c, i) => {
    const z = i % 2 === 0 ? 1 : 2;
    zoneOf.set(c.id, z);
    (z === 1 ? zoneA : zoneB).push(c);
  });
  return { zoneA, zoneB, zoneOf };
}

function newEntry(c: Club): TableEntry {
  return { clubId: c.id, clubName: c.name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}

/** Aplica el resultado de un partido a un único equipo si está presente en la tabla (ignora al rival ausente). */
function applyForTeam(table: Map<string, TableEntry>, clubId: string, scored: number, conceded: number) {
  const e = table.get(clubId);
  if (!e) return;
  e.played++;
  e.gf += scored;
  e.ga += conceded;
  if (scored > conceded) { e.won++; e.points += 3; }
  else if (scored < conceded) { e.lost++; }
  else { e.drawn++; e.points++; }
}

function buildTable(clubs: Club[], fixtures: Fixture[], clubFilter?: Set<string>): TableEntry[] {
  const table = new Map<string, TableEntry>();
  clubs.forEach(c => table.set(c.id, newEntry(c)));

  argGroupFixtures(fixtures)
    .filter(f => f.played && (!clubFilter || clubFilter.has(f.homeTeamId) || clubFilter.has(f.awayTeamId)))
    .forEach(f => {
      applyForTeam(table, f.homeTeamId, f.homeScore ?? 0, f.awayScore ?? 0);
      applyForTeam(table, f.awayTeamId, f.awayScore ?? 0, f.homeScore ?? 0);
    });

  return [...table.values()]
    .map(e => ({ ...e, gd: e.gf - e.ga }))
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
}

/** Tabla de una zona (intra-zona + interzonales donde participa un equipo de esa zona). */
export function argentineZoneTable(zone: number, fixtures: Fixture[]): TableEntry[] {
  const { zoneOf } = argentineZoneAssignments(fixtures);
  const zoneClubs = participantClubs(fixtures).filter(c => zoneOf.get(c.id) === zone);
  const filter = new Set(zoneClubs.map(c => c.id));
  return buildTable(zoneClubs, fixtures, filter);
}

/** Tabla combinada de la temporada (ambas zonas, fase regular). */
export function argentineCombinedTable(fixtures: Fixture[]): TableEntry[] {
  return buildTable(participantClubs(fixtures), fixtures);
}
