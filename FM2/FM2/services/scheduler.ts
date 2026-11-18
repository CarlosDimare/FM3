
import { Club, Fixture, SquadType, MatchStage, Competition } from "../types";
import { generateUUID, randomInt } from "./utils";

export class Scheduler {
  /**
   * Genera un doble round-robin (todos contra todos, ida y vuelta).
   * Soporta nº impar de equipos mediante una jornada de descanso (bye):
   * se añade un hueco virtual para que el número de plazas sea par y el
   * equipo emparejado con el hueco descansa esa jornada. Esto evita que un
   * equipo juegue contra sí mismo (bug con ligas de nº impar).
   */
  static generateSeasonFixtures(leagueId: string, clubs: Club[], startDate: Date, squadType: SquadType = 'SENIOR'): Fixture[] {
    const fixtures: Fixture[] = [];
    const leagueClubs = clubs.filter(c => c.leagueId === leagueId);
    if (leagueClubs.length < 2) return [];

    const n = leagueClubs.length;
    const hasBye = n % 2 === 1;
    const slots = hasBye ? n + 1 : n;         // nº par de plazas (última = bye si es impar)
    const roundsPerLeg = slots - 1;           // cada vuelta tiene N-1 jornadas
    const arr: (Club | null)[] = [...leagueClubs];
    if (hasBye) arr.push(null);

    let currentRoundDate = new Date(startDate);
    // Las ligas arrancan en sábado o domingo
    if (currentRoundDate.getDay() !== 6 && currentRoundDate.getDay() !== 0) {
      const dist = (6 - currentRoundDate.getDay() + 7) % 7;
      currentRoundDate.setDate(currentRoundDate.getDate() + dist);
    }

    let round = 0;
    for (let leg = 0; leg < 2; leg++) {
      for (let r = 0; r < roundsPerLeg; r++) {
        if (round > 0) {
          currentRoundDate = new Date(currentRoundDate);
          currentRoundDate.setDate(currentRoundDate.getDate() + 7);
        }
        for (let i = 0; i < slots / 2; i++) {
          const a = arr[i];
          const b = arr[slots - 1 - i];
          if (!a || !b) continue; // bye: el equipo emparejado con el hueco descansa
          const swap = leg === 1; // vuelta: se invierten las localías
          const home = swap ? b : a;
          const away = swap ? a : b;
          fixtures.push({ id: generateUUID(), competitionId: leagueId, homeTeamId: home.id, awayTeamId: away.id, date: new Date(currentRoundDate), played: false, squadType, stage: 'REGULAR' });
        }
        // Rotación del método del círculo: fijar arr[0] y desplazar el resto
        const last = arr[slots - 1];
        for (let k = slots - 1; k > 1; k--) arr[k] = arr[k - 1];
        arr[1] = last;
        round++;
      }
    }
    return fixtures.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Single round-robin (solo ida) con jornada de descanso para nº impar.
   * Los fixtures se marcan como fase de grupos (`stage: 'GROUP'`) con su `groupId`.
   */
  private static generateSingleRoundRobinWithBye(leagueId: string, clubs: Club[], groupId: number, startDate: Date, squadType: SquadType): Fixture[] {
    const fixtures: Fixture[] = [];
    const n = clubs.length;
    if (n < 2) return fixtures;
    const hasBye = n % 2 === 1;
    const slots = hasBye ? n + 1 : n;
    const arr: (Club | null)[] = [...clubs];
    if (hasBye) arr.push(null);

    let roundDate = new Date(startDate);
    for (let r = 0; r < slots - 1; r++) {
      if (r > 0) {
        roundDate = new Date(roundDate);
        roundDate.setDate(roundDate.getDate() + 7);
      }
      for (let i = 0; i < slots / 2; i++) {
        const a = arr[i];
        const b = arr[slots - 1 - i];
        if (!a || !b) continue; // bye
        fixtures.push({ id: generateUUID(), competitionId: leagueId, homeTeamId: a.id, awayTeamId: b.id, date: new Date(roundDate), played: false, squadType, stage: 'GROUP', groupId });
      }
      const last = arr[slots - 1];
      for (let k = slots - 1; k > 1; k--) arr[k] = arr[k - 1];
      arr[1] = last;
    }
    return fixtures;
  }

  /**
   * Formato argentino (Primera División): 2 zonas de 15 equipos.
   * - Fase de zonas: 14 partidos intra-zona (todos contra todos, ida) + 2 interzonales.
   *   Total: 16 partidos por equipo.
   * - Los 8 primeros de cada zona clasifican a playoffs (se generan dinámicamente).
   */
  static generateZonedLeagueFixtures(leagueId: string, clubs: Club[], startDate: Date, squadType: SquadType = 'SENIOR'): Fixture[] {
    const leagueClubs = clubs.filter(c => c.leagueId === leagueId);
    if (leagueClubs.length < 4) return [];

    // Zonas: repartir alternando por reputación (los clásicos quedan en zonas distintas)
    const sorted = [...leagueClubs].sort((a, b) => b.reputation - a.reputation);
    const zonaA: Club[] = [];
    const zonaB: Club[] = [];
    sorted.forEach((c, i) => (i % 2 === 0 ? zonaA : zonaB).push(c));

    const fixtures: Fixture[] = [];

    // 1) Fase de zonas intra-grupo
    fixtures.push(...this.generateSingleRoundRobinWithBye(leagueId, zonaA, 1, startDate, squadType));
    fixtures.push(...this.generateSingleRoundRobinWithBye(leagueId, zonaB, 2, startDate, squadType));

    // 2) Dos fechas interzonales (emparejando por ranking: aprox. los clásicos interzonales)
    const intraWeeks = Math.max(zonaA.length, zonaB.length) + 1; // rondas intra (con bye) ya consumidas
    for (let inter = 0; inter < 2; inter++) {
      const roundDate = new Date(startDate);
      roundDate.setDate(roundDate.getDate() + (intraWeeks + inter) * 7);
      for (let i = 0; i < Math.max(zonaA.length, zonaB.length); i++) {
        const a = zonaA[i % zonaA.length];
        const b = zonaB[(i + inter) % zonaB.length];
        if (!a || !b) continue;
        fixtures.push({ id: generateUUID(), competitionId: leagueId, homeTeamId: a.id, awayTeamId: b.id, date: new Date(roundDate), played: false, squadType, stage: 'GROUP', groupId: inter === 0 ? 3 : 4 });
      }
    }

    return fixtures.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  static generateCupRound(competitionId: string, clubs: Club[], roundDate: Date, stage: MatchStage): Fixture[] {
     const fixtures: Fixture[] = [];
     const shuffled = [...clubs].sort(() => Math.random() - 0.5);
     
     // Ensure Cup rounds are mid-week (Wednesday) to avoid conflict
     const safeDate = new Date(roundDate);
     while(safeDate.getDay() !== 3) {
        safeDate.setDate(safeDate.getDate() + 1);
     }

     for (let i = 0; i < shuffled.length; i += 2) {
        if (shuffled[i] && shuffled[i+1]) {
           fixtures.push({
              id: generateUUID(),
              competitionId,
              homeTeamId: shuffled[i].id,
              awayTeamId: shuffled[i+1].id,
              date: new Date(safeDate),
              played: false,
              squadType: 'SENIOR',
              stage: stage,
              isNeutral: stage === 'FINAL' || competitionId === 'W_CLUB' // Club World Cup always neutral
           });
        }
     }
     return fixtures;
  }

  static generateKnockoutDraw(competitionId: string, seeds: Club[], nonSeeds: Club[], roundDate: Date, stage: MatchStage): Fixture[] {
      const fixtures: Fixture[] = [];
      const pot1 = [...seeds].sort(() => Math.random() - 0.5);
      const pot2 = [...nonSeeds].sort(() => Math.random() - 0.5);
      
      const safeDate = new Date(roundDate);
      while(safeDate.getDay() !== 3) safeDate.setDate(safeDate.getDate() + 1);

      // Pair Pot 1 vs Pot 2
      for (let i = 0; i < pot1.length; i++) {
         if (pot1[i] && pot2[i]) {
            // Usually Pot 2 plays home first in Libertadores R16
            fixtures.push({
               id: generateUUID(),
               competitionId,
               homeTeamId: pot2[i].id, 
               awayTeamId: pot1[i].id,
               date: new Date(safeDate),
               played: false,
               squadType: 'SENIOR',
               stage: stage
            });
         }
      }
      return fixtures;
  }

  static generateContinentalGroups(competitionId: string, clubs: Club[], startDate: Date): Fixture[] {
      const fixtures: Fixture[] = [];
      
      // Sort by reputation to create Pots (Seeding)
      const rankedClubs = [...clubs].sort((a,b) => b.reputation - a.reputation);
      const groupsCount = 8;
      
      if (rankedClubs.length < 32) return []; // Need 32 teams for accurate simulation

      const pot1 = rankedClubs.slice(0, 8);
      const pot2 = rankedClubs.slice(8, 16);
      const pot3 = rankedClubs.slice(16, 24);
      const pot4 = rankedClubs.slice(24, 32);

      // Shuffle pots to randomize distribution
      const pots = [pot1, pot2, pot3, pot4].map(p => p.sort(() => Math.random() - 0.5));
      
      // Ensure start is a Wednesday
      const safeStartDate = new Date(startDate);
      while(safeStartDate.getDay() !== 3) {
         safeStartDate.setDate(safeStartDate.getDate() + 1);
      }

      for (let groupIdx = 0; groupIdx < groupsCount; groupIdx++) {
         // Pick one team from each pot for this group
         const groupClubs = [pots[0][groupIdx], pots[1][groupIdx], pots[2][groupIdx], pots[3][groupIdx]];

         // Group stage has 6 matchdays
         for (let m = 0; m < 6; m++) {
            const matchDate = new Date(safeStartDate);
            matchDate.setDate(matchDate.getDate() + (m * 14)); // Every 2 weeks
            
            // Basic pairing logic for 4 teams group
            // Round Robin logic
            let pairs: number[][] = [];
            if (m === 0) pairs = [[0,1], [2,3]]; // 1 vs 2, 3 vs 4
            if (m === 1) pairs = [[1,2], [3,0]]; // 2 vs 3, 4 vs 1
            if (m === 2) pairs = [[0,2], [1,3]]; // 1 vs 3, 2 vs 4
            if (m === 3) pairs = [[1,0], [3,2]]; // Returns
            if (m === 4) pairs = [[2,1], [0,3]];
            if (m === 5) pairs = [[2,0], [3,1]];

            pairs.forEach(p => {
               fixtures.push({
                  id: generateUUID(),
                  competitionId,
                  homeTeamId: groupClubs[p[0]].id,
                  awayTeamId: groupClubs[p[1]].id,
                  date: matchDate,
                  played: false,
                  squadType: 'SENIOR',
                  stage: 'GROUP',
                  groupId: groupIdx
               });
            });
         }
      }
      return fixtures;
  }
}
