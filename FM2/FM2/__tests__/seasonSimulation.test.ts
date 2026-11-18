// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { performance } from 'node:perf_hooks';

// ─── Cargar un subconjunto del mundo (solo Argentina) para que la simulación sea viable ───
// El archivo completo de jugadores pesa ~19MB (29.020 jugadores); filtrar a las ligas
// argentinas reduce el mundo a ~2.000 jugadores reales manteniendo el flujo completo.
vi.mock('../data/convertedDataLoader', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const dataDir = path.resolve(process.cwd(), 'public', 'data');
  const load = (file: string) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  const KEPT_LEAGUES = ['L_ARG_1', 'L_ARG_2'];

  let cache: { leagues: any[]; clubs: any[]; players: any[] } | null = null;
  const build = () => {
    if (cache) return cache;
    const leagues = load('convertedLeagues.json').filter((l: any) => KEPT_LEAGUES.includes(l.id));
    const clubs = load('convertedClubs.json').filter((c: any) => KEPT_LEAGUES.includes(c.competitionId));
    const clubIds = new Set(clubs.map((c: any) => String(c.id)));
    const players = load('convertedPlayers.json').filter((p: any) => clubIds.has(String(p.clubId)));
    cache = { leagues, clubs, players };
    return cache;
  };

  return {
    loadConvertedClubs: async () => build().clubs,
    loadConvertedPlayers: async () => build().players,
    loadConvertedLeagues: async () => build().leagues,
  };
});

import { world } from '../services/worldManager';
import { LifecycleManager } from '../services/lifecycleManager';
import { simulateDayFixtures } from '../services/simulationService';
import { detectPlayerDialogueTriggers } from '../services/playerDialogueTriggers';
import { argentineCombinedTable } from '../services/argentineLeague';
import { useGameStore } from '../stores/gameStore';
import { useUserStore } from '../stores/userStore';
import { Fixture } from '../types';

// ─── Polyfill de localStorage (el motor lo usa en notifications/utils y no existe en Node) ───
const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, String(v)); },
  removeItem: (k: string) => { storage.delete(k); },
  clear: () => storage.clear(),
  key: (i: number) => [...storage.keys()][i] ?? null,
  get length() { return storage.size; },
};

// ─── Estado compartido de la simulación ─────────────────────────────────────

interface SeasonMetrics {
  index: number;
  days: number;
  durationMs: number;
  fixturesTotal: number;
  playedAtClose: number;
  playedAfterClose: number;
  selfMatches: number;
  userLeague: string;
  userLeagueAfter: string;
  userPosition: number;
  champion: string;
  championPoints: number;
  topScorer: string;
  topScorerGoals: number;
}

const sim = {
  userClubId: '',
  fixtures: [] as Fixture[],
  date: new Date(),
  seasonEnd: new Date(),
  seasons: [] as SeasonMetrics[],
  userMatchesPlayed: 0,
};

const waitForWorld = async (timeoutMs = 180_000): Promise<void> => {
  const t0 = Date.now();
  while (
    world.clubs.length === 0 ||
    world.players.length === 0 ||
    world.competitions.length === 0 ||
    !world.nationalTeamManager
  ) {
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(`Timeout esperando la carga del mundo (clubs=${world.clubs.length}, players=${world.players.length})`);
    }
    await new Promise(r => setTimeout(r, 100));
  }
};

/** Comprueba que no haya NaN ni marcadores inválidos en el estado del mundo. */
const assertWorldIntegrity = (label: string, fixtures: Fixture[]) => {
  const badScores = fixtures.filter(
    f => f.played && (!Number.isInteger(f.homeScore) || !Number.isInteger(f.awayScore) || (f.homeScore ?? 0) < 0 || (f.awayScore ?? 0) < 0)
  );
  expect(badScores, `${label}: marcadores inválidos (NaN/negativos) en ${badScores.length} partidos`).toHaveLength(0);

  const badPlayers = world.players.filter(p => !Number.isFinite(p.currentAbility) || !Number.isFinite(p.value) || !Number.isFinite(p.salary));
  expect(badPlayers, `${label}: ${badPlayers.length} jugadores con atributos NaN`).toHaveLength(0);

  world.clubs.forEach(c => {
    expect(Number.isFinite(c.finances.balance), `${label}: balance NaN en ${c.name}`).toBe(true);
    expect(Number.isFinite(c.finances.transferBudget), `${label}: presupuesto NaN en ${c.name}`).toBe(true);
  });
};

/** Ejecuta una temporada completa día a día (mismo ciclo que VacationView/advanceTime). */
const runSeason = async (seasonIndex: number): Promise<void> => {
  const t0 = performance.now();
  let days = 0;
  const userClub = world.getClub(sim.userClubId)!;
  expect(userClub, 'El club del usuario debe existir').toBeTruthy();

  while (sim.date < sim.seasonEnd) {
    const nextDay = new Date(sim.date);
    nextDay.setDate(nextDay.getDate() + 1);
    sim.date = nextDay;
    days++;

    // ── Ciclo de vida diario ──
    LifecycleManager.checkBirthdays(sim.date);
    LifecycleManager.recoverDailyFitness();
    LifecycleManager.processMonthlyFinances(sim.date);
    world.checkRenewalTriggers(sim.date, sim.userClubId);
    world.processTransferDecisions(sim.date);
    world.processAIActivity(sim.date);
    world.processDailyContracts(sim.date, sim.userClubId);
    world.processDailyScouting(sim.date, sim.userClubId);
    world.generateGeneralNews(sim.date);
    world.processLightMarketActivity(sim.date);
    world.processQuarterlyYouthIntake(sim.date);
    world.ensureMinimumSquadSizes();

    // Semanal (lunes): clasificación + despidos de entrenadores AI
    if (sim.date.getDay() === 1) {
      world.generateStandingsNews(sim.date, sim.fixtures);
      world.simulateCoachChanges(sim.date, sim.fixtures);
    }

    // Cosecha de cantera + retiros + purga (1 de agosto)
    if (sim.date.getMonth() === 7 && sim.date.getDate() === 1) {
      world.generateYouthIntake(sim.date.getFullYear());
    }

    // Mensual (día 1): recalcular valores y cohesión
    if (sim.date.getDate() === 1) {
      world.recalculateAllPlayerValues();
      if (userClub) world.computeTeamCohesion(userClub.id);
    }

    // Transfer deadline + desarrollo juvenil
    world.processDeadlineWeekActivity(sim.date);
    world.processDeadlineDay(sim.date);
    world.developYouthPlayers(sim.date);
    world.autoPromoteYouthPlayers(sim.date);

    // ── Pilar C: personalidad y drama ──
    if (userClub) {
      world.checkDressingRoomConflicts(userClub.id, sim.date);
      world.checkTransferRequestMotives(userClub.id, sim.date);
      world.generateNarrativeEvents(userClub.id, sim.date);
      detectPlayerDialogueTriggers(userClub.id);
    }

    // ── Simular los partidos del día (deep/light según competencia) ──
    await simulateDayFixtures({
      date: sim.date,
      fixtures: sim.fixtures,
      userClub,
      selectedNationalTeamId: null,
    });

    // ── Generar nuevas rondas de copas ──
    const newCupFixtures = LifecycleManager.processCompetitionProgress(sim.fixtures, sim.date);
    if (newCupFixtures.length > 0) sim.fixtures = [...sim.fixtures, ...newCupFixtures];

    // ── Fin de temporada ──
    if (sim.date >= sim.seasonEnd) break;
  }

  // Invariantes ANTES del cierre: el usuario debe haber jugado partidos de liga
  const userSeniorLeaguePlayed = sim.fixtures.filter(
    f => f.played && f.squadType === 'SENIOR' &&
      (f.homeTeamId === sim.userClubId || f.awayTeamId === sim.userClubId) &&
      (f.competitionId === 'L_ARG_1' || f.competitionId === 'L_ARG_2')
  ).length;
  expect(userSeniorLeaguePlayed, `Temporada ${seasonIndex}: el club del usuario no jugó partidos de liga`).toBeGreaterThan(0);

  // Goleador de la liga del usuario ANTES del cierre (processEndOfSeason resetea statsByCompetition)
  const preUserLeague = world.getClub(sim.userClubId)!.leagueId;

  // Torneo argentino: la fase de zonas debe derivar en playoffs con una final jugada
  if (preUserLeague === 'L_ARG_1') {
    const finalPlayed = sim.fixtures.some(f => f.competitionId === 'L_ARG_1' && f.stage === 'FINAL' && f.played);
    expect(finalPlayed, `Temporada ${seasonIndex}: debe haberse jugado la final del torneo argentino`).toBe(true);
  }
  const topScorer = [...world.players]
    .filter(p => (p.statsByCompetition[preUserLeague]?.appearances || 0) > 0)
    .sort((a, b) => (b.statsByCompetition[preUserLeague]?.goals || 0) - (a.statsByCompetition[preUserLeague]?.goals || 0))[0];
  expect(topScorer, `Temporada ${seasonIndex}: debe haber goleadores en ${preUserLeague}`).toBeTruthy();
  expect(topScorer!.statsByCompetition[preUserLeague]!.goals, `Temporada ${seasonIndex}: el máximo goleador debe tener goles`).toBeGreaterThan(0);
  const topScorerName = topScorer!.name;
  const topScorerGoals = topScorer!.statsByCompetition[preUserLeague]!.goals;

  // Capturar membresía de ligas antes de que el cierre mueva equipos (ascensos/descensos)
  const arg1Before = new Set(world.clubs.filter(c => c.leagueId === 'L_ARG_1').map(c => c.id));

  const playedBefore = sim.fixtures.filter(f => f.played).length;
  const result = useGameStore.getState().finishSeason(sim.fixtures, sim.userClubId, sim.date);
  const playedAfter = sim.fixtures.filter(f => f.played).length;

  sim.userMatchesPlayed += sim.fixtures.filter(
    f => f.played && (f.homeTeamId === sim.userClubId || f.awayTeamId === sim.userClubId)
  ).length;

  const userClubAfter = world.getClub(sim.userClubId)!;
  // La tabla/campeón/posición se calculan sobre la liga que el usuario jugó ESTA temporada
  const isArgLeague = preUserLeague === 'L_ARG_1';
  const leagueTable = isArgLeague
    ? argentineCombinedTable(sim.fixtures)
    : world.getLeagueTable(preUserLeague, sim.fixtures, 'SENIOR');
  const userPos = leagueTable.findIndex(e => e.clubId === sim.userClubId) + 1;

  // Campeón real: para Argentina lo define la final de playoffs (queda archivado en seasonHistory)
  const seasonRecord = world.seasonHistory[world.seasonHistory.length - 1];
  const compRecord = seasonRecord?.competitions?.find((c: any) => c.compId === preUserLeague);
  const championName = compRecord?.championName || leagueTable[0]?.clubName || 'N/A';
  const championId = compRecord?.championId || leagueTable[0]?.clubId;

  sim.seasons.push({
    index: seasonIndex,
    days,
    durationMs: Math.round(performance.now() - t0),
    fixturesTotal: sim.fixtures.length,
    playedAtClose: playedBefore,
    playedAfterClose: playedAfter,
    selfMatches: sim.fixtures.filter(f => f.homeTeamId === f.awayTeamId).length,
    userLeague: preUserLeague,
    userLeagueAfter: userClubAfter.leagueId,
    userPosition: userPos,
    champion: championName,
    championPoints: leagueTable[0]?.points ?? 0,
    topScorer: topScorerName,
    topScorerGoals,
  });

  // ── Verificaciones de la temporada recién cerrada ──
  const arg1After = new Set(world.clubs.filter(c => c.leagueId === 'L_ARG_1').map(c => c.id));
  const relegated = [...arg1Before].filter(id => !arg1After.has(id));
  const promoted = [...arg1After].filter(id => !arg1Before.has(id));
  expect(relegated.length, `Temporada ${seasonIndex}: deben descender exactamente 2 equipos`).toBe(2);
  expect(promoted.length, `Temporada ${seasonIndex}: deben ascender exactamente 2 equipos`).toBe(2);

  // Todos los partidos de clubes deben estar jugados tras el cierre
  const pendingClubMatches = sim.fixtures.filter(f => !f.played && world.getClub(f.homeTeamId));
  expect(pendingClubMatches, `Temporada ${seasonIndex}: quedan ${pendingClubMatches.length} partidos de club sin jugar`).toHaveLength(0);

  // Tabla de la liga del usuario: consistencia interna (W/D/L, puntos, sin NaN)
  const table = leagueTable;
  table.forEach(entry => {
    expect(entry.played, `${entry.clubName}: debe haber jugado partidos`).toBeGreaterThan(0);
    expect(entry.played, `${entry.clubName}: jugados = W+D+L`).toBe(entry.won + entry.drawn + entry.lost);
    expect(entry.points, `${entry.clubName}: puntos = 3W + D`).toBe(entry.won * 3 + entry.drawn);
    expect(entry.points, `${entry.clubName}: puntos no negativos`).toBeGreaterThanOrEqual(0);
  });

  // El campeón registra el título en su palmarés
  const champion = championId ? world.getClub(championId) : undefined;
  if (champion) {
    expect(champion.honours.some(h => h.year === sim.date.getFullYear()), `Temporada ${seasonIndex}: el campeón ${champion.name} debe registrar el título en su palmarés`).toBe(true);
  }

  assertWorldIntegrity(`Temporada ${seasonIndex}`, sim.fixtures);

  // ── Avanzar a la siguiente temporada ──
  sim.fixtures = result.newFixtures;
  sim.date = new Date(result.nextSeasonStart);
  sim.date.setDate(sim.date.getDate() - 1); // el bucle avanza un día antes de simular
  sim.seasonEnd = result.nextSeasonEnd;
};

describe('Simulación de 2 temporadas completas', () => {
  beforeAll(async () => {
    await waitForWorld();

    // Elegir el club del usuario (el de mayor reputación de Primera)
    const userClub = [...world.getClubsByLeague('L_ARG_1')].sort((a, b) => b.reputation - a.reputation)[0];
    if (!userClub) throw new Error('No hay clubes en L_ARG_1');

    sim.userClubId = userClub.id;
    useUserStore.getState().setUserClub(userClub);
    world.createHumanManager(userClub.id, 'Manager de Prueba');
    world.createManagerProfile(
      userClub.id,
      'Test', 'Manager', 'Argentina', 'EX_PLAYER',
      new Date(1985, 0, 1), new Date(2026, 7, 1), null
    );

    // Configurar el calendario inicial (misma ventana que el juego)
    const startDate = new Date(2026, 7, 1); // 1 ago 2026
    const seasonEnd = new Date(2027, 5, 30); // 30 jun 2027
    useGameStore.getState().setCurrentDate(new Date(startDate));
    useGameStore.getState().setSeasonEndDate(new Date(seasonEnd));
    sim.date = new Date(startDate);
    sim.date.setDate(sim.date.getDate() - 1); // el bucle avanza un día antes de simular
    sim.seasonEnd = new Date(seasonEnd);
    sim.fixtures = useGameStore.getState().initSeasonFixtures(startDate, sim.userClubId);
  });

  it('carga el mundo con la liga argentina y genera el calendario', () => {
    expect(world.clubs.length).toBeGreaterThanOrEqual(30);
    expect(world.players.length).toBeGreaterThanOrEqual(1500);
    expect(world.competitions.some(c => c.id === 'L_ARG_1')).toBe(true);
    expect(world.competitions.some(c => c.id === 'L_ARG_2')).toBe(true);
    expect(sim.fixtures.length).toBeGreaterThan(1000);
    expect(useGameStore.getState().deepSimLeagues).toContain('L_ARG_1');
    expect(world.managerProfile?.currentClubId).toBe(sim.userClubId);
  });

  it('simula 2 temporadas completas sin errores y con integridad', async () => {
    const t0 = performance.now();

    // Temporada 1 (2026-27)
    await runSeason(1);
    expect(world.seasonHistory.length, 'Tras la 1ª temporada debe haber 1 registro histórico').toBe(1);
    expect(world.managerProfile!.totalGames, 'El manager debe haber dirigido partidos').toBeGreaterThan(0);

    // Temporada 2 (2027-28)
    await runSeason(2);
    expect(world.seasonHistory.length, 'Tras la 2ª temporada debe haber 2 registros históricos').toBe(2);

    const totalMs = Math.round(performance.now() - t0);

    // ── Verificaciones globales ──
    // Regeneración: tras 2 temporadas la cantera debe haber incorporado juveniles
    const seasonRecord = world.seasonHistory[1];
    expect(seasonRecord.competitions.length, 'El registro de temporada debe incluir competiciones con campeón').toBeGreaterThan(0);
    const arg1Record = seasonRecord.competitions.find((c: any) => c.compId === 'L_ARG_1');
    expect(arg1Record?.championName, 'La temporada 2 debe tener campeón en L_ARG_1').toBeTruthy();
    expect(arg1Record?.championName).not.toBe('Sin Ganador');

    // El historial acumula estadísticas del manager
    const p = world.managerProfile!;
    expect(p.totalGames).toBeGreaterThanOrEqual(10);
    expect(p.totalWins + p.totalDraws + p.totalLosses).toBe(p.totalGames);
    expect(p.goalsFor + p.goalsAgainst).toBeGreaterThan(0);
    // Nota: managerHistory.seasonsCompleted se incrementa en la capa de UI (VacationView/App),
    // no en finishSeason; la métrica a nivel de motor es world.seasonHistory (ya verificada arriba).

    // ── Resumen de métricas ──
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('📊 RESUMEN: SIMULACIÓN DE 2 TEMPORADAS');
    console.log(`🌍 Mundo: ${world.clubs.length} clubes · ${world.players.length} jugadores · ${world.competitions.length} competiciones`);
    sim.seasons.forEach(s => {
      console.log(`\n📅 Temporada ${s.index} (${s.days} días · ${s.durationMs}ms)`);
      console.log(`   · Fixtures: ${s.fixturesTotal} totales · ${s.playedAfterClose}/${s.fixturesTotal} jugados al cierre`);
      console.log(`   · Liga del usuario: ${s.userLeague} · Posición: ${s.userPosition}º${s.userLeague !== s.userLeagueAfter ? ` (→ ${s.userLeagueAfter} tras la temporada)` : ''}`);
      console.log(`   · Campeón: ${s.champion} (${s.championPoints} pts)`);
      console.log(`   · Máx. goleador: ${s.topScorer} (${s.topScorerGoals} goles)`);
      if (s.selfMatches > 0) console.log(`   · ⚠️  ${s.selfMatches} fixtures con equipo contra sí mismo (liga con nº impar de equipos)`);
    });
    const avgSeasonMs = Math.round(sim.seasons.reduce((a, s) => a + s.durationMs, 0) / sim.seasons.length);
    const avgDayMs = Math.round(sim.seasons.reduce((a, s) => a + s.durationMs, 0) / sim.seasons.reduce((a, s) => a + s.days, 0));
    console.log(`\n⏱️  Total: ${totalMs}ms · Promedio por temporada: ${avgSeasonMs}ms · Promedio por día: ${avgDayMs}ms`);
    console.log(`🎮 Partidos del club del usuario simulados: ${sim.userMatchesPlayed}`);
    console.log(`📖 Temporadas archivadas: ${world.seasonHistory.length}`);
    console.log(`🏆 Títulos del manager: ${p.titles.length ? p.titles.join(', ') : 'ninguno'}`);
    console.log('══════════════════════════════════════════════════════════\n');
  }, 600_000);
});
