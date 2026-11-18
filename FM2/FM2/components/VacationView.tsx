import React, { useState, useCallback, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useUIStore } from '../stores/uiStore';
import { useWorldStore } from '../stores/worldStore';
import { world } from '../services/worldManager';
import { LifecycleManager } from '../services/lifecycleManager';
import { simulateDayFixtures } from '../services/simulationService';
import { detectPlayerDialogueTriggers } from '../services/playerDialogueTriggers';
import { generateMonthlyChronicle } from '../services/chronicleService';
import { FMBox, FMButton } from './FMUI';
import { Sun, Calendar, ChevronRight, AlertCircle } from 'lucide-react';

interface VacationViewProps {
  onBack: () => void;
}

export const VacationView: React.FC<VacationViewProps> = ({ onBack }) => {
  const currentDate = useGameStore(s => s.currentDate);
  const fixtures = useGameStore(s => s.fixtures);
  const setFixtures = useGameStore(s => s.setFixtures);
  const userClub = useUIStore(s => s.userClub);
  const selectedNationalTeamId = useUIStore(s => s.selectedNationalTeamId);
  const seasonEndDate = useUIStore(s => s.seasonEndDate);
  const setCurrentDate = useUIStore(s => s.setCurrentDate);
  const setSeasonSummary = useUIStore(s => s.setSeasonSummary);
  const setUserWonLeague = useUIStore(s => s.setUserWonLeague);
  const notify = useWorldStore(s => s.notify);

  const [mode, setMode] = useState<'MENU' | 'SEASON' | 'DATE'>('MENU');
  const [targetDate, setTargetDate] = useState('');
  const [status, setStatus] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [progress, setProgress] = useState(0);
  const cancelledRef = useRef(false);
  const lastChronicleMonthRef = useRef(-1);

  const simulateToDate = useCallback(async (endDate: Date) => {
    cancelledRef.current = false;
    setIsSimulating(true);
    setProgress(0);

    const MAX_DAYS = 400;
    let tempDate = new Date(useGameStore.getState().currentDate);
    let localFixtures = [...useGameStore.getState().fixtures];
    let daysProcessed = 0;
    let batchCount = 0;
    const BATCH_SIZE = 7;
    const totalDays = Math.max(1, Math.ceil((endDate.getTime() - tempDate.getTime()) / (1000 * 60 * 60 * 24)));
    lastChronicleMonthRef.current = -1;

    const activeManagedTeamId = userClub?.id || selectedNationalTeamId || undefined;

    while (tempDate < endDate && daysProcessed < MAX_DAYS) {
      if (cancelledRef.current) {
        setStatus(`⏸ Simulación cancelada. ${daysProcessed} días procesados.`);
        setIsSimulating(false);
        setProgress(0);
        break;
      }

      tempDate.setDate(tempDate.getDate() + 1);
      daysProcessed++;
      batchCount++;
      setProgress(Math.min(99, Math.round((daysProcessed / totalDays) * 100)));
      setStatus(`Procesando ${tempDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} (${daysProcessed}/${totalDays})`);

      // ── Ciclo de vida diario (mismo que startVacation + advanceTime) ──
      LifecycleManager.checkBirthdays(tempDate);
      LifecycleManager.recoverDailyFitness();
      LifecycleManager.processMonthlyFinances(tempDate);
      world.checkRenewalTriggers(tempDate, userClub?.id);
      world.processTransferDecisions(tempDate);
      world.processAIActivity(tempDate);
      world.processDailyContracts(tempDate, userClub?.id);
      world.processDailyScouting(tempDate, userClub?.id);

      world.generateGeneralNews(tempDate);
      world.processLightMarketActivity(tempDate);
      world.processQuarterlyYouthIntake(tempDate);
      world.ensureMinimumSquadSizes();

      // Semanal (lunes): clasificación + despidos de entrenadores AI
      if (tempDate.getDay() === 1) {
        world.generateStandingsNews(tempDate, localFixtures);
        world.simulateCoachChanges(tempDate, localFixtures);
      }

      // Cosecha de cantera + retiros + purga (1 de agosto)
      if (tempDate.getMonth() === 7 && tempDate.getDate() === 1) {
        world.generateYouthIntake(tempDate.getFullYear());
      }

      // Mensual (día 1): recalcular valores, cohesión y crónica mensual
      if (tempDate.getDate() === 1) {
        world.recalculateAllPlayerValues();
        if (userClub) world.computeTeamCohesion(userClub.id);
        if (userClub && lastChronicleMonthRef.current !== tempDate.getMonth()) {
          const prevMonth = tempDate.getMonth() === 0 ? 11 : tempDate.getMonth() - 1;
          const prevYear = tempDate.getMonth() === 0 ? tempDate.getFullYear() - 1 : tempDate.getFullYear();
          const monthFixtures = localFixtures.filter(f => {
            const fd = new Date(f.date);
            return f.played && fd.getMonth() === prevMonth && fd.getFullYear() === prevYear &&
              (f.homeTeamId === userClub.id || f.awayTeamId === userClub.id) && f.squadType === 'SENIOR';
          });
          let won = 0, drawn = 0, lost = 0;
          monthFixtures.forEach(f => {
            const isHome = f.homeTeamId === userClub.id;
            const us = isHome ? f.homeScore! : f.awayScore!;
            const them = isHome ? f.awayScore! : f.homeScore!;
            if (us > them) won++; else if (us < them) lost++; else drawn++;
          });
          if (monthFixtures.length > 0) {
            const monthDate = new Date(prevYear, prevMonth, 15);
            generateMonthlyChronicle(userClub.id, monthDate, { won, drawn, lost });
            const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            const balanceText = won >= 4 ? 'excelente' : won >= 3 && lost <= 1 ? 'positivo' : won >= 2 && lost >= 2 ? 'de altibajos' : won >= 1 && lost >= 3 ? 'negativo' : 'para olvidar';
            world.addSeasonPage('MONTHLY_REPORT', `Informe mensual · ${monthNames[prevMonth]}`, `El mes fue ${balanceText}: ${won} victorias, ${drawn} empates y ${lost} derrotas.`, monthDate, won >= 3 ? 'MEDIUM' : 'LOW');
          }
          lastChronicleMonthRef.current = tempDate.getMonth();
        }
      }

      // Transfer deadline day mechanics
      world.processDeadlineWeekActivity(tempDate);
      world.processDeadlineDay(tempDate);

      // Youth development pipeline
      world.developYouthPlayers(tempDate);
      world.autoPromoteYouthPlayers(tempDate);

      // ── Pilar C: Personality & Drama + diálogos ──
      if (userClub) {
        world.checkDressingRoomConflicts(userClub.id, tempDate);
        world.checkTransferRequestMotives(userClub.id, tempDate);
        world.generateNarrativeEvents(userClub.id, tempDate);
        detectPlayerDialogueTriggers(userClub.id);
      }

      // ── Simular todos los partidos del día (deep/light según competencia) ──
      await simulateDayFixtures({
        date: tempDate,
        fixtures: localFixtures,
        userClub,
        selectedNationalTeamId,
      });

      // Generar nuevas rondas de copas si corresponde
      const newCupFixtures = LifecycleManager.processCompetitionProgress(localFixtures, tempDate);
      if (newCupFixtures.length > 0) {
        localFixtures = [...localFixtures, ...newCupFixtures];
      }

      // ── Fin de temporada ──
      if (tempDate >= seasonEndDate) {
        setFixtures(localFixtures);
        const result = useGameStore.getState().finishSeason(localFixtures, activeManagedTeamId);
        setSeasonSummary(result.summaries);
        setUserWonLeague(result.userWonLeague);
        const gs = useGameStore.getState();
        gs.setManagerHistory({ ...gs.managerHistory, seasonsCompleted: gs.managerHistory.seasonsCompleted + 1 });
        if (result.userWonLeague) gs.trackTitle('Liga');
        const wonCups = result.summaries.filter((s: any) => s.championId === userClub?.id && s.compType !== 'LEAGUE');
        wonCups.forEach((s: any) => gs.trackTitle(s.compName));
        if (userClub) {
          const leagueTable = world.getLeagueTable(userClub.leagueId, localFixtures, 'SENIOR');
          const leaguePos = leagueTable.findIndex(e => e.clubId === userClub.id) + 1;
          const leagueTotal = leagueTable.length;
          const cupWinnerId = result.summaries.find((s: any) => s.compType !== 'LEAGUE' && s.championId)?.championId;
          const wonCup = cupWinnerId === userClub.id;
          const titleNames: string[] = [];
          if (result.userWonLeague) titleNames.push('Liga');
          wonCups.forEach((s: any) => titleNames.push(s.compName));
          world.updateManagerProfileSeasonEnd(result.userWonLeague || wonCups.length > 0, titleNames, leaguePos || 10, leagueTotal || 20);
          world.evaluateBoardConfidence(userClub.id, leaguePos || 10, leagueTotal || 20, wonCup, false);
          world.checkManagerJobOffers(tempDate, userClub.id, useGameStore.getState().managerReputation);
        }
        setIsSimulating(false);
        setProgress(100);
        setStatus(`✓ Temporada completada. ${daysProcessed} días simulados.`);
        setCurrentDate(tempDate);
        notify();
        onBack();
        return;
      }

      if (batchCount >= BATCH_SIZE) {
        setCurrentDate(new Date(tempDate));
        batchCount = 0;
        await new Promise(r => setTimeout(r, 0));
      }
    }

    setFixtures(localFixtures);
    setCurrentDate(new Date(tempDate));
    if (activeManagedTeamId) {
      useGameStore.getState().updateNextFixture(localFixtures, tempDate, activeManagedTeamId);
    }
    setIsSimulating(false);
    setProgress(100);
    if (!cancelledRef.current) {
      setStatus(`✓ Simulación completada. ${daysProcessed} días simulados.`);
    }
    notify();
    onBack();
  }, [userClub, selectedNationalTeamId, seasonEndDate, setFixtures, setCurrentDate, setSeasonSummary, setUserWonLeague, notify, onBack]);

  const handleSimulateSeason = async () => {
    const nextSeason = new Date(currentDate);
    nextSeason.setFullYear(nextSeason.getFullYear() + 1);
    nextSeason.setMonth(5);
    nextSeason.setDate(30);
    await simulateToDate(nextSeason);
  };

  const handleSimulateToDate = async () => {
    if (!targetDate) return;
    const parts = targetDate.split('-').map(Number);
    if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
      setStatus('❌ Formato de fecha inválido. Usa YYYY-MM-DD');
      return;
    }
    const end = new Date(parts[0], parts[1] - 1, parts[2]);
    if (end <= currentDate) {
      setStatus('❌ La fecha debe ser posterior a la actual.');
      return;
    }
    await simulateToDate(end);
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setStatus('⏸ Cancelando...');
  };

  if (mode === 'MENU') {
    return (
      <div className="p-4 h-full overflow-y-auto bg-[#d4dcd4]">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={onBack} className="p-2 bg-white border border-[#a0b0a0] rounded-sm hover:bg-[#ccd9cc] transition-colors">
              <ChevronRight size={20} className="rotate-180" />
            </button>
            <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-2">
              <Sun size={24} className="text-amber-500" /> Vacaciones
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setMode('SEASON')}
              disabled={isSimulating}
              className="p-6 bg-white border-2 border-[#a0b0a0] rounded-sm hover:border-[#3a4a3a] hover:shadow-lg transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-3xl mb-3">🏆</div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-1">Simular 1 Temporada</h3>
              <p className="text-[10px] text-slate-600 font-bold">Avanza hasta el final de la temporada actual. Todos los partidos, ligas, copas, contratos y finanzas se simulan automáticamente.</p>
            </button>
            <button
              onClick={() => setMode('DATE')}
              disabled={isSimulating}
              className="p-6 bg-white border-2 border-[#a0b0a0] rounded-sm hover:border-[#3a4a3a] hover:shadow-lg transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-3xl mb-3">📅</div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-1">Simular hasta Fecha</h3>
              <p className="text-[10px] text-slate-600 font-bold">Avanza hasta una fecha específica. Ideal para saltar periodos largos sin actividad.</p>
            </button>
          </div>
          {status && (
            <FMBox title="Estado" className="mt-4">
              <div className="p-3 flex items-start gap-2">
                <AlertCircle size={16} className="text-slate-500 shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold text-slate-700">{status}</p>
              </div>
            </FMBox>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'SEASON') {
    return (
      <div className="p-4 h-full overflow-y-auto bg-[#d4dcd4]">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setMode('MENU')} disabled={isSimulating} className="p-2 bg-white border border-[#a0b0a0] rounded-sm hover:bg-[#ccd9cc] transition-colors">
              <ChevronRight size={20} className="rotate-180" />
            </button>
            <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Simular Temporada</h2>
          </div>
          <FMBox title="Confirmar Acción">
            <div className="p-4 space-y-4">
              <p className="text-[11px] font-bold text-slate-700 leading-relaxed">
                Se simularán todos los partidos desde <strong>{currentDate.toLocaleDateString()}</strong> hasta el final de la temporada ({seasonEndDate.toLocaleDateString()}).
              </p>
              <p className="text-[10px] text-slate-500 font-bold">
                Esta acción no se puede deshacer. Incluye partidos de liga, copas, torneos continentales, reservas, juveniles y selecciones, además de finanzas, contratos y desarrollo de jugadores.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={onBack}
                  disabled={isSimulating}
                  className="flex-1 py-3 bg-white border-2 border-[#a0b0a0] text-slate-700 font-black uppercase text-[10px] tracking-wider rounded-sm hover:bg-[#ccd9cc] transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSimulateSeason}
                  disabled={isSimulating}
                  className="flex-[2] py-3 bg-[#3a4a3a] text-white font-black uppercase text-[11px] tracking-wider rounded-sm hover:bg-[#2a3a2a] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSimulating ? 'Simulando...' : <>⚽ Simular Temporada</>}
                </button>
              </div>
              {isSimulating && (
                <button onClick={handleCancel} className="w-full py-2 bg-red-600 text-white font-black uppercase text-[10px] tracking-wider rounded-sm hover:bg-red-700 transition-colors">
                  ⏹ Detener Simulación
                </button>
              )}
            </div>
          </FMBox>
          {status && (
            <FMBox title="Progreso" className="mt-4">
              <div className="p-3">
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-[#3a4a3a] transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-[10px] font-bold text-slate-600">{status}</p>
              </div>
            </FMBox>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 h-full overflow-y-auto bg-[#d4dcd4]">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setMode('MENU')} disabled={isSimulating} className="p-2 bg-white border border-[#a0b0a0] rounded-sm hover:bg-[#ccd9cc] transition-colors">
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Simular hasta Fecha</h2>
        </div>
        <FMBox title="Seleccionar Fecha">
          <div className="p-4 space-y-4">
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Fecha objetivo (YYYY-MM-DD)</label>
              <input
                type="text"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                placeholder="2027-06-30"
                disabled={isSimulating}
                className="w-full bg-white border border-[#a0b0a0] rounded-sm px-3 py-2 text-sm font-bold text-slate-900 focus:border-[#3a4a3a] outline-none disabled:opacity-50"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={onBack}
                disabled={isSimulating}
                className="flex-1 py-3 bg-white border-2 border-[#a0b0a0] text-slate-700 font-black uppercase text-[10px] tracking-wider rounded-sm hover:bg-[#ccd9cc] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSimulateToDate}
                disabled={isSimulating}
                className="flex-[2] py-3 bg-[#3a4a3a] text-white font-black uppercase text-[11px] tracking-wider rounded-sm hover:bg-[#2a3a2a] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSimulating ? 'Simulando...' : <>⚽ Simular</>}
              </button>
            </div>
            {isSimulating && (
              <button onClick={handleCancel} className="w-full py-2 bg-red-600 text-white font-black uppercase text-[10px] tracking-wider rounded-sm hover:bg-red-700 transition-colors">
                ⏹ Detener Simulación
              </button>
            )}
          </div>
        </FMBox>
        {status && (
          <FMBox title="Progreso" className="mt-4">
            <div className="p-3">
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-[#3a4a3a] transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[10px] font-bold text-slate-600">{status}</p>
            </div>
          </FMBox>
        )}
      </div>
    </div>
  );
};
