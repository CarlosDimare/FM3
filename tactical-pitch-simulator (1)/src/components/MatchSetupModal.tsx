import React, { useState } from 'react';
import { Moon, Play, Sun, X } from 'lucide-react';
import { CLUB_PRESETS } from '../data/teams';
import { ClubPreset, LightingMood } from '../types/match';

interface MatchSetupModalProps {
  currentHome: ClubPreset;
  currentAway: ClubPreset;
  currentMood: LightingMood;
  onStartMatch: (home: ClubPreset, away: ClubPreset, mood: LightingMood) => void;
  onClose: () => void;
}

export const MatchSetupModal: React.FC<MatchSetupModalProps> = ({
  currentHome,
  currentAway,
  currentMood,
  onStartMatch,
  onClose,
}) => {
  const [homeId, setHomeId] = useState(currentHome.id);
  const [awayId, setAwayId] = useState(currentAway.id);
  const [mood, setMood] = useState<LightingMood>(currentMood);

  const homeClub = CLUB_PRESETS.find((c) => c.id === homeId) || CLUB_PRESETS[0];
  const awayClub = CLUB_PRESETS.find((c) => c.id === awayId) || CLUB_PRESETS[1];
  const sameTeam = homeId === awayId;

  const getClubOvr = (club: ClubPreset) => {
    const starters = club.squad.slice(0, 11);
    const total = starters.reduce((acc, pl) => {
      const a = pl.attributes;
      const rating =
        pl.naturalRole === 'POR'
          ? a.gk * 0.65 + a.physical * 0.15 + a.passing * 0.1 + a.vision * 0.1
          : (a.pace + a.passing + a.shooting + a.dribbling + a.defending + a.physical + a.vision) / 7;
      return acc + rating;
    }, 0);
    return Math.round(total / Math.max(1, starters.length));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2.5 sm:p-4">
      <div className="w-full max-w-2xl max-h-[92dvh] flex flex-col rounded-2xl bg-[#0d1219] border border-slate-700/90 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white">Configurar Nuevo Partido</h2>
            <p className="text-xs text-slate-400">
              Elige los equipos y las condiciones del estadio para simular el encuentro.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto tactical-scroll min-h-0 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Home Club Picker */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-sky-400">Tu Equipo (Local)</div>
              <div className="space-y-2">
                {CLUB_PRESETS.map((club) => {
                  const selected = club.id === homeId;
                  const ovr = getClubOvr(club);
                  return (
                    <button
                      key={club.id}
                      onClick={() => setHomeId(club.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-slate-800/90 border-sky-500 text-white'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-3.5 h-6 rounded-sm shrink-0"
                          style={{ backgroundColor: club.colors.primary }}
                        />
                        <div className="truncate">
                          <div className="text-sm font-semibold truncate">{club.name}</div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {club.city} · {club.defaultTactics.formation}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pl-2">
                        <span
                          className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            ovr >= 75
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                              : ovr >= 58
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-700/50'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-700/50'
                          }`}
                        >
                          {ovr}
                        </span>
                        <span className="font-mono text-xs text-slate-400">{club.shortCode}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Away Club Picker */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-amber-400">Equipo Rival (Visitante)</div>
              <div className="space-y-2">
                {CLUB_PRESETS.map((club) => {
                  const selected = club.id === awayId;
                  const ovr = getClubOvr(club);
                  return (
                    <button
                      key={club.id}
                      onClick={() => setAwayId(club.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-slate-800/90 border-amber-500 text-white'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-3.5 h-6 rounded-sm shrink-0"
                          style={{ backgroundColor: club.colors.primary }}
                        />
                        <div className="truncate">
                          <div className="text-sm font-semibold truncate">{club.name}</div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {club.city} · {club.defaultTactics.formation}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pl-2">
                        <span
                          className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            ovr >= 75
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                              : ovr >= 58
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-700/50'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-700/50'
                          }`}
                        >
                          {ovr}
                        </span>
                        <span className="font-mono text-xs text-slate-400">{club.shortCode}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Lighting / Time of day */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800">
            <div>
              <div className="text-xs font-semibold text-slate-200">Estilo del Césped 2D</div>
              <div className="text-[11px] text-slate-400">{homeClub.stadiumName}</div>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setMood('night')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  mood === 'night' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Nocturno (Focos)</span>
              </button>
              <button
                onClick={() => setMood('dusk')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  mood === 'dusk' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Clásico FM (Día)</span>
              </button>
            </div>
          </div>

          {sameTeam && (
            <div className="text-xs text-amber-400 bg-amber-950/50 border border-amber-500/40 rounded-lg px-3 py-2">
              Selecciona dos clubes distintos para iniciar el encuentro.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-slate-900/70 border-t border-slate-800 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            disabled={sameTeam}
            onClick={() => onStartMatch(homeClub, awayClub, mood)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Comenzar Partido</span>
          </button>
        </div>
      </div>
    </div>
  );
};
