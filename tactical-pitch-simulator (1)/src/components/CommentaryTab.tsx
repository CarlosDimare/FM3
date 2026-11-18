import React, { useState } from 'react';
import { MatchEvent, MatchSnapshot } from '../types/match';

interface CommentaryTabProps {
  snapshot: MatchSnapshot;
}

export const CommentaryTab: React.FC<CommentaryTabProps> = ({ snapshot }) => {
  const [filter, setFilter] = useState<'all' | 'key' | 'tactics'>('all');

  const filtered = snapshot.events.filter((ev: MatchEvent) => {
    if (filter === 'key') {
      return [
        'goal',
        'save',
        'post',
        'rebound',
        'penalty',
        'yellow_card',
        'red_card',
        'injury',
        'halftime',
        'fulltime',
      ].includes(ev.type);
    }
    if (filter === 'tactics') {
      return ['substitution', 'tactical_change', 'shout', 'injury'].includes(ev.type);
    }
    return true;
  });

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-200">Crónica en Directo</div>
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
          {(
            [
              { id: 'all', label: 'Todo' },
              { id: 'key', label: 'Claves' },
              { id: 'tactics', label: 'Banquillo y Lesiones' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                filter === f.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[62dvh] overflow-y-auto tactical-scroll space-y-1.5 pr-1">
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            No hay eventos registrados en esta categoría todavía.
          </div>
        ) : (
          filtered.map((ev) => (
            <div
              key={ev.id}
              className="flex items-start gap-3 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800/80 text-xs"
            >
              <span className="font-mono font-semibold text-sky-400 tabular-nums shrink-0 w-10">
                {ev.minute}
                {ev.addedTime > 0 ? `+${ev.addedTime}` : ''}&apos;
              </span>
              <div className="min-w-0">
                <div
                  className={`font-semibold ${
                    ev.type === 'goal'
                      ? 'text-emerald-400'
                      : ev.type === 'red_card' || ev.type === 'injury'
                      ? 'text-rose-400'
                      : ev.type === 'yellow_card' || ev.type === 'rebound'
                      ? 'text-amber-400'
                      : ev.type === 'cross' || ev.type === 'dribble'
                      ? 'text-sky-300'
                      : 'text-slate-100'
                  }`}
                >
                  {ev.title}
                </div>
                <div className="text-slate-400 text-[11px] leading-relaxed">{ev.description}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
