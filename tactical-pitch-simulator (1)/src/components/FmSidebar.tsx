import React from 'react';
import { X } from 'lucide-react';
import { FORMATION_LIST } from '../engine/formations';
import {
  FormationId,
  MatchSnapshot,
  MentalityLevel,
  PassingStyle,
  PressingIntensity,
  ShoutType,
  TeamTactics,
  TempoLevel,
  VisualLayers,
} from '../types/match';
import { FmView } from './TopScoreboard';

interface FmSidebarProps {
  snapshot: MatchSnapshot;
  activeView: FmView;
  onSelectView: (v: FmView) => void;
  isPlaying: boolean;
  isInstantSimulating: boolean;
  onTogglePlay: () => void;
  onStartSecondHalf: () => void;
  onInstantResult: () => void;
  speedMultiplier: number;
  onChangeSpeed: (s: number) => void;
  onUpdateTactics: (partial: Partial<TeamTactics>) => void;
  onShout: (shout: ShoutType) => void;
  visualLayers: VisualLayers;
  onToggleLayer: (key: keyof VisualLayers) => void;
  onOpenNewMatch: () => void;
  onCloseMobile?: () => void;
}

const MENTALITIES: { id: MentalityLevel; label: string }[] = [
  { id: 'defensiva', label: 'Defensiva' },
  { id: 'equilibrada', label: 'Equilibrada' },
  { id: 'ofensiva', label: 'Ofensiva' },
  { id: 'ataque_total', label: 'Ataque Total' },
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

const NAV_ITEMS: { id: FmView; label: string; indent?: boolean }[] = [
  { id: 'pitch', label: 'Campo 2D' },
  { id: 'stats_resumen', label: 'Estadísticas Opta' },
  { id: 'stats_mapas', label: 'Zonas y Mapas', indent: true },
  { id: 'stats_boxscore', label: 'Box Score y Notas', indent: true },
  { id: 'pizarra', label: 'Pizarra Táctica' },
  { id: 'banquillo', label: 'Plantilla y Cambios' },
  { id: 'cronica', label: 'Crónica del Partido' },
  { id: 'log', label: 'Log Telemetría' },
];

export const FmSidebar: React.FC<FmSidebarProps> = ({
  snapshot,
  activeView,
  onSelectView,
  isPlaying,
  isInstantSimulating,
  onTogglePlay,
  onStartSecondHalf,
  onInstantResult,
  speedMultiplier,
  onChangeSpeed,
  onUpdateTactics,
  onShout,
  visualLayers,
  onToggleLayer,
  onOpenNewMatch,
  onCloseMobile,
}) => {
  const { phase, homeTactics, homeShoutCooldown, homeClub, clockSeconds } = snapshot;
  const totalMin = Math.floor(clockSeconds / 60);

  return (
    <aside className="w-[228px] lg:w-[192px] shrink-0 h-full bg-[#d3d7cd] border-r border-[#93998f] text-[#1f241f] flex flex-col justify-between overflow-y-auto tactical-scroll select-none">
      {/* Mobile Drawer Header */}
      {onCloseMobile && (
        <div className="lg:hidden flex items-center justify-between px-2.5 py-2 border-b border-[#adb3a8] bg-[#c7ccc1]">
          <span className="text-[11px] font-bold text-[#1f5922] truncate">
            {homeClub.name} ({homeTactics.formation})
          </span>
          <button
            onClick={onCloseMobile}
            className="p-1 rounded text-[#2a3029] hover:bg-black/10 cursor-pointer"
            aria-label="Cerrar menú lateral"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Tree Navigation (FM08 Left Outline) */}
      <nav className="p-2 space-y-0.5 border-b border-[#adb3a8]" aria-label="Vistas del partido">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectView(item.id);
                onCloseMobile?.();
              }}
              className={`w-full text-left py-1.5 lg:py-1 pr-2 rounded-sm text-[11.5px] leading-tight transition-colors cursor-pointer flex items-center gap-1.5 ${
                item.indent ? 'pl-5' : 'pl-2'
              } ${
                isActive
                  ? 'text-[#1c5920] font-bold bg-[#c3c9bd]'
                  : 'text-[#242a24] font-medium hover:bg-[#c7cdc1]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-xs shrink-0 ${
                  isActive ? 'bg-[#1c5920]' : 'bg-[#7d8479]'
                }`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Middle Speed Track + 2D Layers */}
      <div className="px-2.5 py-2 space-y-2.5 border-b border-[#adb3a8]">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#2d332d]">
            <span>Velocidad</span>
            <span className="font-mono tabular-nums text-[#1c5920]">{speedMultiplier}x</span>
          </div>
          <div className="grid grid-cols-4 gap-1 bg-[#c1c6bc] p-0.5 rounded-sm border border-[#969c91]">
            {[1, 2, 4, 8].map((spd) => (
              <button
                key={spd}
                disabled={isInstantSimulating}
                onClick={() => onChangeSpeed(spd)}
                className={`py-0.5 text-[10.5px] font-mono font-bold tabular-nums rounded-xs cursor-pointer disabled:opacity-45 ${
                  speedMultiplier === spd && !isInstantSimulating
                    ? 'bg-[#1f5922] text-white'
                    : 'text-[#262b26] hover:bg-[#d7dbd2]'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-[#2d332d]">Capas Campo 2D</div>
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                { key: 'playerNames', label: 'Nombres' },
                { key: 'offsideLine', label: 'Offside' },
                { key: 'passNetwork', label: 'Red Pases' },
                { key: 'tacticalZones', label: 'Zonas' },
              ] as { key: keyof VisualLayers; label: string }[]
            ).map((layer) => {
              const active = visualLayers[layer.key];
              return (
                <button
                  key={layer.key}
                  onClick={() => onToggleLayer(layer.key)}
                  className={`px-1.5 py-1 rounded-xs border text-[10.5px] font-medium text-center cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#1f5922] border-[#153f17] text-white font-semibold'
                      : 'bg-[#dde0d7] border-[#a1a79d] text-[#282e28] hover:bg-[#e7eae2]'
                  }`}
                >
                  {layer.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Stacked Beveled FM08 Action & Tactics Box */}
      <div className="p-2 space-y-1.5">
        <div className="border border-[#8e9489] bg-[#c7ccc2] rounded-xs overflow-hidden divide-y divide-[#9ea499]">
          {phase === 'half_time' ? (
            <button
              onClick={onStartSecondHalf}
              disabled={isInstantSimulating}
              className="w-full px-2.5 py-1.5 text-left text-[11.5px] font-bold bg-[#2b5d2c] hover:bg-[#214b22] text-white cursor-pointer disabled:opacity-50"
            >
              Iniciar 2ª Parte
            </button>
          ) : phase === 'full_time' ? (
            <button
              onClick={onOpenNewMatch}
              className="w-full px-2.5 py-1.5 text-left text-[11.5px] font-bold bg-[#234e7c] hover:bg-[#1a3d63] text-white cursor-pointer"
            >
              Jugar Revancha
            </button>
          ) : (
            <button
              onClick={onTogglePlay}
              disabled={isInstantSimulating}
              className="w-full px-2.5 py-1.5 text-left text-[11.5px] font-semibold bg-[#dde1d8] hover:bg-[#ebeee7] text-[#1c211c] cursor-pointer disabled:opacity-50"
            >
              {isPlaying ? 'Pausar Partido' : 'Reanudar Partido'}
            </button>
          )}

          <button
            onClick={() => {
              onInstantResult();
              onCloseMobile?.();
            }}
            disabled={phase === 'full_time' || isInstantSimulating}
            className="w-full px-2.5 py-1.5 text-left text-[11.5px] font-bold bg-[#245926] hover:bg-[#1b461d] text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isInstantSimulating ? `Simulando (${totalMin}')...` : 'Resultado Instantáneo'}
          </button>

          <button
            onClick={() => {
              onSelectView('pizarra');
              onCloseMobile?.();
            }}
            className="w-full px-2.5 py-1.5 text-left text-[11.5px] font-semibold bg-[#dde1d8] hover:bg-[#ebeee7] text-[#1c211c] cursor-pointer"
          >
            Táctica {homeClub.shortCode}
          </button>

          <button
            onClick={() => {
              onOpenNewMatch();
              onCloseMobile?.();
            }}
            disabled={isInstantSimulating}
            className="w-full px-2.5 py-1.5 text-left text-[11.5px] font-medium bg-[#d5d9d0] hover:bg-[#e4e7df] text-[#1c211c] cursor-pointer disabled:opacity-50"
          >
            Nuevo Partido...
          </button>
        </div>

        {/* Live Quick Tactical Adjustments */}
        <div className="border border-[#9aa095] bg-[#dcdfd6] rounded-xs p-2 space-y-1.5 text-[11px]">
          <div className="font-bold text-[#1f5922] text-[10.5px] uppercase tracking-wide">
            Ajustes Rápidos
          </div>

          <label className="block space-y-0.5">
            <span className="text-[10px] font-semibold text-[#3c423c]">Formación</span>
            <select
              aria-label="Formación táctica"
              value={homeTactics.formation}
              onChange={(e) =>
                onUpdateTactics({ formation: e.target.value as FormationId })
              }
              className="w-full bg-white border border-[#969c91] rounded-xs px-1.5 py-1 text-[11px] font-mono font-semibold text-[#181c18] focus:outline-none focus:border-[#1f5922] cursor-pointer"
            >
              {FORMATION_LIST.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-0.5">
            <span className="text-[10px] font-semibold text-[#3c423c]">Mentalidad</span>
            <select
              aria-label="Mentalidad"
              value={homeTactics.mentality}
              onChange={(e) =>
                onUpdateTactics({ mentality: e.target.value as MentalityLevel })
              }
              className="w-full bg-white border border-[#969c91] rounded-xs px-1.5 py-1 text-[11px] font-medium text-[#181c18] focus:outline-none focus:border-[#1f5922] cursor-pointer"
            >
              {MENTALITIES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-0.5">
            <span className="text-[10px] font-semibold text-[#3c423c]">Presión</span>
            <select
              aria-label="Intensidad de presión"
              value={homeTactics.pressing}
              onChange={(e) =>
                onUpdateTactics({ pressing: e.target.value as PressingIntensity })
              }
              className="w-full bg-white border border-[#969c91] rounded-xs px-1.5 py-1 text-[11px] font-medium text-[#181c18] focus:outline-none focus:border-[#1f5922] cursor-pointer"
            >
              {PRESSING.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-1">
            <label className="block space-y-0.5">
              <span className="text-[10px] font-semibold text-[#3c423c]">Pase</span>
              <select
                aria-label="Estilo de pase"
                value={homeTactics.passing}
                onChange={(e) =>
                  onUpdateTactics({ passing: e.target.value as PassingStyle })
                }
                className="w-full bg-white border border-[#969c91] rounded-xs px-1 py-0.5 text-[10.5px] font-medium text-[#181c18] focus:outline-none focus:border-[#1f5922] cursor-pointer"
              >
                {PASSING.map((ps) => (
                  <option key={ps.id} value={ps.id}>
                    {ps.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-0.5">
              <span className="text-[10px] font-semibold text-[#3c423c]">Ritmo</span>
              <select
                aria-label="Ritmo de juego"
                value={homeTactics.tempo}
                onChange={(e) =>
                  onUpdateTactics({ tempo: e.target.value as TempoLevel })
                }
                className="w-full bg-white border border-[#969c91] rounded-xs px-1 py-0.5 text-[10.5px] font-medium text-[#181c18] focus:outline-none focus:border-[#1f5922] cursor-pointer"
              >
                {TEMPOS.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between text-[10px] font-semibold text-[#3c423c]">
              <span>Gritos de banda</span>
              {homeShoutCooldown > 0 && (
                <span className="font-mono text-[#7c1d18]">{homeShoutCooldown}m</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {SHOUTS.map((s) => (
                <button
                  key={s.id}
                  disabled={homeShoutCooldown > 0 || isInstantSimulating}
                  onClick={() => onShout(s.id)}
                  className="px-1.5 py-0.5 rounded-xs bg-[#eef0ea] hover:bg-white border border-[#989e93] text-[10px] font-semibold text-[#232823] disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
