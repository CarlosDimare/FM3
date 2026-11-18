import React from 'react';
import {
  BarChart3,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  RotateCcw,
  Terminal,
  Tv,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { ClubPreset, MatchSnapshot } from '../types/match';

export type FmView =
  | 'pitch'
  | 'stats_resumen'
  | 'stats_mapas'
  | 'stats_boxscore'
  | 'pizarra'
  | 'banquillo'
  | 'cronica'
  | 'log';

interface TopScoreboardProps {
  snapshot: MatchSnapshot;
  isPlaying: boolean;
  isInstantSimulating: boolean;
  onTogglePlay: () => void;
  onStartSecondHalf: () => void;
  onInstantResult: () => void;
  speedMultiplier: number;
  onChangeSpeed: (s: number) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeView: FmView;
  onSelectView: (v: FmView) => void;
  onOpenNewMatch: () => void;
}

const ClubShield: React.FC<{ club: ClubPreset }> = ({ club }) => (
  <svg
    viewBox="0 0 36 42"
    className="w-5 h-6 sm:w-8 sm:h-9 shrink-0 drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]"
    aria-hidden="true"
  >
    <path
      d="M4 3 L32 3 L32 21 C32 31 18 39 18 39 C18 39 4 31 4 21 Z"
      fill={club.colors.primary}
      stroke="#e2e8f0"
      strokeWidth="2.2"
    />
    <path
      d="M18 4.2 L30.8 4.2 L30.8 21 C30.8 29.8 18 37.4 18 37.4 Z"
      fill={club.colors.secondary}
      fillOpacity="0.88"
    />
    <path
      d="M4.8 4 L31.2 4 L31.2 15 C23 18 13 18 4.8 15 Z"
      fill="#ffffff"
      fillOpacity="0.18"
    />
  </svg>
);

export const TopScoreboard: React.FC<TopScoreboardProps> = ({
  snapshot,
  isPlaying,
  isInstantSimulating,
  onTogglePlay,
  onStartSecondHalf,
  onInstantResult,
  speedMultiplier,
  onChangeSpeed,
  soundEnabled,
  onToggleSound,
  sidebarOpen,
  onToggleSidebar,
  activeView,
  onSelectView,
  onOpenNewMatch,
}) => {
  const {
    phase,
    clockSeconds,
    addedTime,
    homeScore,
    awayScore,
    homeClub,
    awayClub,
    homeTactics,
  } = snapshot;

  const totalMin = Math.floor(clockSeconds / 60);
  const sec = Math.floor(clockSeconds % 60);
  const halfLimit = phase === 'second_half' || phase === 'full_time' ? 90 : 45;
  const baseMin = Math.min(halfLimit, totalMin);
  const extraMin = totalMin > halfLimit ? totalMin - halfLimit : 0;
  const formattedClock = `${String(totalMin).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

  const phaseLabel =
    phase === 'first_half'
      ? '1ª Parte'
      : phase === 'half_time'
      ? 'Descanso'
      : phase === 'second_half'
      ? '2ª Parte'
      : phase === 'full_time'
      ? 'Final'
      : 'Previa';

  return (
    <header className="w-full shrink-0 select-none z-20">
      {/* Top Broadcast Banner (FM08 Club Gradient + Central Dot-Matrix LED Scoreboard) */}
      <div
        className="relative h-10 sm:h-14 w-full flex items-stretch border-b border-[#14171a] overflow-hidden"
        style={{
          background: `linear-gradient(90deg, ${homeClub.colors.primary} 0%, ${homeClub.colors.primary}dd 26%, #23272c 43%, #191c20 57%, ${awayClub.colors.primary}dd 74%, ${awayClub.colors.primary} 100%)`,
        }}
      >
        {/* Subtle FM08 top gloss highlight */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-4 sm:h-5"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
          }}
        />

        {/* Home Team Left Side */}
        <div className="flex-1 min-w-0 flex items-center justify-between px-2 sm:px-5 gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <ClubShield club={homeClub} />
            <span className="hidden md:inline text-[11px] font-semibold uppercase tracking-wider text-white/80">
              {homeClub.shortCode}
            </span>
          </div>
          <span
            className="sm:hidden text-xs font-bold tracking-tight text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
            title={homeClub.name}
          >
            {homeClub.shortCode}
          </span>
          <span
            className="hidden sm:inline text-base md:text-xl font-bold tracking-tight text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
            title={homeClub.name}
          >
            {homeClub.name}
          </span>
        </div>

        {/* Center FM08 Dot-Matrix LED Scoreboard */}
        <div
          className="w-[138px] min-[400px]:w-[164px] sm:w-[270px] shrink-0 flex items-center justify-between px-2.5 sm:px-5 border-x border-[#0b0d0f] shadow-[inset_0_2px_8px_rgba(0,0,0,0.9)]"
          style={{
            backgroundColor: '#14171a',
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 0)',
            backgroundSize: '4px 4px',
          }}
        >
          <span className="font-mono text-lg sm:text-[28px] font-bold text-[#facc15] tabular-nums leading-none drop-shadow-[0_0_6px_rgba(250,204,21,0.35)]">
            {homeScore}
          </span>

          <div className="flex flex-col items-center justify-center leading-tight">
            <span className="font-mono text-xs sm:text-lg font-semibold text-[#e5e7eb] tabular-nums tracking-wider">
              {formattedClock}
            </span>
            <span className="font-mono text-[8.5px] sm:text-[10px] font-medium text-[#9ca3af] tabular-nums uppercase">
              {isInstantSimulating
                ? `Sim ${totalMin}'`
                : extraMin > 0
                ? `${phaseLabel} +${extraMin}`
                : baseMin >= halfLimit - 2 && (phase === 'first_half' || phase === 'second_half')
                ? `${phaseLabel} (+${addedTime})`
                : phaseLabel}
            </span>
          </div>

          <span className="font-mono text-lg sm:text-[28px] font-bold text-[#facc15] tabular-nums leading-none drop-shadow-[0_0_6px_rgba(250,204,21,0.35)]">
            {awayScore}
          </span>
        </div>

        {/* Away Team Right Side */}
        <div className="flex-1 min-w-0 flex items-center justify-between px-2 sm:px-5 gap-1.5 sm:gap-2">
          <span
            className="sm:hidden text-xs font-bold tracking-tight text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
            title={awayClub.name}
          >
            {awayClub.shortCode}
          </span>
          <span
            className="hidden sm:inline text-base md:text-xl font-bold tracking-tight text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
            title={awayClub.name}
          >
            {awayClub.name}
          </span>
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <span className="hidden md:inline text-[11px] font-semibold uppercase tracking-wider text-white/80">
              {awayClub.shortCode}
            </span>
            <ClubShield club={awayClub} />
          </div>
        </div>
      </div>

      {/* Brushed-Silver FM08 Sub-Header Toolbar Ribbon */}
      <div className="h-9 sm:h-10 w-full bg-[#3a3f45] border-b border-[#1c1f24] flex items-center justify-between px-1.5 sm:px-2 gap-1.5 sm:gap-2">
        {/* Left Dark Manager / Club Context Block (matches FM08 top-left strip) */}
        <div className="hidden lg:flex items-center gap-2 min-w-[176px] max-w-[205px] px-2.5 py-1 rounded-sm bg-[#1b1f23] border border-[#0f1215] text-[10.5px] leading-tight shrink-0">
          <button
            onClick={onToggleSidebar}
            className="p-0.5 text-slate-300 hover:text-white cursor-pointer shrink-0"
            title={sidebarOpen ? 'Ocultar barra lateral' : 'Mostrar barra lateral'}
            aria-label={sidebarOpen ? 'Ocultar barra lateral' : 'Mostrar barra lateral'}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-3.5 h-3.5" />
            ) : (
              <PanelLeftOpen className="w-3.5 h-3.5" />
            )}
          </button>
          <div className="min-w-0">
            <div className="font-semibold text-slate-100 truncate">
              {homeClub.name} ({homeTactics.formation})
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {homeClub.shortCode} vs {awayClub.shortCode} · {phaseLabel}
            </div>
          </div>
        </div>

        {/* Center Brushed-Silver Metallic Capsule Toolbar */}
        <div
          className="flex-1 max-w-[920px] mx-auto h-7 px-1.5 sm:px-2.5 rounded-full border border-[#737a82] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1px_2px_rgba(0,0,0,0.4)] flex items-center justify-between gap-1 overflow-x-auto no-scrollbar"
          style={{
            background:
              'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 48%, #b9bfc6 100%)',
          }}
        >
          {/* Left Playback + Speed Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggleSidebar}
              className="lg:hidden flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold text-[#1f2428] hover:bg-black/10 cursor-pointer shrink-0"
              aria-label="Alternar menú lateral"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="w-3.5 h-3.5" />
              ) : (
                <PanelLeftOpen className="w-3.5 h-3.5" />
              )}
            </button>

            {phase === 'half_time' ? (
              <button
                onClick={onStartSecondHalf}
                disabled={isInstantSimulating}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded bg-[#2d6328] hover:bg-[#234f1f] text-white text-[10.5px] sm:text-[11px] font-semibold shadow-sm whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>2ª Parte</span>
              </button>
            ) : phase === 'full_time' ? (
              <button
                onClick={onOpenNewMatch}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded bg-[#1d4e89] hover:bg-[#173f70] text-white text-[10.5px] sm:text-[11px] font-semibold shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Revancha</span>
              </button>
            ) : (
              <button
                onClick={onTogglePlay}
                disabled={isInstantSimulating}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded text-[10.5px] sm:text-[11px] font-semibold border whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                  isPlaying
                    ? 'bg-[#e7e9ec] border-[#7a828a] text-[#1f2428] hover:bg-white'
                    : 'bg-[#2d6328] border-[#1f471b] text-white hover:bg-[#234f1f]'
                }`}
                title="Pausar / Reanudar (Espacio)"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3 h-3 fill-current" />
                    <span className="hidden min-[380px]:inline">Pausa</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" />
                    <span className="hidden min-[380px]:inline">Jugar</span>
                  </>
                )}
              </button>
            )}

            <div className="h-4 w-px bg-[#8f969e] mx-0.5" />

            {/* Speed Selector */}
            <div className="flex items-center gap-0.5">
              {[1, 2, 4, 8].map((spd) => (
                <button
                  key={spd}
                  disabled={isInstantSimulating}
                  onClick={() => onChangeSpeed(spd)}
                  className={`px-1 sm:px-1.5 py-0.5 rounded text-[10px] sm:text-[10.5px] font-mono font-bold tabular-nums transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 ${
                    speedMultiplier === spd && !isInstantSimulating
                      ? 'bg-[#2b5d2c] text-white shadow-inner'
                      : 'text-[#282d33] hover:bg-black/10'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-[#8f969e] mx-0.5" />

            {/* Instant Result Button (FM Fast Sim with 1x-grade telemetry) */}
            <button
              onClick={onInstantResult}
              disabled={phase === 'full_time' || isInstantSimulating}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded text-[10.5px] sm:text-[11px] font-bold border shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isInstantSimulating
                  ? 'bg-[#9a3412] border-[#7c2d12] text-amber-100'
                  : 'bg-[#1f5922] hover:bg-[#174619] border-[#133815] text-white'
              }`}
              title="Simula el resto del partido en ~1-3s manteniendo la misma precisión física y calidad de logs que en 1x"
            >
              <Zap className="w-3 h-3 fill-current text-amber-300" />
              <span className="min-[480px]:hidden">
                {isInstantSimulating ? `${totalMin}'...` : 'Instantáneo'}
              </span>
              <span className="hidden min-[480px]:inline">
                {isInstantSimulating
                  ? `Simulando ${totalMin}'...`
                  : 'Resultado Instantáneo'}
              </span>
            </button>
          </div>

          {/* Right Quick View Shortcuts & Utilities */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onSelectView('pitch')}
              className={`hidden md:flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                activeView === 'pitch'
                  ? 'bg-[#2b5d2c] text-white'
                  : 'text-[#22272c] hover:bg-black/10'
              }`}
            >
              <Tv className="w-3 h-3" />
              <span>Campo</span>
            </button>
            <button
              onClick={() => onSelectView('stats_resumen')}
              className={`hidden md:flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                activeView.startsWith('stats_')
                  ? 'bg-[#2b5d2c] text-white'
                  : 'text-[#22272c] hover:bg-black/10'
              }`}
            >
              <BarChart3 className="w-3 h-3" />
              <span>Stats</span>
            </button>
            <button
              onClick={() => onSelectView('pizarra')}
              className={`hidden lg:flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                activeView === 'pizarra'
                  ? 'bg-[#2b5d2c] text-white'
                  : 'text-[#22272c] hover:bg-black/10'
              }`}
            >
              <ClipboardList className="w-3 h-3" />
              <span>Táctica</span>
            </button>
            <button
              onClick={() => onSelectView('log')}
              className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                activeView === 'log'
                  ? 'bg-[#2b5d2c] text-white'
                  : 'text-[#22272c] hover:bg-black/10'
              }`}
            >
              <Terminal className="w-3 h-3" />
              <span>Log</span>
            </button>

            <div className="hidden min-[380px]:block h-4 w-px bg-[#8f969e] mx-0.5" />

            <button
              onClick={onToggleSound}
              className={`p-1 rounded transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-[#2b5d2c] text-white'
                  : 'text-[#262b30] hover:bg-black/10'
              }`}
              title={soundEnabled ? 'Silenciar sonido ambiente' : 'Activar sonido del estadio'}
              aria-label="Sonido del estadio"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={onOpenNewMatch}
              disabled={isInstantSimulating}
              className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded bg-[#e8eaed] hover:bg-white border border-[#7a828a] text-[11px] font-semibold text-[#1f2428] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              title="Configurar nuevo partido"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Nuevo Partido</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
