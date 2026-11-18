import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, RefreshCw, Terminal } from 'lucide-react';
import { MatchEngine } from '../engine/MatchEngine';

interface DebugLogTabProps {
  engine: MatchEngine;
  snapshotVersion: number;
}

export const DebugLogTab: React.FC<DebugLogTabProps> = ({ engine, snapshotVersion }) => {
  const [copied, setCopied] = useState(false);
  const [autoRefreshKey, setAutoRefreshKey] = useState(0);
  const [showAllPlayersNow, setShowAllPlayersNow] = useState(true);

  const logReport = useMemo(() => {
    void snapshotVersion;
    void autoRefreshKey;
    return engine.getTelemetryReport();
  }, [engine, snapshotVersion, autoRefreshKey]);

  const anomalies = engine.telemetryAnomalies;
  const b = engine.ball;
  const ballSpeed = Math.hypot(b.vx, b.vy, b.vz);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.getElementById('match-debug-log-textarea') as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <div className="space-y-3 text-xs text-slate-200">
      {/* Top Action & Live Ball State Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800/90">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums">
          <span className="text-sky-400 font-semibold">
            Balón ({b.x.toFixed(2)}, {b.y.toFixed(2)}, {b.z.toFixed(2)})
          </span>
          <span className="text-slate-300">
            Vel {ballSpeed.toFixed(1)} m/s ({b.vx.toFixed(1)}, {b.vy.toFixed(1)}, {b.vz.toFixed(1)})
          </span>
          <span className="text-slate-400">
            Estado: {b.setPiece} · Owner: {b.ownerId || 'libre'}
          </span>
          {anomalies > 0 && (
            <span className="flex items-center gap-1 text-rose-400 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              {anomalies} anomalías
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAllPlayersNow((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-[11px] font-medium text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
            <span>{showAllPlayersNow ? 'Ver Log Completo' : 'Ver Posiciones Actuales'}</span>
          </button>

          <button
            onClick={() => setAutoRefreshKey((k) => k + 1)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-[11px] font-medium text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
            <span>Actualizar</span>
          </button>

          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-sky-600 hover:bg-sky-500 text-white'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '¡Log Copiado!' : 'Copiar Log Completo'}</span>
          </button>
        </div>
      </div>

      {showAllPlayersNow ? (
        <div className="space-y-2">
          <div className="text-[11px] text-slate-400">
            Coordenadas instantáneas en vivo (todos los jugadores activos) + últimas tramas grabadas ({engine.telemetryFrames.length} frames):
          </div>
          <textarea
            id="match-debug-log-textarea"
            readOnly
            value={logReport}
            className="w-full h-56 rounded-lg bg-[#06090d] border border-slate-800 p-3 font-mono text-[10.5px] leading-relaxed text-slate-300 focus:outline-none focus:border-sky-500 resize-none tactical-scroll"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto tactical-scroll">
          {[
            { title: engine.homeClub.name, list: engine.homePlayers.filter((p) => p.onPitch) },
            { title: engine.awayClub.name, list: engine.awayPlayers.filter((p) => p.onPitch) },
          ].map((group) => (
            <div key={group.title} className="rounded-lg bg-slate-900/70 border border-slate-800 p-2">
              <div className="text-[11px] font-semibold text-white mb-1.5">{group.title}</div>
              <div className="space-y-1 font-mono text-[10px] tabular-nums">
                {group.list.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 text-slate-300 border-b border-slate-800/50 pb-0.5"
                  >
                    <span className="truncate">
                      #{p.number} {p.shortName} [{p.assignedRole}]
                    </span>
                    <span className="text-slate-400 shrink-0">
                      ({p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}) v={Math.hypot(p.vx, p.vz).toFixed(1)} · {p.intent}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
