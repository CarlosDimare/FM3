import React from 'react';
import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Megaphone,
  MessageSquareText,
  Terminal,
  Users,
  X,
} from 'lucide-react';
import { MatchEngine } from '../engine/MatchEngine';
import { FORMATION_LIST } from '../engine/formations';
import {
  FormationId,
  MatchSnapshot,
  MentalityLevel,
  PassingStyle,
  PlayerInstruction,
  PressingIntensity,
  ShoutType,
  TeamTactics,
  TempoLevel,
  VisualLayers,
} from '../types/match';
import { CommentaryTab } from './CommentaryTab';
import { DebugLogTab } from './DebugLogTab';
import { SquadBenchTab } from './SquadBenchTab';
import { StatsAnalyticsTab } from './StatsAnalyticsTab';
import { TacticalBoardTab } from './TacticalBoardTab';

export type DockTab = 'pizarra' | 'banquillo' | 'estadisticas' | 'cronica' | 'log' | null;

interface BottomTacticalDockProps {
  engine: MatchEngine;
  snapshot: MatchSnapshot;
  activeTab: DockTab;
  onSelectTab: (tab: DockTab) => void;
  dockCollapsed: boolean;
  onToggleCollapse: () => void;
  onUpdateTactics: (partial: Partial<TeamTactics>) => void;
  onUpdateInstruction: (playerId: string, instruction: PlayerInstruction) => void;
  onSwapSlots: (aId: string, bId: string) => void;
  onSubstitute: (outId: string, inId: string) => void;
  onShout: (shout: ShoutType) => void;
  visualLayers: VisualLayers;
  onToggleLayer: (key: keyof VisualLayers) => void;
  hudHidden: boolean;
  selectedPlayerId?: string | null;
  onSelectPlayer?: (id: string | null) => void;
}

const MENTALITIES: { id: MentalityLevel; short: string }[] = [
  { id: 'defensiva', short: 'Def' },
  { id: 'equilibrada', short: 'Equil' },
  { id: 'ofensiva', short: 'Ofens' },
  { id: 'ataque_total', short: 'Total' },
];

const PRESSING: { id: PressingIntensity; label: string }[] = [
  { id: 'bloque_bajo', label: 'Bloque Bajo' },
  { id: 'bloque_medio', label: 'Bloque Medio' },
  { id: 'presion_alta', label: 'Presión Alta' },
  { id: 'gegenpress', label: 'Gegenpress' },
];

const PASSING: { id: PassingStyle; label: string }[] = [
  { id: 'corto', label: 'Corto' },
  { id: 'mixto', label: 'Mixto' },
  { id: 'directo', label: 'Directo' },
  { id: 'largo', label: 'Largo' },
];

const TEMPOS: { id: TempoLevel; label: string }[] = [
  { id: 'pausado', label: 'Pausado' },
  { id: 'normal', label: 'Normal' },
  { id: 'alto', label: 'Alto' },
  { id: 'vertiginoso', label: 'Vertiginoso' },
];

const SHOUTS: { id: ShoutType; label: string }[] = [
  { id: 'animar', label: '¡Ánimo!' },
  { id: 'presionar', label: '¡Presión!' },
  { id: 'calma', label: '¡Calma!' },
  { id: 'atacar', label: '¡A por ellos!' },
];

export const BottomTacticalDock: React.FC<BottomTacticalDockProps> = ({
  engine,
  snapshot,
  activeTab,
  onSelectTab,
  dockCollapsed,
  onToggleCollapse,
  onUpdateTactics,
  onUpdateInstruction,
  onSwapSlots,
  onSubstitute,
  onShout,
  visualLayers,
  onToggleLayer,
  hudHidden,
  selectedPlayerId,
  onSelectPlayer,
}) => {
  if (hudHidden) return null;

  const { homeTactics, homeShoutCooldown, homeClub } = snapshot;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 w-[min(1080px,96vw)] flex flex-col items-center pointer-events-none">
      {/* Collapse / Expand Handle */}
      <button
        onClick={onToggleCollapse}
        className="pointer-events-auto mb-1 flex items-center gap-1.5 px-3 py-1 rounded-t-lg bg-[#0b0f14]/92 border border-b-0 border-slate-700/80 text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
      >
        {dockCollapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
            <span>Mostrar Dirección Táctica</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            <span>Ocultar Barra</span>
          </>
        )}
      </button>

      {!dockCollapsed && (
        <div className="pointer-events-auto w-full rounded-xl bg-[#0b0f14]/94 border border-slate-700/80 shadow-2xl overflow-hidden">
          {/* Expandable Upward Analytical Drawer */}
          {activeTab && (
            <div className="border-b border-slate-800 p-4 max-h-[58vh] overflow-y-auto tactical-scroll">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Activity className="w-3.5 h-3.5 text-sky-400" />
                  <span>
                    {activeTab === 'pizarra'
                      ? 'Pizarra Táctica e Instrucciones'
                      : activeTab === 'banquillo'
                      ? 'Plantilla, Rendimiento y Sustituciones'
                      : activeTab === 'estadisticas'
                      ? 'Centro de Analítica Opta y Football Manager'
                      : activeTab === 'log'
                      ? 'Log Copiable de Coordenadas y Telemetría'
                      : 'Crónica del Partido'}
                  </span>
                </div>
                <button
                  onClick={() => onSelectTab(null)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cerrar</span>
                </button>
              </div>

              {activeTab === 'pizarra' && (
                <TacticalBoardTab
                  snapshot={snapshot}
                  onUpdateTactics={onUpdateTactics}
                  onUpdateInstruction={onUpdateInstruction}
                  onSwapSlots={onSwapSlots}
                  visualLayers={visualLayers}
                  onToggleLayer={onToggleLayer}
                />
              )}
              {activeTab === 'banquillo' && (
                <SquadBenchTab snapshot={snapshot} onSubstitute={onSubstitute} />
              )}
              {activeTab === 'estadisticas' && (
                <StatsAnalyticsTab
                  snapshot={snapshot}
                  selectedPlayerId={selectedPlayerId}
                  onSelectPlayer={onSelectPlayer}
                />
              )}
              {activeTab === 'cronica' && <CommentaryTab snapshot={snapshot} />}
              {activeTab === 'log' && (
                <DebugLogTab engine={engine} snapshotVersion={snapshot.clockSeconds} />
              )}
            </div>
          )}

          {/* Compact Live Tactical Strip */}
          <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2.5">
            {/* Club Tactical Quick Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Formation Select */}
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-4 rounded-sm shrink-0"
                  style={{ backgroundColor: homeClub.colors.primary }}
                />
                <select
                  aria-label="Formación táctica"
                  value={homeTactics.formation}
                  onChange={(e) =>
                    onUpdateTactics({ formation: e.target.value as FormationId })
                  }
                  className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs font-mono font-semibold text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  {FORMATION_LIST.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mentality Segmented Bar */}
              <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                {MENTALITIES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onUpdateTactics({ mentality: m.id })}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      homeTactics.mentality === m.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.short}
                  </button>
                ))}
              </div>

              {/* Pressing Dropdown */}
              <select
                aria-label="Intensidad de presión"
                value={homeTactics.pressing}
                onChange={(e) =>
                  onUpdateTactics({ pressing: e.target.value as PressingIntensity })
                }
                className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-[11px] font-medium text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                {PRESSING.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.label}
                  </option>
                ))}
              </select>

              {/* Passing Dropdown */}
              <select
                aria-label="Estilo de pase"
                value={homeTactics.passing}
                onChange={(e) =>
                  onUpdateTactics({ passing: e.target.value as PassingStyle })
                }
                className="hidden sm:block bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-[11px] font-medium text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                {PASSING.map((ps) => (
                  <option key={ps.id} value={ps.id}>
                    Pase: {ps.label}
                  </option>
                ))}
              </select>

              {/* Tempo Dropdown */}
              <select
                aria-label="Ritmo de juego"
                value={homeTactics.tempo}
                onChange={(e) =>
                  onUpdateTactics({ tempo: e.target.value as TempoLevel })
                }
                className="hidden md:block bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-[11px] font-medium text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                {TEMPOS.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    Ritmo: {tp.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Touchline Shouts */}
            <div className="hidden xl:flex items-center gap-1 pl-2 border-l border-slate-800">
              <Megaphone className="w-3.5 h-3.5 text-amber-400 mr-0.5 shrink-0" />
              {SHOUTS.map((s) => (
                <button
                  key={s.id}
                  disabled={homeShoutCooldown > 0}
                  onClick={() => onShout(s.id)}
                  className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800 hover:border-amber-500/60 text-[11px] font-medium text-slate-200 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                  title={
                    homeShoutCooldown > 0
                      ? `Disponible en ${homeShoutCooldown} min`
                      : `Grito desde la banda: ${s.label}`
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Drawer Navigation Tabs */}
            <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
              {(
                [
                  { id: 'pizarra', label: 'Pizarra', icon: ClipboardList },
                  { id: 'banquillo', label: 'Banquillo', icon: Users },
                  { id: 'estadisticas', label: 'Stats & xG', icon: BarChart3 },
                  { id: 'cronica', label: 'Crónica', icon: MessageSquareText },
                  { id: 'log', label: 'Log', icon: Terminal },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const isOpen = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onSelectTab(isOpen ? null : tab.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isOpen
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
