import React, { useState } from 'react';
import { ArrowLeftRight, Layers } from 'lucide-react';
import { FORMATION_LIST, FORMATIONS, ROLE_LABELS } from '../engine/formations';
import {
  DefensiveLineLevel,
  FormationId,
  MatchSnapshot,
  PlayerInstruction,
  TeamTactics,
  VisualLayers,
  WidthLevel,
} from '../types/match';

interface TacticalBoardTabProps {
  snapshot: MatchSnapshot;
  onUpdateTactics: (partial: Partial<TeamTactics>) => void;
  onUpdateInstruction: (playerId: string, instruction: PlayerInstruction) => void;
  onSwapSlots: (aId: string, bId: string) => void;
  visualLayers: VisualLayers;
  onToggleLayer: (key: keyof VisualLayers) => void;
}

const INSTRUCTION_OPTIONS: { id: PlayerInstruction; label: string }[] = [
  { id: 'equilibrado', label: 'Equilibrado' },
  { id: 'subir_mas', label: 'Subir al ataque' },
  { id: 'mantener_posicion', label: 'Mantener posición' },
  { id: 'entrar_al_area', label: 'Llegar al área' },
  { id: 'libertad_creativa', label: 'Libertad creativa' },
  { id: 'marcaje_ferreo', label: 'Marcaje férreo' },
];

export const TacticalBoardTab: React.FC<TacticalBoardTabProps> = ({
  snapshot,
  onUpdateTactics,
  onUpdateInstruction,
  onSwapSlots,
  visualLayers,
  onToggleLayer,
}) => {
  const { homeTactics, homePlayers, homeClub } = snapshot;
  const starters = homePlayers.filter((p) => p.onPitch && !p.redCard);
  const slots = FORMATIONS[homeTactics.formation];

  const [focusedId, setFocusedId] = useState<string | null>(starters[9]?.id || starters[0]?.id || null);
  const [swapMode, setSwapMode] = useState(false);

  const focusedPlayer = starters.find((p) => p.id === focusedId) || starters[0];

  const handlePlayerClick = (id: string) => {
    if (swapMode && focusedId && focusedId !== id) {
      onSwapSlots(focusedId, id);
      setSwapMode(false);
      setFocusedId(id);
    } else {
      setFocusedId(id);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Left: Interactive 2D Formation Pitch */}
      <div className="lg:col-span-5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-200">
            Pizarra Táctica · {homeClub.shortCode} ({homeTactics.formation})
          </div>
          <button
            onClick={() => setSwapMode((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              swapMode
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span>{swapMode ? 'Elige compañero para permutar' : 'Permutar puestos'}</span>
          </button>
        </div>

        {/* 2D Pitch Diagram (Horizontal: defending left, attacking right) */}
        <div className="relative w-full aspect-[105/68] rounded-xl border border-emerald-700/50 bg-[#184f29] overflow-hidden">
          {/* Pitch SVG lines */}
          <svg viewBox="0 0 105 68" className="absolute inset-0 w-full h-full pointer-events-none">
            <rect x="2" y="2" width="101" height="64" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="0.45" />
            <line x1="52.5" y1="2" x2="52.5" y2="66" stroke="rgba(255,255,255,0.38)" strokeWidth="0.45" />
            <circle cx="52.5" cy="34" r="9.15" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="0.45" />
            <rect x="2" y="13.84" width="16.5" height="40.32" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="0.45" />
            <rect x="86.5" y="13.84" width="16.5" height="40.32" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="0.45" />
          </svg>

          {/* Starters positioned by formation slot */}
          {starters.map((p) => {
            const slot = slots[Math.min(10, p.slotIndex)];
            const leftPct = 4 + slot.xNorm * 88;
            const topPct = 50 + slot.zNorm * 86;
            const isSelected = p.id === focusedPlayer?.id;
            const isGK = p.assignedRole === 'POR';

            return (
              <button
                key={p.id}
                onClick={() => handlePlayerClick(p.id)}
                style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer focus:outline-none"
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-[11px] font-bold border-2 transition-transform group-hover:scale-110 ${
                    isSelected ? 'ring-2 ring-amber-400 scale-110' : ''
                  }`}
                  style={{
                    backgroundColor: isGK ? homeClub.colors.gkPrimary : homeClub.colors.primary,
                    borderColor: isSelected ? '#fbbf24' : '#f8fafc',
                    color: '#ffffff',
                  }}
                >
                  {p.number}
                </div>
                <span className="mt-0.5 px-1 rounded bg-[#090d12]/85 text-[10px] font-medium text-slate-100 whitespace-nowrap leading-tight">
                  {p.shortName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Team Structural Controls + Focused Player Instruction + 3D Layers */}
      <div className="lg:col-span-7 flex flex-col justify-between gap-3.5">
        {/* Formation & Team Structure */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Formation Picker */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-slate-400">Dibujo Táctico</div>
            <div className="grid grid-cols-3 gap-1">
              {FORMATION_LIST.map((f: FormationId) => (
                <button
                  key={f}
                  onClick={() => onUpdateTactics({ formation: f })}
                  className={`py-1.5 px-2 rounded-md font-mono text-xs font-semibold border transition-colors cursor-pointer ${
                    homeTactics.formation === f
                      ? 'bg-sky-600 border-sky-400 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 pt-1">
              <button
                onClick={() =>
                  onUpdateTactics({ playOutFromBack: !homeTactics.playOutFromBack })
                }
                className={`py-1 px-2 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  homeTactics.playOutFromBack
                    ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Salir Jugando
              </button>
              <button
                onClick={() =>
                  onUpdateTactics({ counterAttack: !homeTactics.counterAttack })
                }
                className={`py-1 px-2 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  homeTactics.counterAttack
                    ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Contraataque
              </button>
            </div>
          </div>

          {/* Width & Defensive Line */}
          <div className="space-y-2">
            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-1">Amplitud en Ataque</div>
              <div className="grid grid-cols-3 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                {(
                  [
                    { id: 'estrecho', label: 'Estrecho' },
                    { id: 'equilibrado', label: 'Equilibrado' },
                    { id: 'amplio', label: 'Amplio' },
                  ] as { id: WidthLevel; label: string }[]
                ).map((w) => (
                  <button
                    key={w.id}
                    onClick={() => onUpdateTactics({ width: w.id })}
                    className={`py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                      homeTactics.width === w.id
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-1">Línea Defensiva</div>
              <div className="grid grid-cols-4 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                {(
                  [
                    { id: 'muy_atras', label: 'Atrás' },
                    { id: 'normal', label: 'Media' },
                    { id: 'adelantada', label: 'Alta' },
                    { id: 'fuera_de_juego', label: 'Trampa OJ' },
                  ] as { id: DefensiveLineLevel; label: string }[]
                ).map((dl) => (
                  <button
                    key={dl.id}
                    onClick={() => onUpdateTactics({ defensiveLine: dl.id })}
                    className={`py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      homeTactics.defensiveLine === dl.id
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {dl.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Focused Player Individual Instruction */}
        {focusedPlayer && (
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-amber-400">
                  #{focusedPlayer.number}
                </span>
                <span className="text-sm font-semibold text-white">{focusedPlayer.name}</span>
                <span className="text-xs text-slate-400">
                  · {ROLE_LABELS[focusedPlayer.assignedRole]}
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                <span className="text-slate-400 text-[11px]">
                  VEL {focusedPlayer.attributes.pace} · PAS {focusedPlayer.attributes.passing} · REG{' '}
                  {focusedPlayer.attributes.dribbling} · VIS {focusedPlayer.attributes.vision}
                </span>
                <span className="text-slate-300">
                  Energía {Math.round(focusedPlayer.stamina)}%
                </span>
                <span className="text-emerald-400 font-semibold">
                  Nota {focusedPlayer.rating.toFixed(1)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {INSTRUCTION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onUpdateInstruction(focusedPlayer.id, opt.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                    focusedPlayer.instruction === opt.id
                      ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2D Pitch Tactical Visual Overlays */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>Capas Tácticas 2D:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: 'offsideLine', label: 'Línea Fuera de Juego' },
                { key: 'passNetwork', label: 'Red de Pases' },
                { key: 'tacticalZones', label: 'Zonas y Carriles' },
                { key: 'playerNames', label: 'Nombres de Fichas' },
              ] as { key: keyof VisualLayers; label: string }[]
            ).map((layer) => (
              <button
                key={layer.key}
                onClick={() => onToggleLayer(layer.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  visualLayers[layer.key]
                    ? 'bg-sky-600/25 border-sky-500 text-sky-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {layer.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
