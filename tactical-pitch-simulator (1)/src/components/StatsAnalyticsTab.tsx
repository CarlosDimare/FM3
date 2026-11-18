import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import {
  HEATMAP_COLS,
  HEATMAP_ROWS,
  MatchSnapshot,
  PlayerMatchState,
  ShotRecord,
  TeamSide,
} from '../types/match';

export type AnalyticsSubTab = 'resumen' | 'mapas' | 'boxscore';

interface StatsAnalyticsTabProps {
  snapshot: MatchSnapshot;
  selectedPlayerId?: string | null;
  onSelectPlayer?: (id: string | null) => void;
  requestedSubTab?: AnalyticsSubTab;
}

type StatCategory = 'general' | 'ataque' | 'creacion' | 'defensa' | 'fisico';
type TeamFilter = 'all' | TeamSide;
type SortKey =
  | 'rating'
  | 'minutes'
  | 'goals'
  | 'assists'
  | 'xg'
  | 'xa'
  | 'shots'
  | 'passes'
  | 'keyPasses'
  | 'progPasses'
  | 'progCarries'
  | 'dribbles'
  | 'groundDuels'
  | 'aerialDuels'
  | 'tackles'
  | 'clearances'
  | 'distance'
  | 'sprints'
  | 'stamina'
  | 'gkPrevented';

const StatBarRow: React.FC<{
  label: string;
  homeVal: string | number;
  awayVal: string | number;
  homeNum: number;
  awayNum: number;
  homeColor: string;
  awayColor: string;
  invertPreference?: boolean;
}> = ({
  label,
  homeVal,
  awayVal,
  homeNum,
  awayNum,
  homeColor,
  awayColor,
}) => {
  const total = homeNum + awayNum;
  const homePct = total > 0 ? (homeNum / total) * 100 : 50;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-mono tabular-nums">
        <span className="font-semibold text-slate-100">{homeVal}</span>
        <span className="font-sans text-[11px] text-slate-400">{label}</span>
        <span className="font-semibold text-slate-100">{awayVal}</span>
      </div>
      <div className="h-1.5 w-full rounded-sm bg-slate-800/90 overflow-hidden flex">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${homePct}%`, backgroundColor: homeColor }}
        />
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${100 - homePct}%`, backgroundColor: awayColor }}
        />
      </div>
    </div>
  );
};

const PitchMarkingsSvg: React.FC = () => (
  <g stroke="rgba(255,255,255,0.24)" strokeWidth="0.45" fill="none">
    <rect x="-52.5" y="-34" width="105" height="68" />
    <line x1="0" y1="-34" x2="0" y2="34" />
    <circle cx="0" cy="0" r="9.15" />
    <circle cx="0" cy="0" r="0.5" fill="rgba(255,255,255,0.35)" />
    <rect x="-52.5" y="-20.16" width="16.5" height="40.32" />
    <rect x="-52.5" y="-9.16" width="5.5" height="18.32" />
    <rect x="36" y="-20.16" width="16.5" height="40.32" />
    <rect x="47" y="-9.16" width="5.5" height="18.32" />
  </g>
);

const HeatmapGridSvg: React.FC<{
  heatmap: number[];
  color: string;
  label?: string;
}> = ({ heatmap, color, label }) => {
  const maxVal = Math.max(1, ...heatmap);
  const totalTouches = heatmap.reduce((acc, v) => acc + v, 0);
  const cellW = 105 / HEATMAP_COLS;
  const cellH = 68 / HEATMAP_ROWS;

  if (totalTouches === 0) {
    return (
      <div className="relative w-full aspect-[105/68] rounded-lg bg-[#0d1f16] border border-slate-800 flex items-center justify-center text-center px-4">
        <span className="text-xs text-slate-400">
          Sin registros espaciales todavía. Los toques de balón poblarán el mapa de calor 12×8.
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[105/68] rounded-lg bg-[#0e2619] border border-slate-800 overflow-hidden">
      <svg viewBox="-52.5 -34 105 68" className="w-full h-full">
        {heatmap.map((val, idx) => {
          if (val <= 0) return null;
          const col = idx % HEATMAP_COLS;
          const row = Math.floor(idx / HEATMAP_COLS);
          const intensity = Math.min(1, val / maxVal);
          const x = -52.5 + col * cellW;
          const y = -34 + row * cellH;
          const fillColor =
            intensity > 0.72 ? '#ef4444' : intensity > 0.42 ? '#f59e0b' : color;
          return (
            <rect
              key={idx}
              x={x}
              y={y}
              width={cellW + 0.15}
              height={cellH + 0.15}
              fill={fillColor}
              fillOpacity={0.14 + intensity * 0.66}
            />
          );
        })}
        <PitchMarkingsSvg />
      </svg>
      {label && (
        <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[10px] text-slate-300 pointer-events-none">
          <span>Propia portería</span>
          <span>{label}</span>
          <span>Ataque →</span>
        </div>
      )}
    </div>
  );
};

export const StatsAnalyticsTab: React.FC<StatsAnalyticsTabProps> = ({
  snapshot,
  selectedPlayerId,
  onSelectPlayer,
  requestedSubTab,
}) => {
  const { homeStats, awayStats, homeClub, awayClub, shots, xgTimeline, passLinks } = snapshot;

  const [subTab, setSubTab] = useState<AnalyticsSubTab>(requestedSubTab || 'resumen');

  useEffect(() => {
    if (requestedSubTab) {
      setSubTab(requestedSubTab);
    }
  }, [requestedSubTab]);
  const [mapSide, setMapSide] = useState<TeamSide>('home');
  const [shotFilter, setShotFilter] = useState<TeamFilter>('all');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all');
  const [statCat, setStatCat] = useState<StatCategory>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rating');
  const [sortDesc, setSortDesc] = useState(true);
  const [localInspectedId, setLocalInspectedId] = useState<string | null>(null);

  const activeInspectedId = selectedPlayerId ?? localInspectedId;
  const setInspectedId = (id: string | null) => {
    setLocalInspectedId(id);
    onSelectPlayer?.(id);
  };

  const homePassAcc =
    homeStats.passesAttempted > 0
      ? Math.round((homeStats.passesCompleted / homeStats.passesAttempted) * 100)
      : 0;
  const awayPassAcc =
    awayStats.passesAttempted > 0
      ? Math.round((awayStats.passesCompleted / awayStats.passesAttempted) * 100)
      : 0;

  const homeDribAcc =
    homeStats.dribblesAttempted > 0
      ? Math.round((homeStats.dribblesCompleted / homeStats.dribblesAttempted) * 100)
      : 0;
  const awayDribAcc =
    awayStats.dribblesAttempted > 0
      ? Math.round((awayStats.dribblesCompleted / awayStats.dribblesAttempted) * 100)
      : 0;

  const homeGroundTotal = homeStats.groundDuelsWon + homeStats.groundDuelsLost;
  const homeGroundPct =
    homeGroundTotal > 0 ? Math.round((homeStats.groundDuelsWon / homeGroundTotal) * 100) : 0;
  const awayGroundTotal = awayStats.groundDuelsWon + awayStats.groundDuelsLost;
  const awayGroundPct =
    awayGroundTotal > 0 ? Math.round((awayStats.groundDuelsWon / awayGroundTotal) * 100) : 0;

  const homeAerialTotal = homeStats.aerialDuelsWon + homeStats.aerialDuelsLost;
  const homeAerialPct =
    homeAerialTotal > 0 ? Math.round((homeStats.aerialDuelsWon / homeAerialTotal) * 100) : 0;
  const awayAerialTotal = awayStats.aerialDuelsWon + awayStats.aerialDuelsLost;
  const awayAerialPct =
    awayAerialTotal > 0 ? Math.round((awayStats.aerialDuelsWon / awayAerialTotal) * 100) : 0;

  const maxXg = Math.max(1.2, ...xgTimeline.map((pt) => Math.max(pt.homeXg, pt.awayXg)));
  const maxMin = Math.max(90, xgTimeline[xgTimeline.length - 1]?.minute || 90);

  const buildXgPath = (side: 'home' | 'away') => {
    if (xgTimeline.length === 0) return 'M 0 100 L 300 100';
    return xgTimeline
      .map((pt, idx) => {
        const x = (pt.minute / maxMin) * 300;
        const val = side === 'home' ? pt.homeXg : pt.awayXg;
        const y = 100 - (val / maxXg) * 90;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const toPctTriple = (arr: [number, number, number]): [number, number, number] => {
    const sum = arr[0] + arr[1] + arr[2] || 1;
    const p0 = Math.round((arr[0] / sum) * 100);
    const p1 = Math.round((arr[1] / sum) * 100);
    return [p0, p1, Math.max(0, 100 - p0 - p1)];
  };

  const homeThirdsPct = toPctTriple(homeStats.territorialThirds);
  const awayThirdsPct = toPctTriple(awayStats.territorialThirds);
  const homeChannelsPct = toPctTriple(homeStats.attackChannels);
  const awayChannelsPct = toPctTriple(awayStats.attackChannels);

  const filteredShots = useMemo(
    () => (shotFilter === 'all' ? shots : shots.filter((s) => s.side === shotFilter)),
    [shots, shotFilter]
  );

  // Pass Network nodes & edges for selected side
  const networkPlayers = useMemo(() => {
    const list = mapSide === 'home' ? snapshot.homePlayers : snapshot.awayPlayers;
    return list.filter((p) => (p.onPitch || p.minutesPlayed > 1) && p.touches > 0);
  }, [mapSide, snapshot.homePlayers, snapshot.awayPlayers]);

  const networkEdges = useMemo(() => {
    const validIds = new Set(networkPlayers.map((p) => p.id));
    return passLinks.filter(
      (l) => l.side === mapSide && l.count >= 1 && validIds.has(l.fromId) && validIds.has(l.toId)
    );
  }, [passLinks, mapSide, networkPlayers]);

  const maxEdgeCount = Math.max(1, ...networkEdges.map((e) => e.count));

  // Individual Box Score dataset
  const allBoxPlayers = useMemo(() => {
    const merged = [...snapshot.homePlayers, ...snapshot.awayPlayers].filter(
      (p) => p.onPitch || p.minutesPlayed > 0.05 || p.subbedOff
    );
    const byTeam =
      teamFilter === 'all' ? merged : merged.filter((p) => p.side === teamFilter);
    const q = searchQuery.trim().toLowerCase();
    const bySearch = q
      ? byTeam.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.shortName.toLowerCase().includes(q) ||
            String(p.number).includes(q) ||
            p.assignedRole.toLowerCase().includes(q)
        )
      : byTeam;

    const getSortVal = (p: PlayerMatchState, key: SortKey): number => {
      switch (key) {
        case 'rating':
          return p.rating;
        case 'minutes':
          return p.minutesPlayed;
        case 'goals':
          return p.goals;
        case 'assists':
          return p.assists;
        case 'xg':
          return p.xgGenerated;
        case 'xa':
          return p.xa;
        case 'shots':
          return p.shots;
        case 'passes':
          return p.passesCompleted;
        case 'keyPasses':
          return p.keyPasses;
        case 'progPasses':
          return p.progressivePasses;
        case 'progCarries':
          return p.progressiveCarries;
        case 'dribbles':
          return p.dribblesCompleted;
        case 'groundDuels':
          return p.groundDuelsWon;
        case 'aerialDuels':
          return p.aerialDuelsWon;
        case 'tackles':
          return p.tacklesWon + p.interceptions;
        case 'clearances':
          return p.clearances;
        case 'distance':
          return p.distanceMeters;
        case 'sprints':
          return p.sprints;
        case 'stamina':
          return p.stamina;
        case 'gkPrevented':
          return p.assignedRole === 'POR' ? p.xgotFaced - p.goalsConceded : -99;
      }
    };

    return [...bySearch].sort((a, b) => {
      const va = getSortVal(a, sortKey);
      const vb = getSortVal(b, sortKey);
      return sortDesc ? vb - va : va - vb;
    });
  }, [snapshot.homePlayers, snapshot.awayPlayers, teamFilter, searchQuery, sortKey, sortDesc]);

  const inspectedPlayer = useMemo(() => {
    if (!activeInspectedId) return null;
    return (
      snapshot.homePlayers.find((p) => p.id === activeInspectedId) ||
      snapshot.awayPlayers.find((p) => p.id === activeInspectedId) ||
      null
    );
  }, [activeInspectedId, snapshot.homePlayers, snapshot.awayPlayers]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const SortHeader: React.FC<{ k: SortKey; label: string; align?: 'left' | 'right' }> = ({
    k,
    label,
    align = 'right',
  }) => {
    const active = sortKey === k;
    return (
      <th className={`py-2 px-2 font-medium whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          onClick={() => handleSort(k)}
          className={`inline-flex items-center gap-1 cursor-pointer transition-colors ${
            active ? 'text-sky-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>{label}</span>
          {active && (sortDesc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800">
          {(
            [
              { id: 'resumen', label: 'Resumen Opta' },
              { id: 'mapas', label: 'Mapas y Red de Pases' },
              { id: 'boxscore', label: 'Box Score Individual' },
            ] as { id: AnalyticsSubTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === tab.id
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
          <span style={{ color: homeClub.colors.accent }}>{homeClub.shortCode}</span>
          <span className="text-slate-200 font-semibold">
            {snapshot.homeScore} - {snapshot.awayScore}
          </span>
          <span style={{ color: awayClub.colors.accent }}>{awayClub.shortCode}</span>
          <span aria-hidden="true">·</span>
          <span>
            xG {homeStats.xg.toFixed(2)} - {awayStats.xg.toFixed(2)}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            PPDA {homeStats.ppda.toFixed(1)} / {awayStats.ppda.toFixed(1)}
          </span>
        </div>
      </div>

      {/* TAB 1: RESUMEN OPTA */}
      {subTab === 'resumen' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Column 1: Core & Expected Metrics */}
          <div className="lg:col-span-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200 pb-1 border-b border-slate-800">
              <span style={{ color: homeClub.colors.accent }}>{homeClub.shortCode}</span>
              <span>Ataque y Posesión</span>
              <span style={{ color: awayClub.colors.accent }}>{awayClub.shortCode}</span>
            </div>

            <StatBarRow
              label="Posesión"
              homeVal={`${homeStats.possessionPct}%`}
              awayVal={`${awayStats.possessionPct}%`}
              homeNum={homeStats.possessionPct}
              awayNum={awayStats.possessionPct}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Goles Esperados (xG)"
              homeVal={homeStats.xg.toFixed(2)}
              awayVal={awayStats.xg.toFixed(2)}
              homeNum={homeStats.xg}
              awayNum={awayStats.xg}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="xG a Puerta (xGOT)"
              homeVal={homeStats.xgot.toFixed(2)}
              awayVal={awayStats.xgot.toFixed(2)}
              homeNum={homeStats.xgot}
              awayNum={awayStats.xgot}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Asistencias Esperadas (xA)"
              homeVal={homeStats.xa.toFixed(2)}
              awayVal={awayStats.xa.toFixed(2)}
              homeNum={homeStats.xa}
              awayNum={awayStats.xa}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Tiros (A Puerta / Bloq.)"
              homeVal={`${homeStats.shots} (${homeStats.shotsOnTarget}/${homeStats.shotsBlocked})`}
              awayVal={`${awayStats.shots} (${awayStats.shotsOnTarget}/${awayStats.shotsBlocked})`}
              homeNum={homeStats.shots}
              awayNum={awayStats.shots}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Ocasiones Claras"
              homeVal={homeStats.bigChances}
              awayVal={awayStats.bigChances}
              homeNum={homeStats.bigChances}
              awayNum={awayStats.bigChances}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Field Tilt (Último 1/3)"
              homeVal={`${homeStats.fieldTiltPct}%`}
              awayVal={`${awayStats.fieldTiltPct}%`}
              homeNum={homeStats.fieldTiltPct}
              awayNum={awayStats.fieldTiltPct}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Centros Completados (%)"
              homeVal={`${homeStats.crossesCompleted}/${homeStats.crossesAttempted} (${
                homeStats.crossesAttempted > 0
                  ? Math.round((homeStats.crossesCompleted / homeStats.crossesAttempted) * 100)
                  : 0
              }%)`}
              awayVal={`${awayStats.crossesCompleted}/${awayStats.crossesAttempted} (${
                awayStats.crossesAttempted > 0
                  ? Math.round((awayStats.crossesCompleted / awayStats.crossesAttempted) * 100)
                  : 0
              }%)`}
              homeNum={homeStats.crossesCompleted}
              awayNum={awayStats.crossesCompleted}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Segundas Jugadas (Rebotes)"
              homeVal={homeStats.reboundsRecovered}
              awayVal={awayStats.reboundsRecovered}
              homeNum={homeStats.reboundsRecovered}
              awayNum={awayStats.reboundsRecovered}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
          </div>

          {/* Column 2: Progression, Duels & Pressing */}
          <div className="lg:col-span-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200 pb-1 border-b border-slate-800">
              <span style={{ color: homeClub.colors.accent }}>{homeClub.shortCode}</span>
              <span>Progresión y Duelos</span>
              <span style={{ color: awayClub.colors.accent }}>{awayClub.shortCode}</span>
            </div>

            <StatBarRow
              label="Pases Completados (%)"
              homeVal={`${homeStats.passesCompleted} (${homePassAcc}%)`}
              awayVal={`${awayStats.passesCompleted} (${awayPassAcc}%)`}
              homeNum={homeStats.passesCompleted}
              awayNum={awayStats.passesCompleted}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Pases Clave / Progresivos"
              homeVal={`${homeStats.keyPasses} / ${homeStats.progressivePasses}`}
              awayVal={`${awayStats.keyPasses} / ${awayStats.progressivePasses}`}
              homeNum={homeStats.keyPasses + homeStats.progressivePasses}
              awayNum={awayStats.keyPasses + awayStats.progressivePasses}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Pases al Área / Conduc. Prog."
              homeVal={`${homeStats.passesIntoBox} / ${homeStats.progressiveCarries}`}
              awayVal={`${awayStats.passesIntoBox} / ${awayStats.progressiveCarries}`}
              homeNum={homeStats.passesIntoBox + homeStats.progressiveCarries}
              awayNum={awayStats.passesIntoBox + awayStats.progressiveCarries}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Regates Exitosos (%)"
              homeVal={`${homeStats.dribblesCompleted}/${homeStats.dribblesAttempted} (${homeDribAcc}%)`}
              awayVal={`${awayStats.dribblesCompleted}/${awayStats.dribblesAttempted} (${awayDribAcc}%)`}
              homeNum={homeStats.dribblesCompleted}
              awayNum={awayStats.dribblesCompleted}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Duelos Terrestres (%)"
              homeVal={`${homeStats.groundDuelsWon} (${homeGroundPct}%)`}
              awayVal={`${awayStats.groundDuelsWon} (${awayGroundPct}%)`}
              homeNum={homeStats.groundDuelsWon}
              awayNum={awayStats.groundDuelsWon}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Duelos Aéreos (%)"
              homeVal={`${homeStats.aerialDuelsWon} (${homeAerialPct}%)`}
              awayVal={`${awayStats.aerialDuelsWon} (${awayAerialPct}%)`}
              homeNum={homeStats.aerialDuelsWon}
              awayNum={awayStats.aerialDuelsWon}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="Entradas / Intercep. / Despejes"
              homeVal={`${homeStats.tacklesWon} / ${homeStats.interceptions} / ${homeStats.clearances}`}
              awayVal={`${awayStats.tacklesWon} / ${awayStats.interceptions} / ${awayStats.clearances}`}
              homeNum={homeStats.tacklesWon + homeStats.interceptions + homeStats.clearances}
              awayNum={awayStats.tacklesWon + awayStats.interceptions + awayStats.clearances}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
            />
            <StatBarRow
              label="PPDA (Intensidad de Presión)"
              homeVal={homeStats.ppda.toFixed(1)}
              awayVal={awayStats.ppda.toFixed(1)}
              homeNum={awayStats.ppda}
              awayNum={homeStats.ppda}
              homeColor={homeClub.colors.primary}
              awayColor={awayClub.colors.primary}
              invertPreference
            />
          </div>

          {/* Column 3: xG Timeline + Channels & Thirds */}
          <div className="lg:col-span-4 space-y-3">
            <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <span>Evolución de xG</span>
                <span className="text-[11px] font-normal text-slate-400">
                  Córners {homeStats.corners}-{awayStats.corners} · Faltas {homeStats.fouls}-{awayStats.fouls}
                </span>
              </div>
              <svg viewBox="0 0 300 105" className="w-full h-24 overflow-visible">
                <line x1="0" y1="100" x2="300" y2="100" stroke="#334155" strokeWidth="1" />
                <line x1="150" y1="5" x2="150" y2="100" stroke="#1e293b" strokeDasharray="3 3" strokeWidth="1" />
                <path d={buildXgPath('home')} fill="none" stroke={homeClub.colors.primary} strokeWidth="2.4" />
                <path d={buildXgPath('away')} fill="none" stroke={awayClub.colors.accent} strokeWidth="2.4" />
              </svg>
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 tabular-nums">
                <span>0&apos;</span>
                <span>45&apos;</span>
                <span>90&apos;</span>
              </div>
            </div>

            <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-3 space-y-2.5">
              <div className="text-xs font-semibold text-slate-200">Zonas de Posesión</div>
              <div className="space-y-1.5 text-[11px] font-mono tabular-nums">
                <div className="flex items-center justify-between text-slate-300">
                  <span style={{ color: homeClub.colors.accent }}>{homeClub.shortCode}</span>
                  <span>
                    Salida {homeThirdsPct[0]}% · Creación {homeThirdsPct[1]}% · Últ.1/3 {homeThirdsPct[2]}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-sm overflow-hidden flex bg-slate-800">
                  <div style={{ width: `${homeThirdsPct[0]}%`, backgroundColor: '#334155' }} />
                  <div style={{ width: `${homeThirdsPct[1]}%`, backgroundColor: '#0284c7' }} />
                  <div style={{ width: `${homeThirdsPct[2]}%`, backgroundColor: '#10b981' }} />
                </div>
                <div className="flex items-center justify-between text-slate-300 pt-1">
                  <span style={{ color: awayClub.colors.accent }}>{awayClub.shortCode}</span>
                  <span>
                    Salida {awayThirdsPct[0]}% · Creación {awayThirdsPct[1]}% · Últ.1/3 {awayThirdsPct[2]}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-sm overflow-hidden flex bg-slate-800">
                  <div style={{ width: `${awayThirdsPct[0]}%`, backgroundColor: '#334155' }} />
                  <div style={{ width: `${awayThirdsPct[1]}%`, backgroundColor: '#0284c7' }} />
                  <div style={{ width: `${awayThirdsPct[2]}%`, backgroundColor: '#f59e0b' }} />
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-200">Canales de Ataque (Izq / Cen / Der)</div>
              <div className="space-y-1.5 text-[11px] font-mono tabular-nums">
                <div className="flex items-center justify-between">
                  <span style={{ color: homeClub.colors.accent }}>{homeClub.shortCode}</span>
                  <span className="text-slate-200">
                    {homeChannelsPct[0]}% · {homeChannelsPct[1]}% · {homeChannelsPct[2]}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: awayClub.colors.accent }}>{awayClub.shortCode}</span>
                  <span className="text-slate-200">
                    {awayChannelsPct[0]}% · {awayChannelsPct[1]}% · {awayChannelsPct[2]}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MAPAS Y RED DE PASES */}
      {subTab === 'mapas' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800">
              <button
                onClick={() => setMapSide('home')}
                className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${
                  mapSide === 'home' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {homeClub.name} (Red y Calor)
              </button>
              <button
                onClick={() => setMapSide('away')}
                className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${
                  mapSide === 'away' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {awayClub.name} (Red y Calor)
              </button>
            </div>

            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="px-2 text-[11px] text-slate-400">Tiros:</span>
              {(['all', 'home', 'away'] as TeamFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setShotFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                    shotFilter === f ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {f === 'all' ? 'Ambos' : f === 'home' ? homeClub.shortCode : awayClub.shortCode}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 1. Shot & xGOT Map */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <span>Mapa de Tiros &amp; xGOT</span>
                <span className="text-[11px] font-normal text-slate-400 tabular-nums">
                  {filteredShots.length} remates
                </span>
              </div>

              {filteredShots.length === 0 ? (
                <div className="w-full aspect-[105/68] rounded-lg bg-[#0d1f16] border border-slate-800 flex items-center justify-center text-center px-4">
                  <span className="text-xs text-slate-400">
                    Sin remates registrados todavía para esta selección.
                  </span>
                </div>
              ) : (
                <div className="relative w-full aspect-[105/68] rounded-lg bg-[#123720] border border-slate-800 overflow-hidden">
                  <svg viewBox="-52.5 -34 105 68" className="w-full h-full">
                    <PitchMarkingsSvg />
                    {filteredShots.map((s: ShotRecord) => {
                      const cx = s.side === 'home' ? s.x : -s.x;
                      const cz = s.side === 'home' ? s.z : -s.z;
                      const radius = 1.25 + s.xg * 4.4;
                      const isGoal = s.outcome === 'gol';
                      const color =
                        s.side === 'home' ? homeClub.colors.primary : awayClub.colors.primary;

                      return (
                        <g key={s.id}>
                          <circle
                            cx={cx}
                            cy={cz}
                            r={radius}
                            fill={isGoal ? '#10b981' : color}
                            fillOpacity={isGoal ? 0.92 : 0.55}
                            stroke={isGoal ? '#ffffff' : '#e2e8f0'}
                            strokeWidth={isGoal ? 0.65 : 0.35}
                          >
                            <title>
                              {`${s.minute}' ${s.playerName} (${s.outcome.toUpperCase()}) · xG: ${s.xg.toFixed(
                                2
                              )} · xGOT: ${s.xgot.toFixed(2)}`}
                            </title>
                          </circle>
                          {s.xgot > 0.12 && (
                            <circle
                              cx={cx}
                              cy={cz}
                              r={Math.max(0.55, s.xgot * 1.9)}
                              fill="#fde047"
                              fillOpacity={0.85}
                            />
                          )}
                        </g>
                      );
                    })}
                  </svg>
                  <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[10px] text-slate-300 pointer-events-none">
                    <span>← {awayClub.shortCode}</span>
                    <span>Verde = Gol · Centro = xGOT</span>
                    <span>{homeClub.shortCode} →</span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Bilateral Pass Network */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <span>
                  Red de Pases ({mapSide === 'home' ? homeClub.shortCode : awayClub.shortCode})
                </span>
                <span className="text-[11px] font-normal text-slate-400 tabular-nums">
                  {networkEdges.length} conexiones
                </span>
              </div>

              {networkEdges.length < 3 ? (
                <div className="w-full aspect-[105/68] rounded-lg bg-[#0d1f16] border border-slate-800 flex items-center justify-center text-center px-4">
                  <span className="text-xs text-slate-400">
                    Construyendo red de pases. Se necesitan al menos 3 combinaciones completadas.
                  </span>
                </div>
              ) : (
                <div className="relative w-full aspect-[105/68] rounded-lg bg-[#0e2619] border border-slate-800 overflow-hidden">
                  <svg viewBox="-52.5 -34 105 68" className="w-full h-full">
                    <PitchMarkingsSvg />
                    {/* Edges */}
                    {networkEdges.map((edge) => {
                      const fromP = networkPlayers.find((p) => p.id === edge.fromId);
                      const toP = networkPlayers.find((p) => p.id === edge.toId);
                      if (!fromP || !toP) return null;
                      const weight = edge.count / maxEdgeCount;
                      return (
                        <line
                          key={`${edge.fromId}-${edge.toId}`}
                          x1={fromP.avgX}
                          y1={fromP.avgZ}
                          x2={toP.avgX}
                          y2={toP.avgZ}
                          stroke={
                            mapSide === 'home'
                              ? homeClub.colors.accent
                              : awayClub.colors.accent
                          }
                          strokeOpacity={0.22 + weight * 0.65}
                          strokeWidth={0.45 + weight * 1.9}
                          strokeLinecap="round"
                        >
                          <title>
                            {`#${fromP.number} ${fromP.shortName} → #${toP.number} ${toP.shortName}: ${edge.count} pases`}
                          </title>
                        </line>
                      );
                    })}
                    {/* Player Average Nodes */}
                    {networkPlayers.map((p) => {
                      const r = Math.min(3.8, 1.85 + Math.sqrt(p.touches) * 0.25);
                      return (
                        <g
                          key={p.id}
                          onClick={() => {
                            setInspectedId(p.id);
                            setSubTab('boxscore');
                          }}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={p.avgX}
                            cy={p.avgZ}
                            r={r}
                            fill={
                              mapSide === 'home'
                                ? homeClub.colors.primary
                                : awayClub.colors.primary
                            }
                            stroke="#ffffff"
                            strokeWidth="0.45"
                          >
                            <title>
                              {`#${p.number} ${p.name} (${p.assignedRole}) · ${p.touches} acciones · ${p.passesCompleted}/${p.passesAttempted} pases`}
                            </title>
                          </circle>
                          <text
                            x={p.avgX}
                            y={p.avgZ + 0.85}
                            textAnchor="middle"
                            fontSize="2.35"
                            fontWeight="bold"
                            fill="#ffffff"
                          >
                            {p.number}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[10px] text-slate-300 pointer-events-none">
                    <span>Posición media real</span>
                    <span>Grosor = Volumen · Clic nodo = Ficha</span>
                    <span>Ataque →</span>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Team 12x8 Heatmap */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <span>
                  Mapa de Calor ({mapSide === 'home' ? homeClub.shortCode : awayClub.shortCode})
                </span>
                <span className="text-[11px] font-normal text-slate-400">Cuadrícula 12×8</span>
              </div>
              <HeatmapGridSvg
                heatmap={mapSide === 'home' ? homeStats.heatmap : awayStats.heatmap}
                color={
                  mapSide === 'home' ? homeClub.colors.primary : awayClub.colors.primary
                }
                label="Densidad de acciones con balón"
              />
            </div>
          </div>

          {/* FM08 9-Zone Tactical Matrix (3x3 Longitudinal x Lateral) */}
          {(() => {
            const activeStats = mapSide === 'home' ? homeStats : awayStats;
            const zoneSum = activeStats.zoneActivity.reduce((a, b) => a + b, 0) || 1;
            const zonePcts = activeStats.zoneActivity.map((v) => Math.round((v / zoneSum) * 100));
            const maxZonePct = Math.max(1, ...zonePcts);
            const laneNames = ['Banda Izq.', 'Carril Central', 'Banda Der.'];
            const thirdNames = ['Salida (0-333)', 'Creación (334-666)', 'Ataque (667-1000)'];

            return (
              <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-200">
                    Matriz Táctica 9 Zonas ({mapSide === 'home' ? homeClub.shortCode : awayClub.shortCode})
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                    Zona 14 (Frontal del área): {zonePcts[7]}% del juego ofensivo
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-[11px] font-mono tabular-nums">
                  <div className="text-[10px] font-sans text-slate-500 flex items-center">Carril / Tercio</div>
                  {thirdNames.map((tn) => (
                    <div key={tn} className="text-center text-[10px] font-sans text-slate-400">
                      {tn}
                    </div>
                  ))}
                  {[0, 1, 2].map((ch) => (
                    <React.Fragment key={ch}>
                      <div className="text-[10px] font-sans text-slate-400 flex items-center">
                        {laneNames[ch]}
                      </div>
                      {[0, 1, 2].map((th) => {
                        const idx = th * 3 + ch;
                        const pct = zonePcts[idx];
                        const isZone14 = idx === 7;
                        const intensity = pct / maxZonePct;
                        return (
                          <div
                            key={idx}
                            className={`py-1.5 px-2 rounded border text-center ${
                              isZone14 ? 'border-amber-500/60' : 'border-slate-800'
                            }`}
                            style={{
                              backgroundColor: `rgba(16, 185, 129, ${(0.06 + intensity * 0.34).toFixed(2)})`,
                            }}
                          >
                            <span className="font-semibold text-slate-100">{pct}%</span>
                            {isZone14 && (
                              <span className="ml-1 text-[9px] font-sans text-amber-300">Z14</span>
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 3: BOX SCORE INDIVIDUAL */}
      {subTab === 'boxscore' && (
        <div className="space-y-3">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800">
                {(['all', 'home', 'away'] as TeamFilter[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTeamFilter(tf)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                      teamFilter === tf ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf === 'all' ? 'Todos' : tf === 'home' ? homeClub.shortCode : awayClub.shortCode}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800">
                {(
                  [
                    { id: 'general', label: 'General' },
                    { id: 'ataque', label: 'Ataque' },
                    { id: 'creacion', label: 'Creación' },
                    { id: 'defensa', label: 'Defensa' },
                    { id: 'fisico', label: 'Físico y POR' },
                  ] as { id: StatCategory; label: string }[]
                ).map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setStatCat(cat.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                      statCat === cat.id
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar jugador o dorsal..."
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 w-48"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Table */}
            <div
              className={`${
                inspectedPlayer ? 'lg:col-span-8' : 'lg:col-span-12'
              } overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60`}
            >
              {allBoxPlayers.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No se encontraron jugadores con ese filtro.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/70 text-[11px]">
                      <th className="py-2 px-2 font-medium text-slate-400">Eq.</th>
                      <th className="py-2 px-2 font-medium text-slate-400">Jugador</th>
                      <th className="py-2 px-2 font-medium text-slate-400">Rol</th>
                      <SortHeader k="minutes" label="Min" />
                      {statCat === 'general' && (
                        <>
                          <SortHeader k="goals" label="G" />
                          <SortHeader k="assists" label="A" />
                          <SortHeader k="xg" label="xG" />
                          <SortHeader k="xa" label="xA" />
                          <SortHeader k="passes" label="Pases" />
                          <SortHeader k="tackles" label="Robos" />
                          <SortHeader k="distance" label="Km" />
                        </>
                      )}
                      {statCat === 'ataque' && (
                        <>
                          <SortHeader k="goals" label="Goles" />
                          <SortHeader k="shots" label="Tiros (AP)" />
                          <SortHeader k="xg" label="xG" />
                          <SortHeader k="dribbles" label="Regates" />
                          <SortHeader k="progCarries" label="C.Prog" />
                        </>
                      )}
                      {statCat === 'creacion' && (
                        <>
                          <SortHeader k="assists" label="Asist." />
                          <SortHeader k="xa" label="xA" />
                          <SortHeader k="passes" label="Pases (%)" />
                          <SortHeader k="keyPasses" label="P.Clave" />
                          <SortHeader k="progPasses" label="P.Prog" />
                        </>
                      )}
                      {statCat === 'defensa' && (
                        <>
                          <SortHeader k="tackles" label="Entr./Int." />
                          <SortHeader k="groundDuels" label="D.Terr." />
                          <SortHeader k="aerialDuels" label="D.Aér." />
                          <SortHeader k="clearances" label="Desp./Bloq." />
                        </>
                      )}
                      {statCat === 'fisico' && (
                        <>
                          <SortHeader k="stamina" label="Físico" />
                          <SortHeader k="distance" label="Dist (km)" />
                          <SortHeader k="sprints" label="Sprints" />
                          <SortHeader k="gkPrevented" label="POR Par./Evit." />
                        </>
                      )}
                      <SortHeader k="rating" label="Nota" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                    {allBoxPlayers.map((p) => {
                      const club = p.side === 'home' ? homeClub : awayClub;
                      const isSel = inspectedPlayer?.id === p.id;
                      const passPct =
                        p.passesAttempted > 0
                          ? Math.round((p.passesCompleted / p.passesAttempted) * 100)
                          : 0;
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setInspectedId(isSel ? null : p.id)}
                          className={`h-9 cursor-pointer transition-colors ${
                            isSel ? 'bg-sky-950/50' : 'hover:bg-slate-900/60'
                          }`}
                        >
                          <td className="py-1.5 px-2 font-sans text-[11px] font-semibold">
                            <span style={{ color: club.colors.accent }}>{club.shortCode}</span>
                          </td>
                          <td className="py-1.5 px-2 font-sans text-slate-100 whitespace-nowrap">
                            <span className="font-mono text-slate-400 mr-1.5">#{p.number}</span>
                            <span className="font-medium">{p.shortName}</span>
                            {p.knockSeverity === 2 && (
                              <span className="ml-1.5 text-[10px] font-semibold text-rose-400">· Lesión</span>
                            )}
                            {p.knockSeverity === 1 && (
                              <span className="ml-1.5 text-[10px] font-medium text-amber-400">· Golpe</span>
                            )}
                            {p.subbedOff && (
                              <span className="ml-1.5 text-[10px] text-slate-500">Sust.</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-[11px] text-sky-400">{p.assignedRole}</td>
                          <td className="py-1.5 px-2 text-right text-slate-300">
                            {Math.round(p.minutesPlayed)}&apos;
                          </td>

                          {statCat === 'general' && (
                            <>
                              <td className="py-1.5 px-2 text-right text-slate-100">{p.goals}</td>
                              <td className="py-1.5 px-2 text-right text-slate-100">{p.assists}</td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.xgGenerated.toFixed(2)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.xa.toFixed(2)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.passesCompleted}/{p.passesAttempted}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.tacklesWon + p.interceptions}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {(p.distanceMeters / 1000).toFixed(2)}
                              </td>
                            </>
                          )}

                          {statCat === 'ataque' && (
                            <>
                              <td className="py-1.5 px-2 text-right text-slate-100">{p.goals}</td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.shots} ({p.shotsOnTarget})
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.xgGenerated.toFixed(2)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.dribblesCompleted}/{p.dribblesAttempted}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.progressiveCarries}
                              </td>
                            </>
                          )}

                          {statCat === 'creacion' && (
                            <>
                              <td className="py-1.5 px-2 text-right text-slate-100">{p.assists}</td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.xa.toFixed(2)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.passesCompleted}/{p.passesAttempted} ({passPct}%)
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.keyPasses}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.progressivePasses}
                              </td>
                            </>
                          )}

                          {statCat === 'defensa' && (
                            <>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.tacklesWon}/{p.interceptions}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.groundDuelsWon}/{p.groundDuelsWon + p.groundDuelsLost}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.aerialDuelsWon}/{p.aerialDuelsWon + p.aerialDuelsLost}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.clearances}/{p.shotsBlocked}
                              </td>
                            </>
                          )}

                          {statCat === 'fisico' && (
                            <>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {Math.round(p.stamina)}%
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {(p.distanceMeters / 1000).toFixed(2)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-300">{p.sprints}</td>
                              <td className="py-1.5 px-2 text-right text-slate-300">
                                {p.assignedRole === 'POR'
                                  ? `${p.saves} / ${(p.xgotFaced - p.goalsConceded).toFixed(2)}`
                                  : '—'}
                              </td>
                            </>
                          )}

                          <td className="py-1.5 px-2 text-right font-semibold">
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Player Deep-Dive Inspector */}
            {inspectedPlayer && (
              <div className="lg:col-span-4 rounded-lg border border-slate-800 bg-slate-900/75 p-3 space-y-3 self-start">
                <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-800">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      #{inspectedPlayer.number} {inspectedPlayer.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {inspectedPlayer.assignedRole} ·{' '}
                      {inspectedPlayer.side === 'home' ? homeClub.name : awayClub.name} ·{' '}
                      {Math.round(inspectedPlayer.minutesPlayed)} min
                    </div>
                  </div>
                  <button
                    onClick={() => setInspectedId(null)}
                    className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                    aria-label="Cerrar inspector de jugador"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center font-mono text-xs tabular-nums">
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-emerald-400 font-semibold">
                      {inspectedPlayer.rating.toFixed(1)}
                    </div>
                    <div className="text-[10px] font-sans text-slate-400">Nota FM</div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-white font-semibold">
                      {Math.round(inspectedPlayer.stamina)}%
                    </div>
                    <div className="text-[10px] font-sans text-slate-400">Físico</div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-white font-semibold">
                      {(inspectedPlayer.distanceMeters / 1000).toFixed(2)}
                    </div>
                    <div className="text-[10px] font-sans text-slate-400">Km</div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-white font-semibold">{inspectedPlayer.sprints}</div>
                    <div className="text-[10px] font-sans text-slate-400">Sprints</div>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-slate-300 mb-1">
                    Mapa de Calor Individual (12×8)
                  </div>
                  <HeatmapGridSvg
                    heatmap={inspectedPlayer.heatmap}
                    color={
                      inspectedPlayer.side === 'home'
                        ? homeClub.colors.primary
                        : awayClub.colors.primary
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono tabular-nums pt-1 border-t border-slate-800">
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-400">xG / xGOT</span>
                    <span className="text-slate-100">
                      {inspectedPlayer.xgGenerated.toFixed(2)} /{' '}
                      {inspectedPlayer.xgotGenerated.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-400">xA / P.Clave</span>
                    <span className="text-slate-100">
                      {inspectedPlayer.xa.toFixed(2)} / {inspectedPlayer.keyPasses}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-400">P.Prog / C.Prog</span>
                    <span className="text-slate-100">
                      {inspectedPlayer.progressivePasses} / {inspectedPlayer.progressiveCarries}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-400">Regates</span>
                    <span className="text-slate-100">
                      {inspectedPlayer.dribblesCompleted}/{inspectedPlayer.dribblesAttempted}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-400">D.Terrestres</span>
                    <span className="text-slate-100">
                      {inspectedPlayer.groundDuelsWon}/
                      {inspectedPlayer.groundDuelsWon + inspectedPlayer.groundDuelsLost}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-400">D.Aéreos</span>
                    <span className="text-slate-100">
                      {inspectedPlayer.aerialDuelsWon}/
                      {inspectedPlayer.aerialDuelsWon + inspectedPlayer.aerialDuelsLost}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-400">Desp. / Bloq.</span>
                    <span className="text-slate-100">
                      {inspectedPlayer.clearances} / {inspectedPlayer.shotsBlocked}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-400">Centros / Err.</span>
                    <span className="text-slate-100">
                      {inspectedPlayer.crossesCompleted}/{inspectedPlayer.crossesAttempted} ·{' '}
                      {inspectedPlayer.errorsLeadingToShot}
                    </span>
                  </div>
                  {inspectedPlayer.assignedRole === 'POR' && (
                    <>
                      <div className="flex justify-between">
                        <span className="font-sans text-slate-400">Paradas / xGOT</span>
                        <span className="text-slate-100">
                          {inspectedPlayer.saves} / {inspectedPlayer.xgotFaced.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans text-slate-400">Goles evitados</span>
                        <span className="text-emerald-400">
                          {(inspectedPlayer.xgotFaced - inspectedPlayer.goalsConceded).toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
