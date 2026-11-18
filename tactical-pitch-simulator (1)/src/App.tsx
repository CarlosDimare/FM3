import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CLUB_PRESETS } from './data/teams';
import { ROLE_LABELS } from './engine/formations';
import { MatchEngine } from './engine/MatchEngine';
import { soundEngine } from './engine/soundEngine';
import { MatchViewport } from './scene/MatchViewport';
import { CommentaryTab } from './components/CommentaryTab';
import { DebugLogTab } from './components/DebugLogTab';
import { FmSidebar } from './components/FmSidebar';
import { MatchSetupModal } from './components/MatchSetupModal';
import { SquadBenchTab } from './components/SquadBenchTab';
import { StatsAnalyticsTab } from './components/StatsAnalyticsTab';
import { TacticalBoardTab } from './components/TacticalBoardTab';
import { FmView, TopScoreboard } from './components/TopScoreboard';
import {
  ClubPreset,
  HEATMAP_COLS,
  HEATMAP_ROWS,
  LightingMood,
  MatchSnapshot,
  PlayerInstruction,
  PlayerIntent,
  ShoutType,
  TeamTactics,
  VisualLayers,
} from './types/match';

const INTENT_LABELS: Record<PlayerIntent, string> = {
  posicional: 'Equilibrio táctico',
  apoyo_corto: 'Apoyo en corto',
  desmarque_ruptura: 'Ruptura curva al espacio',
  amplitud: 'Dando amplitud / Doblaje',
  pared: 'Pared ofensiva',
  llegada_area: 'Llegando al área',
  arrastre: 'Desmarque de arrastre',
  controlando: 'Amortiguando / Control',
  escaneando: 'Parado / Leyendo opciones',
  conduccion: 'Conduciendo al espacio',
  temporizacion_ofensiva: 'Pausa / Protegiendo balón',
  temporizando: 'Temporizando 1v1',
  presion: 'Arco de presión',
  cobertura: 'Cobertura / Línea de pase',
  marcaje: 'Marcaje cercano',
  repliegue: 'Repliegue en embudo',
  salto_aereo: 'Disputa aérea',
  entrada: 'Entrada al suelo',
  desequilibrio: 'Recuperando equilibrio',
  portero: 'Vigilancia portería',
  portero_libero: 'Salida de portero líbero',
};

const VIEW_TITLES: Record<FmView, string> = {
  pitch: 'Campo 2D',
  stats_resumen: 'Estadísticas Opta',
  stats_mapas: 'Zonas y Mapas de Acción',
  stats_boxscore: 'Box Score Individual y Notas',
  pizarra: 'Pizarra Táctica e Instrucciones',
  banquillo: 'Plantilla y Sustituciones',
  cronica: 'Crónica del Partido',
  log: 'Telemetría y Log Copiable',
};

export default function App() {
  const engineRef = useRef<MatchEngine>(new MatchEngine(CLUB_PRESETS[0], CLUB_PRESETS[1]));
  const [snapshot, setSnapshot] = useState<MatchSnapshot>(() => engineRef.current.getSnapshot());
  const [matchRevision, setMatchRevision] = useState(0);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isInstantSimulating, setIsInstantSimulating] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [activeView, setActiveView] = useState<FmView>('pitch');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [lightingMood, setLightingMood] = useState<LightingMood>('dusk');
  const [setupOpen, setSetupOpen] = useState(false);

  const instantRafRef = useRef<number | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const [visualLayers, setVisualLayers] = useState<VisualLayers>({
    offsideLine: false,
    passNetwork: false,
    tacticalZones: false,
    playerNames: false,
  });

  const syncNow = useCallback(() => {
    setSnapshot(engineRef.current.getSnapshot());
  }, []);

  const cancelInstantSim = useCallback(() => {
    if (instantRafRef.current !== null) {
      cancelAnimationFrame(instantRafRef.current);
      instantRafRef.current = null;
    }
    setIsInstantSimulating(false);
    soundEngine.setEnabled(soundEnabledRef.current);
  }, []);

  // Authoritative simulation RAF loop (runs even when viewing Stats, Tactics or Log)
  useEffect(() => {
    if (!isPlaying || isInstantSimulating) return;

    let frameId = 0;
    let lastTime = performance.now();
    let hudAccumulator = 0;
    let lastPhase = engineRef.current.phase;

    const tick = () => {
      const now = performance.now();
      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const eng = engineRef.current;
      eng.step(rawDt, speedMultiplier);

      hudAccumulator += rawDt;
      if (hudAccumulator >= 0.1 || eng.phase !== lastPhase) {
        hudAccumulator = 0;
        lastPhase = eng.phase;
        setSnapshot(eng.getSnapshot());
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, isInstantSimulating, speedMultiplier]);

  // Clean up instant simulation on unmount
  useEffect(() => {
    return () => {
      if (instantRafRef.current !== null) {
        cancelAnimationFrame(instantRafRef.current);
      }
    };
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (isInstantSimulating) return;
    setIsPlaying((prev) => !prev);
  }, [isInstantSimulating]);

  const handleStartSecondHalf = useCallback(() => {
    if (isInstantSimulating) return;
    engineRef.current.startSecondHalf();
    setIsPlaying(true);
    syncNow();
  }, [isInstantSimulating, syncNow]);

  // Time-sliced "Resultado Instantáneo" runner (~1-2.5s wall time, identical 1x sub-step & log fidelity)
  const handleInstantResult = useCallback(() => {
    const eng = engineRef.current;
    if (eng.phase === 'full_time' || isInstantSimulating) return;

    cancelInstantSim();
    setIsPlaying(false);
    setIsInstantSimulating(true);
    soundEngine.setEnabled(false);

    const runBurstFrame = () => {
      const frameStart = performance.now();
      const frameBudgetMs = 20;
      let stepsThisFrame = 0;

      // Cap steps per frame so the clock visibly races smoothly across ~30-45 frames (~1.0-1.8s total)
      while (
        eng.phase !== 'full_time' &&
        stepsThisFrame < 95 &&
        performance.now() - frameStart < frameBudgetMs
      ) {
        if (eng.phase === 'half_time') {
          eng.startSecondHalf();
        }
        // Uses 0.05 * 4 = 0.20s sim per call -> 17 fixed sub-steps of dt <= 0.012s (identical to 1x!)
        eng.step(0.05, 4);
        stepsThisFrame++;
      }

      setSnapshot(eng.getSnapshot());

      if (eng.phase === 'full_time') {
        instantRafRef.current = null;
        setIsInstantSimulating(false);
        soundEngine.setEnabled(soundEnabledRef.current);
        return;
      }

      instantRafRef.current = requestAnimationFrame(runBurstFrame);
    };

    instantRafRef.current = requestAnimationFrame(runBurstFrame);
  }, [cancelInstantSim, isInstantSimulating]);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (!isInstantSimulating) {
        soundEngine.setEnabled(next);
      }
      return next;
    });
  }, [isInstantSimulating]);

  const handleUpdateTactics = useCallback(
    (partial: Partial<TeamTactics>) => {
      engineRef.current.updateHomeTactics(partial);
      syncNow();
    },
    [syncNow]
  );

  const handleUpdateInstruction = useCallback(
    (playerId: string, instruction: PlayerInstruction) => {
      engineRef.current.updatePlayerInstruction(playerId, instruction);
      syncNow();
    },
    [syncNow]
  );

  const handleSwapSlots = useCallback(
    (aId: string, bId: string) => {
      engineRef.current.swapHomeSlots(aId, bId);
      syncNow();
    },
    [syncNow]
  );

  const handleSubstitute = useCallback(
    (outId: string, inId: string) => {
      engineRef.current.makeSubstitution('home', outId, inId);
      syncNow();
    },
    [syncNow]
  );

  const handleShout = useCallback(
    (shout: ShoutType) => {
      engineRef.current.triggerShout(shout);
      syncNow();
    },
    [syncNow]
  );

  const handleToggleLayer = useCallback((key: keyof VisualLayers) => {
    setVisualLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleStartNewMatch = useCallback(
    (home: ClubPreset, away: ClubPreset, mood: LightingMood) => {
      cancelInstantSim();
      engineRef.current.resetMatch(home, away);
      setLightingMood(mood);
      setSelectedPlayerId(null);
      setActiveView('pitch');
      setSetupOpen(false);
      setIsPlaying(true);
      setMatchRevision((r) => r + 1);
      syncNow();
    },
    [cancelInstantSim, syncNow]
  );

  // Keyboard shortcuts (Space: Play/Pause, Escape: Close modal/selection)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (isInstantSimulating) return;
        if (engineRef.current.phase === 'half_time') {
          handleStartSecondHalf();
        } else {
          handleTogglePlay();
        }
      } else if (e.key === 'Escape') {
        setSelectedPlayerId(null);
        setSetupOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStartSecondHalf, handleTogglePlay, isInstantSimulating]);

  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId) return null;
    return (
      snapshot.homePlayers.find((p) => p.id === selectedPlayerId) ||
      snapshot.awayPlayers.find((p) => p.id === selectedPlayerId) ||
      null
    );
  }, [selectedPlayerId, snapshot.homePlayers, snapshot.awayPlayers]);

  // FM08 Bottom Commentary Ticker Line
  const tickerLine = useMemo(() => {
    if (isInstantSimulating) {
      return `Simulación rápida en curso (${Math.floor(snapshot.clockSeconds / 60)}') — Generando telemetría completa...`;
    }
    if (snapshot.lastBannerEvent) {
      return `${snapshot.lastBannerEvent.minute}' ${snapshot.lastBannerEvent.title} — ${snapshot.lastBannerEvent.description}`;
    }
    if (snapshot.phase === 'half_time') {
      return `Descanso: ${snapshot.homeClub.name} ${snapshot.homeScore} - ${snapshot.awayScore} ${snapshot.awayClub.name}`;
    }
    if (snapshot.phase === 'full_time') {
      return `Final del partido: ${snapshot.homeClub.name} ${snapshot.homeScore} - ${snapshot.awayScore} ${snapshot.awayClub.name}`;
    }
    const ball = snapshot.ball;
    if (ball.setPiece !== 'open_play') {
      const takerClub =
        ball.setPieceTeam === 'home' ? snapshot.homeClub.name : snapshot.awayClub.name;
      const spNames: Record<string, string> = {
        kickoff: 'Saque de centro',
        throw_in: 'Saque de banda',
        corner: 'Saque de esquina',
        goal_kick: 'Saque de puerta',
        free_kick: 'Tiro libre',
        penalty: 'Penalti',
      };
      return `${spNames[ball.setPiece] || 'Balón parado'} a favor de ${takerClub}`;
    }
    const carrier =
      snapshot.homePlayers.find((p) => p.id === ball.ownerId) ||
      snapshot.awayPlayers.find((p) => p.id === ball.ownerId);
    if (carrier) {
      if (carrier.intent === 'conduccion') return `${carrier.name} conduce el balón hacia adelante`;
      if (carrier.intent === 'temporizacion_ofensiva')
        return `${carrier.name} temporiza y protege la posesión`;
      if (carrier.intent === 'portero' || carrier.intent === 'portero_libero')
        return `${carrier.name} controla el esférico para distribuir`;
      return `${carrier.name} controla el balón y busca opciones`;
    }
    if (ball.isShotInFlight) {
      return '¡Remate hacia portería!';
    }
    const latest = snapshot.events[0];
    if (latest) {
      return `${latest.minute}' ${latest.title} — ${latest.description}`;
    }
    return `Balón en juego — ${snapshot.homeClub.shortCode} vs ${snapshot.awayClub.shortCode}`;
  }, [isInstantSimulating, snapshot]);

  const statsSubTab =
    activeView === 'stats_mapas'
      ? 'mapas'
      : activeView === 'stats_boxscore'
      ? 'boxscore'
      : 'resumen';

  return (
    <div className="w-screen h-dvh flex flex-col overflow-hidden bg-[#d3d7cd] text-[#1f241f]">
      {/* FM08 Broadcast Header + Brushed-Silver Toolbar */}
      <TopScoreboard
        snapshot={snapshot}
        isPlaying={isPlaying}
        isInstantSimulating={isInstantSimulating}
        onTogglePlay={handleTogglePlay}
        onStartSecondHalf={handleStartSecondHalf}
        onInstantResult={handleInstantResult}
        speedMultiplier={speedMultiplier}
        onChangeSpeed={setSpeedMultiplier}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        activeView={activeView}
        onSelectView={setActiveView}
        onOpenNewMatch={() => setSetupOpen(true)}
      />

      {/* Mobile / Tablet Compact View Switcher Strip */}
      <nav
        className="flex lg:hidden items-center gap-1 overflow-x-auto no-scrollbar bg-[#c7ccc1] border-b border-[#989e93] px-1.5 py-1 shrink-0"
        aria-label="Navegación móvil"
      >
        {(
          [
            { id: 'pitch', label: 'Campo' },
            { id: 'stats_resumen', label: 'Stats' },
            { id: 'stats_mapas', label: 'Mapas' },
            { id: 'pizarra', label: 'Táctica' },
            { id: 'banquillo', label: 'Plantilla' },
            { id: 'cronica', label: 'Crónica' },
            { id: 'log', label: 'Log' },
          ] as { id: FmView; label: string }[]
        ).map((tab) => {
          const active =
            tab.id === 'stats_resumen'
              ? activeView === 'stats_resumen' || activeView === 'stats_boxscore'
              : activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`px-2 py-0.5 rounded-sm text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#1f5922] text-white'
                  : 'bg-[#dde0d7] text-[#232823] border border-[#a1a79d]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Main FM08 Split Workspace */}
      <div className="relative flex-1 flex min-h-0 overflow-hidden">
        {sidebarOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/50 lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 left-0 z-40 lg:static lg:z-auto h-full shadow-2xl lg:shadow-none">
              <FmSidebar
                snapshot={snapshot}
                activeView={activeView}
                onSelectView={setActiveView}
                isPlaying={isPlaying}
                isInstantSimulating={isInstantSimulating}
                onTogglePlay={handleTogglePlay}
                onStartSecondHalf={handleStartSecondHalf}
                onInstantResult={handleInstantResult}
                speedMultiplier={speedMultiplier}
                onChangeSpeed={setSpeedMultiplier}
                onUpdateTactics={handleUpdateTactics}
                onShout={handleShout}
                visualLayers={visualLayers}
                onToggleLayer={handleToggleLayer}
                onOpenNewMatch={() => setSetupOpen(true)}
                onCloseMobile={() => setSidebarOpen(false)}
              />
            </div>
          </>
        )}

        {/* Right Main Stage */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#d3d7cd] p-1 sm:p-2 gap-1 sm:gap-1.5">
          {/* Top Stage Title + Inline Tabular Match Metrics */}
          <div className="flex items-center justify-between gap-2 px-0.5 shrink-0">
            <h1 className="text-[11.5px] sm:text-[12.5px] font-bold text-[#1f5922] tracking-tight truncate">
              {VIEW_TITLES[activeView]}
            </h1>
            <div className="flex items-center gap-2 sm:gap-3 text-[10.5px] sm:text-[11px] font-mono tabular-nums text-[#353b34] shrink-0">
              <span>
                Pos {snapshot.homeStats.possessionPct}%-{snapshot.awayStats.possessionPct}%
              </span>
              <span>
                Tiros {snapshot.homeStats.shots}({snapshot.homeStats.shotsOnTarget})-
                {snapshot.awayStats.shots}({snapshot.awayStats.shotsOnTarget})
              </span>
              <span className="hidden sm:inline">
                xG {snapshot.homeStats.xg.toFixed(2)} - {snapshot.awayStats.xg.toFixed(2)}
              </span>
            </div>
          </div>

          {activeView === 'pitch' ? (
            <>
              {/* Framed FM08 2D Cenital Pitch Canvas */}
              <div className="relative flex-1 min-h-0 border border-[#7c8379] shadow-inner bg-[#4a762a]">
                <MatchViewport
                  engineRef={engineRef}
                  visualLayers={visualLayers}
                  lightingMood={lightingMood}
                  selectedPlayerId={selectedPlayerId}
                  onSelectPlayer={setSelectedPlayerId}
                  matchRevision={matchRevision}
                />

                {/* Selected Player On-Pitch Inspector (appears only when user clicks a disc) */}
                {selectedPlayer && (
                  <div className="absolute bottom-2 inset-x-2 sm:inset-x-auto sm:bottom-3 sm:left-3 z-20 sm:w-80 rounded-lg bg-[#0b0f14]/95 border border-slate-700/90 p-2.5 sm:p-3 shadow-2xl space-y-2 text-slate-100">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-4 rounded-sm shrink-0"
                            style={{
                              backgroundColor:
                                selectedPlayer.side === 'home'
                                  ? snapshot.homeClub.colors.primary
                                  : snapshot.awayClub.colors.primary,
                            }}
                          />
                          <span className="font-mono text-xs font-bold text-amber-400 tabular-nums">
                            #{selectedPlayer.number}
                          </span>
                          <span className="text-sm font-semibold text-white">
                            {selectedPlayer.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {ROLE_LABELS[selectedPlayer.assignedRole]} ·{' '}
                          {selectedPlayer.side === 'home'
                            ? snapshot.homeClub.shortCode
                            : snapshot.awayClub.shortCode}{' '}
                          · {Math.round(selectedPlayer.minutesPlayed)}&apos;
                          {selectedPlayer.knockSeverity === 2 && (
                            <span className="text-rose-400 font-semibold"> · Lesionado</span>
                          )}
                          {selectedPlayer.knockSeverity === 1 && (
                            <span className="text-amber-400 font-medium"> · Tocado</span>
                          )}
                        </div>
                        <div className="text-[11px] text-sky-400 font-medium">
                          {INTENT_LABELS[selectedPlayer.intent]}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedPlayerId(null)}
                        className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                        aria-label="Cerrar ficha de jugador"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-[11px] tabular-nums">
                      <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                        <div className="text-emerald-400 font-semibold">
                          {selectedPlayer.rating.toFixed(1)}
                        </div>
                        <div className="text-[9px] font-sans text-slate-400">Nota</div>
                      </div>
                      <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                        <div className="text-white font-semibold">
                          {Math.round(selectedPlayer.stamina)}%
                        </div>
                        <div className="text-[9px] font-sans text-slate-400">Físico</div>
                      </div>
                      <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                        <div className="text-white font-semibold">
                          {(selectedPlayer.distanceMeters / 1000).toFixed(2)}
                        </div>
                        <div className="text-[9px] font-sans text-slate-400">Km</div>
                      </div>
                      <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                        <div className="text-white font-semibold">
                          {selectedPlayer.passesCompleted}/{selectedPlayer.passesAttempted}
                        </div>
                        <div className="text-[9px] font-sans text-slate-400">Pases</div>
                      </div>
                    </div>

                    {/* Mini 12x8 Touch Heatmap + Compact Opta Row */}
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5 aspect-[105/68] rounded bg-[#0e2619] border border-slate-800 overflow-hidden">
                        <svg viewBox="-52.5 -34 105 68" className="w-full h-full">
                          {(() => {
                            const maxH = Math.max(1, ...selectedPlayer.heatmap);
                            const cw = 105 / HEATMAP_COLS;
                            const ch = 68 / HEATMAP_ROWS;
                            const colColor =
                              selectedPlayer.side === 'home'
                                ? snapshot.homeClub.colors.primary
                                : snapshot.awayClub.colors.primary;
                            return selectedPlayer.heatmap.map((v, i) => {
                              if (v <= 0) return null;
                              const c = i % HEATMAP_COLS;
                              const r = Math.floor(i / HEATMAP_COLS);
                              const t = Math.min(1, v / maxH);
                              return (
                                <rect
                                  key={i}
                                  x={-52.5 + c * cw}
                                  y={-34 + r * ch}
                                  width={cw + 0.2}
                                  height={ch + 0.2}
                                  fill={t > 0.7 ? '#ef4444' : t > 0.4 ? '#f59e0b' : colColor}
                                  fillOpacity={0.2 + t * 0.65}
                                />
                              );
                            });
                          })()}
                          <rect
                            x="-52.5"
                            y="-34"
                            width="105"
                            height="68"
                            fill="none"
                            stroke="rgba(255,255,255,0.28)"
                            strokeWidth="0.9"
                          />
                          <line
                            x1="0"
                            y1="-34"
                            x2="0"
                            y2="34"
                            stroke="rgba(255,255,255,0.25)"
                            strokeWidth="0.8"
                          />
                        </svg>
                      </div>
                      <div className="col-span-7 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-mono tabular-nums text-slate-300">
                        <span>
                          xG/xA: {selectedPlayer.xgGenerated.toFixed(2)}/{selectedPlayer.xa.toFixed(2)}
                        </span>
                        <span>P.Prog: {selectedPlayer.progressivePasses}</span>
                        <span>
                          Duelos:{' '}
                          {selectedPlayer.groundDuelsWon + selectedPlayer.aerialDuelsWon}/
                          {selectedPlayer.groundDuelsWon +
                            selectedPlayer.groundDuelsLost +
                            selectedPlayer.aerialDuelsWon +
                            selectedPlayer.aerialDuelsLost}
                        </span>
                        <span>
                          {selectedPlayer.assignedRole === 'POR'
                            ? `Evit: ${(selectedPlayer.xgotFaced - selectedPlayer.goalsConceded).toFixed(2)}`
                            : `Reg: ${selectedPlayer.dribblesCompleted}/${selectedPlayer.dribblesAttempted}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 tabular-nums px-1.5 py-1 rounded bg-slate-900/60 border border-slate-800/70">
                      <span>VEL {selectedPlayer.attributes.pace}</span>
                      <span>PAS {selectedPlayer.attributes.passing}</span>
                      <span>TIR {selectedPlayer.attributes.shooting}</span>
                      <span>REG {selectedPlayer.attributes.dribbling}</span>
                      <span>DEF {selectedPlayer.attributes.defending}</span>
                      <span>VIS {selectedPlayer.attributes.vision}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
                      {selectedPlayer.side === 'home' && selectedPlayer.assignedRole !== 'POR' ? (
                        <div className="flex flex-wrap gap-1">
                          {(
                            [
                              { id: 'equilibrado', label: 'Equil.' },
                              { id: 'subir_mas', label: 'Subir' },
                              { id: 'mantener_posicion', label: 'Fijo' },
                              { id: 'marcaje_ferreo', label: 'Marcaje' },
                            ] as { id: PlayerInstruction; label: string }[]
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              onClick={() => handleUpdateInstruction(selectedPlayer.id, opt.id)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer ${
                                selectedPlayer.instruction === opt.id
                                  ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500">Ficha Opta en vivo</span>
                      )}
                      <button
                        onClick={() => setActiveView('stats_boxscore')}
                        className="px-2 py-0.5 rounded bg-sky-600/25 border border-sky-500/60 text-[10px] font-medium text-sky-300 hover:bg-sky-600/40 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Analítica completa
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* FM08 Bottom Live Commentary Ticker Bar */}
              <button
                type="button"
                onClick={() => setActiveView('cronica')}
                className="h-8 sm:h-10 shrink-0 w-full bg-[#f6f7f4] hover:bg-white border border-[#8e948a] shadow-[inset_0_1px_0_#ffffff] flex items-center justify-center px-2.5 sm:px-4 cursor-pointer transition-colors"
                title="Abrir crónica completa del partido"
              >
                <span className="text-[12.5px] sm:text-[15px] font-semibold text-[#7a1812] truncate">
                  {tickerLine}
                </span>
              </button>
            </>
          ) : (
            /* Analytical / Tactical / Telemetry View Panel */
            <div className="flex-1 min-h-0 rounded-xs border border-[#7c837a] bg-[#0e141c] text-slate-100 p-2.5 sm:p-4 overflow-y-auto tactical-scroll">
              {(activeView === 'stats_resumen' ||
                activeView === 'stats_mapas' ||
                activeView === 'stats_boxscore') && (
                <StatsAnalyticsTab
                  snapshot={snapshot}
                  selectedPlayerId={selectedPlayerId}
                  onSelectPlayer={setSelectedPlayerId}
                  requestedSubTab={statsSubTab}
                />
              )}
              {activeView === 'pizarra' && (
                <TacticalBoardTab
                  snapshot={snapshot}
                  onUpdateTactics={handleUpdateTactics}
                  onUpdateInstruction={handleUpdateInstruction}
                  onSwapSlots={handleSwapSlots}
                  visualLayers={visualLayers}
                  onToggleLayer={handleToggleLayer}
                />
              )}
              {activeView === 'banquillo' && (
                <SquadBenchTab snapshot={snapshot} onSubstitute={handleSubstitute} />
              )}
              {activeView === 'cronica' && <CommentaryTab snapshot={snapshot} />}
              {activeView === 'log' && (
                <DebugLogTab engine={engineRef.current} snapshotVersion={snapshot.clockSeconds} />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Bottom FM08 Status Bar (hidden on narrow mobile to maximize pitch area) */}
      <footer className="hidden sm:flex h-6 shrink-0 bg-[#32363b] border-t border-[#1e2226] text-[#d5d9de] text-[11px] px-3 items-center justify-between select-none">
        <div className="truncate">
          {snapshot.homeClub.stadiumName} · {snapshot.homeClub.name} ({snapshot.homeTactics.formation}) vs{' '}
          {snapshot.awayClub.name} ({snapshot.awayTactics.formation})
        </div>
        <div className="font-mono tabular-nums text-[10.5px] text-slate-300 shrink-0 pl-2">
          {isInstantSimulating
            ? 'Simulación rápida (precisión 1x)'
            : `Vel ${speedMultiplier}x · ${snapshot.events.length} eventos · Espacio: Pausa/Play`}
        </div>
      </footer>

      {/* Match Setup Modal */}
      {setupOpen && (
        <MatchSetupModal
          currentHome={snapshot.homeClub}
          currentAway={snapshot.awayClub}
          currentMood={lightingMood}
          onStartMatch={handleStartNewMatch}
          onClose={() => setSetupOpen(false)}
        />
      )}
    </div>
  );
}
