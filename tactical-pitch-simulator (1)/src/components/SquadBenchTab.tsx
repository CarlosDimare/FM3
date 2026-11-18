import React, { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { MatchSnapshot, PlayerMatchState, TeamSide } from '../types/match';

interface SquadBenchTabProps {
  snapshot: MatchSnapshot;
  onSubstitute: (outId: string, inId: string) => void;
}

export const SquadBenchTab: React.FC<SquadBenchTabProps> = ({ snapshot, onSubstitute }) => {
  const [inspectSide, setInspectSide] = useState<TeamSide>('home');
  const [selectedOutId, setSelectedOutId] = useState<string | null>(null);

  const isHome = inspectSide === 'home';
  const club = isHome ? snapshot.homeClub : snapshot.awayClub;
  const players = isHome ? snapshot.homePlayers : snapshot.awayPlayers;
  const subsUsed = isHome ? snapshot.homeSubsUsed : snapshot.awaySubsUsed;
  const subsLeft = 5 - subsUsed;

  const starters = players.filter((p) => p.onPitch || p.redCard);
  const bench = players.filter((p) => !p.onPitch && !p.subbedOff && !p.redCard);

  const handleBenchClick = (benchPlayer: PlayerMatchState) => {
    if (!isHome || !selectedOutId || subsLeft <= 0) return;
    onSubstitute(selectedOutId, benchPlayer.id);
    setSelectedOutId(null);
  };

  return (
    <div className="space-y-3">
      {/* Header / Team Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => {
              setInspectSide('home');
              setSelectedOutId(null);
            }}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              isHome ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {snapshot.homeClub.name} (Local)
          </button>
          <button
            onClick={() => {
              setInspectSide('away');
              setSelectedOutId(null);
            }}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              !isHome ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {snapshot.awayClub.name} (Rival)
          </button>
        </div>

        <div className="text-xs text-slate-300 font-mono tabular-nums">
          Cambios disponibles:{' '}
          <span className={subsLeft > 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400'}>
            {subsLeft}/5
          </span>
          {isHome && subsLeft > 0 && (
            <span className="ml-2 font-sans text-slate-400">
              {selectedOutId
                ? 'Ahora elige un suplente del banquillo para completar el cambio.'
                : 'Pulsa "Sustituir" en un titular para realizar un cambio.'}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* On Pitch XI */}
        <div className="lg:col-span-8 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">Jugador</th>
                <th className="py-1.5 pr-2 font-medium">Rol</th>
                <th className="py-1.5 pr-2 font-medium">Físico</th>
                <th className="py-1.5 pr-2 font-medium text-right">Km</th>
                <th className="py-1.5 pr-2 font-medium text-right">Pases</th>
                <th className="py-1.5 pr-2 font-medium text-right">P.Prog</th>
                <th className="py-1.5 pr-2 font-medium text-right">Duelos</th>
                <th className="py-1.5 pr-2 font-medium text-right">G / A</th>
                <th className="py-1.5 pr-2 font-medium text-right">Nota</th>
                {isHome && <th className="py-1.5 pl-2 font-medium text-right">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {starters.map((p) => {
                const isSelectedOut = selectedOutId === p.id;
                const staminaColor =
                  p.stamina > 70 ? '#10b981' : p.stamina > 45 ? '#f59e0b' : '#ef4444';
                const totalDuelsWon = p.groundDuelsWon + p.aerialDuelsWon;
                const totalDuels =
                  totalDuelsWon + p.groundDuelsLost + p.aerialDuelsLost;

                return (
                  <tr
                    key={p.id}
                    className={`transition-colors ${
                      isSelectedOut ? 'bg-amber-950/35' : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <td className="py-1.5 pr-2 font-mono text-slate-400 tabular-nums">{p.number}</td>
                    <td className="py-1.5 pr-2 font-medium text-slate-100 whitespace-nowrap">
                      {p.shortName}
                      {p.yellowCards > 0 && !p.redCard && (
                        <span className="ml-1.5 inline-block w-2 h-3 bg-amber-400 rounded-[1px] align-middle" title="Amarilla" />
                      )}
                      {p.redCard && (
                        <span className="ml-1.5 inline-block w-2 h-3 bg-rose-500 rounded-[1px] align-middle" title="Expulsado" />
                      )}
                      {p.knockSeverity === 2 && (
                        <span className="ml-1.5 text-[10px] font-semibold text-rose-400">· Lesión</span>
                      )}
                      {p.knockSeverity === 1 && (
                        <span className="ml-1.5 text-[10px] font-medium text-amber-400">· Golpe</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-[11px] text-sky-400">{p.assignedRole}</td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.round(p.stamina)}%`,
                              backgroundColor: staminaColor,
                            }}
                          />
                        </div>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {Math.round(p.stamina)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-right text-slate-300 tabular-nums">
                      {(p.distanceMeters / 1000).toFixed(1)}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-right text-slate-300 tabular-nums">
                      {p.passesCompleted}/{p.passesAttempted}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-right text-slate-300 tabular-nums">
                      {p.progressivePasses}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-right text-slate-300 tabular-nums">
                      {totalDuelsWon}/{totalDuels}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-right text-slate-300 tabular-nums">
                      {p.goals} / {p.assists}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-right font-semibold tabular-nums">
                      <span
                        className={
                          p.rating >= 7.5
                            ? 'text-emerald-400'
                            : p.rating >= 6.8
                            ? 'text-sky-400'
                            : 'text-slate-300'
                        }
                      >
                        {p.rating.toFixed(1)}
                      </span>
                    </td>
                    {isHome && (
                      <td className="py-1.5 pl-2 text-right">
                        {!p.redCard && (
                          <button
                            disabled={subsLeft <= 0}
                            onClick={() => setSelectedOutId(isSelectedOut ? null : p.id)}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer disabled:opacity-35 ${
                              isSelectedOut
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                            }`}
                          >
                            {isSelectedOut ? 'Cancelar' : 'Sustituir'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bench */}
        <div className="lg:col-span-4 space-y-2">
          <div className="text-xs font-semibold text-slate-300">
            Banquillo ({club.shortCode})
          </div>
          <div className="space-y-1.5">
            {bench.map((b) => {
              const canSub = isHome && Boolean(selectedOutId) && subsLeft > 0;
              return (
                <button
                  key={b.id}
                  disabled={!canSub}
                  onClick={() => handleBenchClick(b)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors ${
                    canSub
                      ? 'bg-emerald-950/40 border-emerald-500/70 hover:bg-emerald-900/50 cursor-pointer'
                      : 'bg-slate-900/70 border-slate-800/90 opacity-85 cursor-default'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[11px] text-slate-400 w-5">#{b.number}</span>
                    <div className="truncate">
                      <div className="text-xs font-medium text-slate-100 truncate">{b.shortName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {b.naturalRole} · RIT {b.attributes.pace} · PAS {b.attributes.passing} · TIR {b.attributes.shooting}
                      </div>
                    </div>
                  </div>
                  {canSub && <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
