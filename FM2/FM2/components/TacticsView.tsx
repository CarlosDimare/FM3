
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Player, Position, Club, SquadType, StaffRole, TacticSettings, PlayerTacticSettings, Tactic } from '../types';
import { world, getBenchSizeForCompetition } from '../services/worldManager';
import { notifyPlayers, notifyTactics } from '../stores/worldStore';
import { useDialogueStore } from '../stores/dialogueStore';
import { useGameStore } from '../stores/gameStore';
import { SLOT_CONFIG } from '../services/engine';
import { checkAssistantTrigger, checkReserveManagerTrigger, checkYouthManagerTrigger } from '../services/dialogueTriggers';
import { Save, UserCheck, MousePointer2, ArrowUpRight, LayoutGrid, ClipboardList, X, Users, Star, Trash2, GitBranch, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { FMButton, FMBox } from './FMUI';

interface TacticsViewProps {
   players: Player[];
   club: Club;
   squad?: SquadType;
   onContextMenu?: (e: React.MouseEvent, player: Player) => void;
   onSquadChange?: (type: SquadType) => void;
}

const DORSAL_POOLS: Record<string, number[]> = {
  GK: [1, 12, 21, 31, 33],
  SW: [5, 6, 16],
  DEF: [2, 3, 4, 5, 6, 15, 16, 22, 23, 24, 26],
  DM: [14, 24, 25, 6],
  MID: [7, 8, 10, 17, 18, 20, 27],
  AM: [10, 11, 19, 26, 29],
  ATT: [9, 11, 19, 27, 28, 29, 30],
};

const getDorsal = (p: Player, allPlayers: Player[]): number => {
  const line = p.positions.includes(Position.GK) ? 'GK'
    : p.positions.includes(Position.SW) ? 'SW'
    : [Position.DC, Position.DR, Position.DL].includes(p.positions[0]) ? 'DEF'
    : [Position.DM, Position.DMR, Position.DML].includes(p.positions[0]) ? 'DM'
    : [Position.MC, Position.MR, Position.ML].includes(p.positions[0]) ? 'MID'
    : [Position.AM, Position.AMR, Position.AML].includes(p.positions[0]) ? 'AM' : 'ATT';
  const pool = DORSAL_POOLS[line] || DORSAL_POOLS.ATT;
  const idx = allPlayers.filter(x => x.squad === p.squad && x.positions.includes(p.positions[0])).indexOf(p);
  return pool[Math.max(0, idx % pool.length)];
};

const SLOT_COORDS: Record<number, { t: number, l: number }> = {
   0: { t: 90, l: 50 }, // GK
   
   // LIBERO / SWEEPER
   31: { t: 82.5, l: 50 }, // LIB
   
   // DEFENSE (t: 75)
   1: { t: 75, l: 8 },  2: { t: 75, l: 29 }, 3: { t: 75, l: 50 }, 4: { t: 75, l: 71 }, 5: { t: 75, l: 92 },
   
   // DM (t: 62)
   9: { t: 62, l: 8 },  6: { t: 62, l: 29 }, 8: { t: 62, l: 50 }, 7: { t: 62, l: 71 }, 10: { t: 62, l: 92 },
   
   // MID (t: 45)
   11: { t: 45, l: 8 }, 12: { t: 45, l: 29 }, 13: { t: 45, l: 50 }, 14: { t: 45, l: 71 }, 15: { t: 45, l: 92 },
   
   // AM (t: 28)
   16: { t: 28, l: 8 }, 19: { t: 28, l: 29 }, 17: { t: 28, l: 50 }, 20: { t: 28, l: 71 }, 18: { t: 28, l: 92 },
   
   // ATT (t: 12)
   27: { t: 12, l: 8 }, 29: { t: 12, l: 29 }, 26: { t: 12, l: 50 }, 30: { t: 12, l: 71 }, 28: { t: 12, l: 92 },
};

const getPlayerLine = (p: Player): string => {
  if (p.positions.includes(Position.GK)) return 'GK';
  if (p.positions.includes(Position.SW)) return 'SW';
  const pos = p.positions[0];
  if ([Position.DC, Position.DR, Position.DL].includes(pos)) return 'DEF';
  if ([Position.DM, Position.DMR, Position.DML].includes(pos)) return 'DM';
  if ([Position.MC, Position.MR, Position.ML].includes(pos)) return 'MID';
  if ([Position.AM, Position.AMR, Position.AML].includes(pos)) return 'AM';
  return 'ATT';
};

const LINE_NEIGHBORS: Record<string, string[]> = {
  GK: ['DEF'],
  SW: ['DEF'],
  DEF: ['SW', 'DM'],
  DM: ['DEF', 'MID'],
  MID: ['DM', 'AM'],
  AM: ['MID', 'ATT'],
  ATT: ['AM'],
};

const lineFit = (p: Player, line: string): number => {
  const pLine = getPlayerLine(p);
  if (line === pLine) return 20;
  if (p.secondaryPositions && p.secondaryPositions.some(sp => {
    const spLine = getPlayerLine({ ...p, positions: [sp] } as Player);
    return spLine === line;
  })) return 15;
  if ((LINE_NEIGHBORS[line] || []).includes(pLine)) return 9;
  if ((LINE_NEIGHBORS[pLine] || []).includes(line)) return 9;
  return 3;
};

const slotFit = (p: Player, slot: number): number => {
  const metadata = SLOT_CONFIG[slot];
  if (!metadata) return 0;
  return lineFit(p, metadata.line) + p.currentAbility / 20;
};

const SliderRow: React.FC<{ 
    label: string; 
    value: number; 
    min?: number; 
    max?: number; 
    onChange: (val: number) => void; 
    getLabel?: (val: number) => string;
}> = ({ label, value, min = 1, max = 20, onChange, getLabel }) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2 border-b border-[#a0b0a0]/20 hover:bg-black/5 px-2 group">
        <div className="flex justify-between items-center sm:w-32">
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-tight" style={{ fontFamily: 'Verdana, sans-serif' }}>{label}</span>
            <span className="sm:hidden text-[10px] font-black text-slate-900 uppercase" style={{ fontFamily: 'Verdana, sans-serif' }}>
                {getLabel ? getLabel(value) : value}
            </span>
        </div>
        <div className="flex items-center gap-3 flex-1">
            <input 
                type="range" min={min} max={max} step="1" 
                className="flex-1 accent-[#3a4a3a] h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer"
                value={value} 
                onChange={(e) => onChange(parseInt(e.target.value))} 
            />
            <span className="hidden sm:inline w-24 text-[10px] font-black text-slate-900 text-right uppercase" style={{ fontFamily: 'Verdana, sans-serif' }}>
                {getLabel ? getLabel(value) : value}
            </span>
        </div>
    </div>
);

const CheckboxRow: React.FC<{ label: string; checked: boolean; onChange: (val: boolean) => void }> = ({ label, checked, onChange }) => (
    <label className="flex items-center gap-3 py-2 cursor-pointer hover:bg-black/5 px-2 group border-b border-[#a0b0a0]/10 sm:border-0">
        <div className={`w-5 h-5 border border-[#3a4a3a] rounded-[1px] flex items-center justify-center transition-colors shadow-inner ${checked ? 'bg-[#3a4a3a]' : 'bg-white'}`}>
            {checked && <div className="w-2.5 h-2.5 bg-white rounded-full"></div>}
        </div>
        <input type="checkbox" className="hidden" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight" style={{ fontFamily: 'Verdana, sans-serif' }}>{label}</span>
    </label>
);

const CycleOption: React.FC<{ label: string; value: string; options: { id: string; label: string }[]; onChange: (val: any) => void }> = ({ label, value, options, onChange }) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-b border-[#a0b0a0]/20 px-2 group">
        <span className="sm:w-32 text-[10px] font-black text-slate-600 uppercase tracking-tight" style={{ fontFamily: 'Verdana, sans-serif' }}>{label}</span>
        <div className="flex bg-[#bcc8bc] p-0.5 rounded-sm border border-[#a0b0a0] shadow-sm">
            {options.map(opt => (
                <button 
                    key={opt.id} 
                    onClick={() => onChange(opt.id)}
                    className={`flex-1 py-2 text-[8px] font-black uppercase rounded-[1px] transition-all ${value === opt.id ? 'bg-[#3a4a3a] text-white shadow-md' : 'text-slate-600 hover:bg-black/5'}`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    </div>
);

const PlayerRow: React.FC<{ p: Player; players: Player[]; fitScore: number; highlight?: boolean; onPick: () => void; badge?: string }> = ({ p, players, fitScore, highlight, onPick, badge }) => (
   <button onClick={onPick}
      className={`flex items-center gap-2 px-2.5 py-2 rounded-sm border text-left transition-all shadow-sm w-full ${highlight ? 'bg-green-50 border-green-500 ring-1 ring-green-500' : 'bg-white border-[#a0b0a0] hover:border-[#3a4a3a]'}`}>
      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 border ${p.positions.includes(Position.GK) ? 'bg-yellow-400 text-black border-yellow-600' : 'bg-slate-200 border-slate-400 text-slate-700'}`}>
         {getDorsal(p, players)}
      </span>
      <div className="min-w-0 flex-1">
         <p className="text-[10px] font-black uppercase truncate leading-none text-slate-900">{p.name}</p>
         <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[8px] font-bold text-slate-400">{p.positions.join('/')}</span>
            <span className="text-[8px] font-black text-slate-600">CA {(p.currentAbility/20).toFixed(1)}</span>
            {fitScore >= 15 && <span className="text-[8px] font-black text-green-700">Apto</span>}
            {badge && <span className="ml-auto text-[8px] font-black uppercase text-blue-700">{badge}</span>}
         </div>
      </div>
      <span className="text-[9px] font-black text-slate-700 shrink-0">{Math.round(fitScore)}</span>
   </button>
);

export const TacticsView: React.FC<TacticsViewProps> = ({ players, club, squad = 'SENIOR', onContextMenu, onSquadChange }) => {
   const currentSquad = squad as SquadType;
   const [viewMode, setViewMode] = useState<'PITCH' | 'INSTRUCTIONS'>('PITCH');
   const [instructionType, setInstructionType] = useState<'TEAM' | 'INDIVIDUAL'>('TEAM');
   const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
   const [selectedTacticId, setSelectedTacticId] = useState<string>(world.getTactics()[0]?.id || '');
   const [newTacticName, setNewTacticName] = useState('');
   const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
   
   const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
   const [drawingArrowFrom, setDrawingArrowFrom] = useState<number | null>(null);
   const [currentHoverSlot, setCurrentHoverSlot] = useState<number | null>(null);

   const [pickSlot, setPickSlot] = useState<number | null>(null);
   const [pickBenchSeat, setPickBenchSeat] = useState<number | null>(null);
   const [arrowMode, setArrowMode] = useState(false);
   const [arrowMenuSlot, setArrowMenuSlot] = useState<number | null>(null);
    const [confirmAction, setConfirmAction] = useState<'CLEAR' | null>(null);

    const currentDate = useGameStore(s => s.currentDate);
    const nextFixture = useGameStore(s => s.nextFixture);

    const benchSize = useMemo(() => {
      const comp = nextFixture ? world.competitions.find(c => c.id === nextFixture.competitionId) : undefined;
      return getBenchSizeForCompetition(comp);
    }, [nextFixture]);

    const benchSeated = useMemo(
      () => players.filter(p => p.benchPosition !== undefined).sort((a, b) => (a.benchPosition || 0) - (b.benchPosition || 0)),
      [players]
    );

    const assistantTrigger = useMemo(() => {
      if (squad === 'RESERVE') return checkReserveManagerTrigger({ currentView: `${squad}_TACTICS`, currentDate: currentDate || new Date(), userClubId: club?.id, nextFixture: nextFixture || undefined });
      if (squad === 'U20') return checkYouthManagerTrigger({ currentView: `${squad}_TACTICS`, currentDate: currentDate || new Date(), userClubId: club?.id, nextFixture: nextFixture || undefined });
      return checkAssistantTrigger({ currentView: `${squad}_TACTICS`, currentDate: currentDate || new Date(), userClubId: club?.id, nextFixture: nextFixture || undefined });
    }, [club?.id, currentDate, nextFixture, squad]);

    const assistantColor = club?.primaryColor || 'bg-[#3a4a3a]';

    const [lupe, setLupe] = useState<{ x: number; y: number } | null>(null);

    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    const squadLabels: Record<SquadType, string> = { SENIOR: 'Primer Equipo', RESERVE: 'Reserva', U20: 'Sub 20' };
    const squadOrder: SquadType[] = ['SENIOR', 'RESERVE', 'U20'];
    const currentSquadIndex = squadOrder.indexOf(currentSquad);

    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent) => {
      setTouchEnd(null);
      setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
      setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
      if (!touchStart || !touchEnd || !onSquadChange) return;
      const distance = touchStart - touchEnd;
      const isLeftSwipe = distance > minSwipeDistance;
      const isRightSwipe = distance < -minSwipeDistance;
      if (isLeftSwipe) {
        const nextIndex = (currentSquadIndex + 1) % squadOrder.length;
        onSquadChange(squadOrder[nextIndex]);
      }
      if (isRightSwipe) {
        const prevIndex = (currentSquadIndex - 1 + squadOrder.length) % squadOrder.length;
        onSquadChange(squadOrder[prevIndex]);
      }
    };

    const staffCards = useMemo(() => {
      if (!club) return [];
      const byRole = (role: StaffRole) => world.getStaffByClub(club.id).find(s => s.role === role) || null;
      const openTactics = (kind: 'ASSISTANT' | 'FITNESS', staffId?: string) =>
        useDialogueStore.getState().open(kind, { clubId: club.id, source: 'TACTICS', tacticId: selectedTacticId || world.getTactics()[0]?.id, staffId, squad: currentSquad });
      const cards: { id: string; name: string; roleLabel: string; badge?: boolean; onClick?: () => void }[] = [];
      if (squad === 'RESERVE') {
        const m = byRole('RESERVE_MANAGER');
        if (m) cards.push({ id: m.id, name: m.name, roleLabel: 'Entrenador Reserva', badge: !!assistantTrigger, onClick: () => openTactics('ASSISTANT', m.id) });
      }
      if (squad === 'U20') {
        const m = byRole('YOUTH_MANAGER');
        if (m) cards.push({ id: m.id, name: m.name, roleLabel: 'Entrenador Sub-20', badge: !!assistantTrigger, onClick: () => openTactics('ASSISTANT', m.id) });
      }
      const asst = byRole('ASSISTANT_MANAGER');
      if (asst) cards.push({ id: asst.id, name: asst.name, roleLabel: 'Ayudante de Campo', onClick: () => openTactics('ASSISTANT', asst.id) });
      const fit = byRole('FITNESS_COACH');
      if (fit) cards.push({ id: fit.id, name: fit.name, roleLabel: 'Preparador Físico', onClick: () => openTactics('FITNESS', fit.id) });
      const phys = byRole('PHYSIO');
      if (phys) cards.push({ id: phys.id, name: phys.name, roleLabel: 'Médico' });
      return cards;
    }, [club, squad, selectedTacticId, assistantTrigger]);

   const activeTactic = world.getTactics().find(t => t.id === selectedTacticId) || world.getTactics()[0];
   const starters = players.filter(p => p.isStarter && p.tacticalPosition !== undefined);

   useEffect(() => {
      if (activeTactic) {
         setSelectedTacticId(activeTactic.id);
      }
   }, []);

   const updateTeamSettings = (key: keyof TacticSettings, val: any) => {
       if (!activeTactic) return;
        activeTactic.settings = { ...activeTactic.settings, [key]: val };
          notifyTactics();
   };

   const updateIndividualSettings = (slot: number, key: keyof PlayerTacticSettings, val: any) => {
       if (!activeTactic) return;
       if (!activeTactic.individualSettings[slot]) {
           activeTactic.individualSettings[slot] = {
               mentality: 10, creativeFreedom: 10, passingStyle: 10, closingDown: 10, tackling: 10,
               forwardRuns: 'MIXED', runWithBall: 'MIXED', longShots: 'MIXED', throughBalls: 'MIXED',
               crossBall: 'MIXED', marking: 'ZONAL', tightMarking: false, holdUpBall: false
           };
       }
        activeTactic.individualSettings[slot] = { ...activeTactic.individualSettings[slot], [key]: val };
        notifyTactics();
   };

   const handleAutoPick = () => {
      const currentSquad = players.length > 0 ? players[0].squad : 'SENIOR';
      world.selectBestEleven(club.id, currentSquad, activeTactic.id); 
      players.forEach(p => { if (p.isStarter) p.benchPosition = undefined; });
      if (players.length > 0) notifyPlayers();
   };

   const handleClearSelection = () => {
      players.forEach(p => { p.isStarter = false; p.tacticalPosition = undefined; });
      notifyPlayers();
   };

   const deleteArrowsForSlots = (slots: number[]) => {
      if (!activeTactic) return;
      slots.forEach(slot => delete activeTactic.arrows[slot]);
      Object.keys(activeTactic.arrows).forEach(from => {
         if (slots.includes(activeTactic.arrows[parseInt(from, 10)])) delete activeTactic.arrows[parseInt(from, 10)];
      });
      notifyTactics();
   };

   const handleArrowTap = (slotIdx: number) => {
      if (activeTactic.arrows[slotIdx] !== undefined) {
         setArrowMenuSlot(slotIdx);
         return;
      }
      if (drawingArrowFrom === null) {
         setDrawingArrowFrom(slotIdx);
      } else if (drawingArrowFrom === slotIdx) {
         setDrawingArrowFrom(null);
      } else {
         handleCreateArrow(slotIdx);
      }
   };

   const handlePickForSlot = (player: Player) => {
      if (pickSlot === null) return;
      const current = starters.find(p => p.tacticalPosition === pickSlot);
      if (current) {
         current.isStarter = false;
         current.tacticalPosition = undefined;
      }
      if (player.isStarter && player.tacticalPosition !== undefined) {
         const oldSlot = player.tacticalPosition;
         player.tacticalPosition = pickSlot;
         if (current) { current.tacticalPosition = oldSlot; current.isStarter = true; }
         deleteArrowsForSlots([pickSlot, oldSlot]);
      } else {
         player.isStarter = true;
         player.tacticalPosition = pickSlot;
         player.benchPosition = undefined;
         deleteArrowsForSlots([pickSlot]);
      }
      setPickSlot(null);
      notifyPlayers();
   };

   const handlePickForBenchSeat = (player: Player) => {
      if (pickBenchSeat === null) return;
      const current = players.find(p => p.benchPosition === pickBenchSeat);
      if (current && current.id !== player.id) current.benchPosition = undefined;
      if (player.benchPosition !== undefined && player.benchPosition !== pickBenchSeat) {
         const otherSeat = players.find(p => p.benchPosition === pickBenchSeat && p.id !== player.id);
         if (otherSeat) otherSeat.benchPosition = undefined;
         player.benchPosition = pickBenchSeat;
      } else {
         player.benchPosition = pickBenchSeat;
      }
      setPickBenchSeat(null);
      notifyPlayers();
   };

   const handleUnassignBenchSeat = (seat: number) => {
      const current = players.find(p => p.benchPosition === seat);
      if (current) current.benchPosition = undefined;
      setPickBenchSeat(null);
      notifyPlayers();
   };

   const handleUnassignSlot = (slot: number) => {
      const current = starters.find(p => p.tacticalPosition === slot);
      if (current) {
         current.isStarter = false;
         current.tacticalPosition = undefined;
      }
      deleteArrowsForSlots([slot]);
      setPickSlot(null);
      notifyPlayers();
   };

   const isPlayerSuitableForLine = (p: Player, line: string) => {
       const pos = p.positions[0];
       if (line === 'GK') return pos === Position.GK;
       if (line === 'SW') return pos === Position.SW;
       if (line === 'DEF') return [Position.DC, Position.DL, Position.DR].includes(pos);
        if (line === 'DM') return [Position.DM, Position.DMR, Position.DML].includes(pos);
        if (line === 'MID') return [Position.MC, Position.ML, Position.MR].includes(pos);
        if (line === 'AM') return [Position.AM, Position.AML, Position.AMR].includes(pos);
       if (line === 'ATT') return [Position.ST, Position.STR, Position.STL].includes(pos);
       return false;
   };

   const handleTacticChange = (tacticId: string) => {
       setSelectedTacticId(tacticId);
       const newTactic = world.getTactics().find(t => t.id === tacticId);
       if (!newTactic) return;

       const currentStarters = players.filter(p => p.isStarter);
       const unassignedPlayers = [...currentStarters];
       const targetSlots = [...newTactic.positions];

       unassignedPlayers.forEach(p => p.tacticalPosition = undefined);
       newTactic.arrows = {};

       const gkSlot = targetSlots.find(s => SLOT_CONFIG[s].line === 'GK');
       if (gkSlot !== undefined) {
           const gkIdx = unassignedPlayers.findIndex(p => p.positions.includes(Position.GK));
           if (gkIdx !== -1) {
               unassignedPlayers[gkIdx].tacticalPosition = gkSlot;
               unassignedPlayers.splice(gkIdx, 1);
               targetSlots.splice(targetSlots.indexOf(gkSlot), 1);
           }
       }

       for (const slot of [...targetSlots]) {
           if (!targetSlots.includes(slot)) continue;
           
           const line = SLOT_CONFIG[slot].line;
           let bestIdx = unassignedPlayers.findIndex(p => isPlayerSuitableForLine(p, line));
           
           if (bestIdx === -1 && unassignedPlayers.length > 0) {
               bestIdx = 0;
           }

            if (bestIdx !== -1) {
                unassignedPlayers[bestIdx].tacticalPosition = slot;
                unassignedPlayers.splice(bestIdx, 1);
             targetSlots.splice(targetSlots.indexOf(slot), 1);
             }
         }

         players.forEach(p => { if (p.isStarter) p.benchPosition = undefined; });
         
         notifyPlayers(); notifyTactics();
    };

    const handleSlotDrop = (targetSlot: number) => {
      if (draggingSlot === null || draggingSlot === targetSlot) return;
      
      const p1 = starters.find(p => p.tacticalPosition === draggingSlot);
      const p2 = starters.find(p => p.tacticalPosition === targetSlot);

      if (p1) p1.tacticalPosition = targetSlot;
      if (p2) p2.tacticalPosition = draggingSlot;
      deleteArrowsForSlots([draggingSlot, targetSlot]);

      const idx1 = activeTactic.positions.indexOf(draggingSlot);
      const idx2 = activeTactic.positions.indexOf(targetSlot);
      if (idx1 !== -1) activeTactic.positions[idx1] = targetSlot;
      if (idx2 !== -1) activeTactic.positions[idx2] = draggingSlot;
      
       if (idx1 === -1 && p1 && !activeTactic.positions.includes(targetSlot)) activeTactic.positions.push(targetSlot);
       if (idx1 !== -1 && !p2 && idx2 === -1) {
           activeTactic.positions.splice(idx1, 1);
           activeTactic.positions.push(targetSlot);
       }

      const sSlot = draggingSlot as number;
      const settings1 = activeTactic.individualSettings[sSlot];
      const settings2 = activeTactic.individualSettings[targetSlot];
      if (settings1) activeTactic.individualSettings[targetSlot] = settings1;
      else delete activeTactic.individualSettings[targetSlot];
      if (settings2) activeTactic.individualSettings[sSlot] = settings2;
      else delete activeTactic.individualSettings[sSlot];

      const arrow1 = activeTactic.arrows[sSlot];
      const arrow2 = activeTactic.arrows[targetSlot];
      if (arrow1 !== undefined) activeTactic.arrows[targetSlot] = arrow1;
      else delete activeTactic.arrows[targetSlot];
      if (arrow2 !== undefined) activeTactic.arrows[sSlot] = arrow2;
      else delete activeTactic.arrows[sSlot];

      setDraggingSlot(null);
      notifyPlayers(); notifyTactics();
   };

   const handleCreateArrow = (targetSlot: number) => {
        if (drawingArrowFrom === null) return;
        if (drawingArrowFrom !== targetSlot) {
            activeTactic.arrows[drawingArrowFrom] = targetSlot;
        } else {
            delete activeTactic.arrows[drawingArrowFrom];
        }
        setDrawingArrowFrom(null);
        notifyTactics();
   };

   const getMentalityLabel = (v: number) => v <= 4 ? "Ultra Def." : v <= 8 ? "Defensiva" : v <= 12 ? "Normal" : v <= 16 ? "Atacante" : "Agobio";

   const touchStartSlot = useRef<number | null>(null);

   const handleTouchStart = (e: React.TouchEvent, slotIdx: number) => {
      e.preventDefault();
      touchStartSlot.current = slotIdx;
      if (!arrowMode) setDraggingSlot(slotIdx);
      setSelectedSlot(slotIdx);
   };

   const handlePitchTouchMove = (e: React.TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      if (el) {
         const slotEl = el.closest('[data-slot]');
         if (slotEl) {
            const slot = parseInt(slotEl.getAttribute('data-slot') || '', 10);
            if (!isNaN(slot)) {
               setCurrentHoverSlot(slot);
               setDraggingSlot(slot);
            }
         }
      }
   };

   const handlePitchTouchEnd = (e: React.TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      if (el) {
         const slotEl = el.closest('[data-slot]');
         if (slotEl) {
            const targetSlot = parseInt(slotEl.getAttribute('data-slot') || '', 10);
            if (!isNaN(targetSlot)) {
               if (arrowMode) {
                  handleArrowTap(targetSlot);
               } else if (touchStartSlot.current !== null && touchStartSlot.current !== targetSlot) {
                  handleSlotDrop(targetSlot);
               } else if (touchStartSlot.current === targetSlot) {
                  setPickSlot(targetSlot);
               }
            }
         }
      }
      touchStartSlot.current = null;
      setDraggingSlot(null);
      setCurrentHoverSlot(null);
   };

    const renderPitch = (compact?: boolean) => (
       <div className={`relative ${compact ? 'h-[min(42vh,420px)] aspect-[3/4] w-auto shrink-0 min-w-0 lg:h-auto lg:w-full lg:max-w-[420px]' : 'flex-1 min-h-0 w-full lg:flex-none lg:h-auto lg:w-full lg:max-w-[420px] lg:aspect-[3/4] lg:min-h-0'} shadow-2xl bg-[#1e3a29] border-[3px] border-white/30 rounded-sm overflow-hidden ring-4 ring-[#a0b0a0]/30 ${arrowMode ? 'cursor-crosshair' : ''}`}
            onMouseLeave={() => { setDraggingSlot(null); setDrawingArrowFrom(null); setCurrentHoverSlot(null); }}
            onTouchMove={handlePitchTouchMove}
            onTouchEnd={handlePitchTouchEnd}>
           <select
              value={selectedTacticId}
              onChange={(e) => handleTacticChange(e.target.value)}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-1 left-1 z-30 bg-[#2a3a2a] text-white border border-white/30 rounded-sm px-2 py-1 text-[9px] font-black uppercase tracking-widest outline-none shadow-lg"
              aria-label="Seleccionar táctica"
           >
              {world.getTactics().map(t => (
                 <option key={t.id} value={t.id}>{t.name}</option>
              ))}
           </select>
           <svg className="absolute inset-0 w-full h-full opacity-40 pointer-events-none">
              <g stroke="white" strokeWidth="2" fill="none">
                 <rect x="5%" y="5%" width="90%" height="90%" />
                 <line x1="5%" y1="50%" x2="95%" y2="50%" />
                 <circle cx="50%" cy="50%" r="15%" />
                 <rect x="25%" y="5%" width="50%" height="15%" />
                 <rect x="25%" y="80%" width="50%" height="15%" />
              </g>
           </svg>

           <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
               <defs>
                   <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                       <polygon points="0 0, 10 3.5, 0 7" fill="#fbbf24" />
                   </marker>
               </defs>
               {Object.entries(activeTactic.arrows).map(([from, to]) => {
                   const start = SLOT_COORDS[parseInt(from)];
                   const end = SLOT_COORDS[to];
                   if (!start || !end) return null;
                   return (
                       <line key={from} x1={`${start.l}%`} y1={`${start.t}%`} x2={`${end.l}%`} y2={`${end.t}%`} 
                             stroke="#fbbf24" strokeWidth="2" strokeDasharray="4" markerEnd="url(#arrowhead)" />
                   );
               })}
           </svg>

           {Object.entries(SLOT_COORDS).map(([idx, coords]) => {
              const slotIdx = parseInt(idx);
              const p = starters.find(pl => pl.tacticalPosition === slotIdx);
              const isSelected = selectedSlot === slotIdx;
              const isTacticSlot = activeTactic.positions.includes(slotIdx);
              const isDragActive = draggingSlot !== null;
              if (!isTacticSlot && !isDragActive) return null;
              
              return (
                 <div 
                     key={idx} 
                     data-slot={slotIdx}
                     className={`absolute transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 sm:w-16 sm:h-16 flex flex-col items-center justify-center z-10 
                                 ${draggingSlot === slotIdx ? 'opacity-30 scale-90' : ''}
                                 ${currentHoverSlot === slotIdx ? 'ring-2 ring-white/50 rounded-full' : ''}
                                 ${drawingArrowFrom === slotIdx ? 'ring-2 ring-amber-400 rounded-full' : ''}`} 
                     style={{ top: `${coords.t}%`, left: `${coords.l}%` }}
                     onMouseEnter={() => setCurrentHoverSlot(slotIdx)}
                      onMouseDown={(e) => {
                          if (e.button === 0 && !arrowMode) setDraggingSlot(slotIdx);
                          if (e.button === 2 && !arrowMode) setDrawingArrowFrom(slotIdx);
                          setSelectedSlot(slotIdx);
                      }}
                      onMouseUp={() => {
                          if (arrowMode) {
                             handleArrowTap(slotIdx);
                          } else if (draggingSlot === slotIdx) {
                             setPickSlot(slotIdx);
                          } else if (draggingSlot !== null) {
                             handleSlotDrop(slotIdx);
                          }
                          if (drawingArrowFrom !== null && !arrowMode) handleCreateArrow(slotIdx);
                          setDraggingSlot(null);
                      }}
                     onContextMenu={(e) => { e.preventDefault(); if (p) onContextMenu?.(e, p); }}
                     onTouchStart={(e) => handleTouchStart(e, slotIdx)}
                 >
                    {p ? (
                       <div className="flex flex-col items-center gap-0.5">
                           <div title={`${p.name} — ${SLOT_CONFIG[slotIdx]?.abbr || ''}`} className={`relative w-10 h-10 sm:w-12 sm:h-12 lg:w-12 lg:h-12 rounded-full border-2 flex items-center justify-center font-black text-[11px] sm:text-sm shadow-lg transition-all hover:scale-110 cursor-pointer ${isSelected ? 'ring-4 ring-yellow-400' : ''} ${p.positions.includes(Position.GK) ? 'bg-yellow-400 text-black border-yellow-600' : `${club.primaryColor} ${club.secondaryColor} border-black/20`}`}>
                               {getDorsal(p, players)}
                            </div>
                            <span className="px-1 py-px bg-black/70 text-white text-[5px] sm:text-[6px] lg:text-[7px] font-black uppercase rounded-sm leading-none truncate max-w-[56px] lg:max-w-[64px] shadow-sm">{p.name}</span>
                       </div>
                    ) : (
                       <div className={`w-9 h-9 sm:w-12 sm:h-12 lg:w-12 lg:h-12 rounded-full border-2 border-dashed flex items-center justify-center font-black text-[9px] sm:text-[10px] uppercase tracking-tight transition-all cursor-pointer hover:scale-110 ${isSelected ? 'ring-4 ring-yellow-400' : ''} ${isTacticSlot ? 'border-white/50 bg-white/5 text-white/80' : 'border-green-400 bg-green-400/25 text-green-100 animate-pulse'} ${currentHoverSlot === slotIdx && !isTacticSlot ? 'border-green-200 bg-green-300/40' : ''}`}>
                          {SLOT_CONFIG[slotIdx]?.abbr || 'JUG'}
                       </div>
                    )}
                 </div>
              );
           })}
       </div>
    );

    const renderBenchPanel = () => (
       <div className="flex flex-col h-full">
          <header className="px-2 py-0.5 lg:py-1.5 border-b border-[#a0b0a0] text-[8px] lg:text-[10px] font-black uppercase tracking-widest text-slate-700 flex justify-between items-center" style={{ background: 'linear-gradient(to bottom, #cfd8cf 0%, #a3b4a3 100%)' }}>
             <span className="flex items-center gap-1"><Users size={10} /> Suplentes</span>
             <span className="bg-black/10 px-1.5 rounded-full text-[8px] lg:text-[9px] border border-black/5">{benchSeated.length}/{benchSize}</span>
          </header>
           <div className="flex-1 overflow-y-auto lg:overflow-y-auto p-1 lg:p-2 custom-scroll bg-[#dbe6db]/40">
              <div className="grid grid-cols-7 lg:grid-cols-4 gap-1">
                 {Array.from({ length: benchSize }).map((_, seat) => {
                    const p = players.find(pl => pl.benchPosition === seat);
                    return (
                       <button key={`seat-${seat}`} onClick={() => setPickBenchSeat(seat)}
                          className={`flex flex-col items-center justify-center gap-px p-0.5 lg:p-1 rounded-sm transition-all shadow-sm ${p ? 'bg-white border border-[#a0b0a0] hover:border-[#3a4a3a] hover:bg-[#f2f7f2]' : 'bg-[#dbe6db]/60 border border-dashed border-[#a0b0a0] hover:border-[#3a4a3a] hover:bg-white/60'}`}
                          title={p ? p.name : `Butaca ${seat + 1} — tocar para elegir suplente`}
                          onContextMenu={(e) => { if (p) { e.preventDefault(); onContextMenu?.(e, p); } }}>
                          <div className={`w-6 h-6 sm:w-7 sm:h-7 lg:w-9 lg:h-9 rounded-full flex items-center justify-center text-[8px] lg:text-[10px] font-black shrink-0 shadow-sm border ${p ? (p.positions.includes(Position.GK) ? 'bg-yellow-400 text-black border-yellow-600' : 'bg-slate-200 border-slate-400 text-slate-700') : 'border-dashed border-[#a0b0a0] bg-white/40 text-slate-400'}`}>
                             {p ? getDorsal(p, players) : (seat + 1)}
                          </div>
                          <span className={`w-full text-[5.5px] lg:text-[7px] font-black uppercase truncate text-center leading-none ${p ? 'text-slate-800' : 'text-slate-400'}`}>
                             {p ? p.name : 'Libre'}
                          </span>
                          {p && (
                             <span className="hidden lg:block text-[7px] font-bold text-slate-500 whitespace-nowrap">CA {(p.currentAbility/20).toFixed(1)}</span>
                          )}
                       </button>
                    );
                 })}
              </div>
              {benchSize > 7 && (
                 <p className="mt-0.5 lg:mt-2 text-[6.5px] lg:text-[8px] font-black uppercase tracking-widest text-slate-400 text-center">Banco ampliado (12)</p>
              )}
           </div>
       </div>
    );

    const renderPickModal = () => {
      if (pickSlot === null) return null;
      const current = starters.find(p => p.tacticalPosition === pickSlot);
      const line = SLOT_CONFIG[pickSlot]?.line || '?';
      const lineLabel: Record<string, string> = { GK: 'Portero', SW: 'Libero', DEF: 'Defensa', DM: 'Mediocentro Def.', MID: 'Mediocentro', AM: 'Mediapunta', ATT: 'Delantero' };
      const eligible = players.filter(p => !p.injury && (!p.suspension || p.suspension.matchesLeft === 0) && !(p.isStarter && p.tacticalPosition !== undefined) && p.id !== current?.id);
      const ranked = [...eligible].sort((a, b) => slotFit(b, pickSlot) - slotFit(a, pickSlot));
      const top3 = ranked.slice(0, 3);
      const rest = ranked.slice(3).sort((a, b) => b.currentAbility - a.currentAbility);
      return (
         <div className="fixed inset-0 z-[600] bg-black/70 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm animate-overlay-in" onClick={() => setPickSlot(null)}>
            <div className="bg-[#e8ece8] border-2 border-[#a0b0a0] rounded-sm shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} style={{ fontFamily: 'Verdana, sans-serif' }}>
               <header className="px-4 py-3 border-b border-[#a0b0a0] flex justify-between items-center shrink-0" style={{ background: 'linear-gradient(to bottom, #cfd8cf 0%, #a3b4a3 100%)' }}>
                  <div>
                     <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider italic">Puesto: {lineLabel[line] || line}</h3>
                     <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">{current ? `Titular actual: ${current.name}` : 'Casilla vacante — elige a un jugador'}</p>
                  </div>
                  <button onClick={() => setPickSlot(null)} className="bg-black/10 hover:bg-black/20 rounded-sm p-2 transition-colors">
                     <X size={16} className="text-slate-800" />
                  </button>
               </header>

               <div className="flex-1 overflow-y-auto custom-scroll p-3 sm:p-4 space-y-4">
                  {current && (
                     <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-400 rounded-sm">
                        <span className="text-[10px] font-black uppercase text-amber-900">Titular: {current.name}</span>
                        <button onClick={() => handleUnassignSlot(pickSlot)} className="text-[9px] font-black uppercase text-amber-900 underline">Quitar del 11</button>
                     </div>
                  )}

                  {top3.length > 0 && (
                     <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                           <Star size={11} className="text-amber-500 fill-amber-500" /> Mejores opciones para este puesto
                        </p>
                        <div className="space-y-1.5">
                           {top3.map((p, i) => (
                              <PlayerRow key={p.id} p={p} players={players} fitScore={slotFit(p, pickSlot)} highlight onPick={() => handlePickForSlot(p)} badge={i === 0 ? 'Recomendado' : undefined} />
                           ))}
                        </div>
                     </div>
                  )}

                  {rest.length > 0 && (
                     <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Resto del plantel</p>
                        <div className="space-y-1.5">
                           {rest.map(p => (
                              <PlayerRow key={p.id} p={p} players={players} fitScore={slotFit(p, pickSlot)} onPick={() => handlePickForSlot(p)} />
                           ))}
                        </div>
                     </div>
                  )}

                  {ranked.length === 0 && (
                     <p className="p-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">No hay jugadores disponibles</p>
                  )}
               </div>

               <footer className="px-4 py-3 border-t border-[#a0b0a0] flex gap-2 shrink-0">
                  <FMButton variant="secondary" onClick={handleAutoPick} className="flex-1 py-2.5 text-[9px]">
                     <UserCheck size={12} /> AUTO COMPLETAR
                  </FMButton>
                  <FMButton variant="primary" onClick={() => setPickSlot(null)} className="flex-1 py-2.5 text-[9px]">
                     LISTO
                  </FMButton>
               </footer>
            </div>
         </div>
      );
    };

    const renderBenchPickModal = () => {
      if (pickBenchSeat === null) return null;
      const current = players.find(p => p.benchPosition === pickBenchSeat);
      const eligible = players.filter(p => !p.injury && (!p.suspension || p.suspension.matchesLeft === 0) && !p.isStarter && p.benchPosition === undefined && p.id !== current?.id);
      const ranked = [...eligible].sort((a, b) => b.currentAbility - a.currentAbility);
      const top3 = ranked.slice(0, 3);
      const rest = ranked.slice(3);
      return (
         <div className="fixed inset-0 z-[600] bg-black/70 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm animate-overlay-in" onClick={() => setPickBenchSeat(null)}>
            <div className="bg-[#e8ece8] border-2 border-[#a0b0a0] rounded-sm shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} style={{ fontFamily: 'Verdana, sans-serif' }}>
               <header className="px-4 py-3 border-b border-[#a0b0a0] flex justify-between items-center shrink-0" style={{ background: 'linear-gradient(to bottom, #cfd8cf 0%, #a3b4a3 100%)' }}>
                  <div>
                     <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider italic">Butaca {pickBenchSeat + 1} de {benchSize}</h3>
                     <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">{current ? `Suplente actual: ${current.name}` : 'Butaca vacante — elige a un jugador'}</p>
                  </div>
                  <button onClick={() => setPickBenchSeat(null)} className="bg-black/10 hover:bg-black/20 rounded-sm p-2 transition-colors">
                     <X size={16} className="text-slate-800" />
                  </button>
               </header>

               <div className="flex-1 overflow-y-auto custom-scroll p-3 sm:p-4 space-y-4">
                  {current && (
                     <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-400 rounded-sm">
                        <span className="text-[10px] font-black uppercase text-amber-900">Suplente: {current.name}</span>
                        <button onClick={() => handleUnassignBenchSeat(pickBenchSeat)} className="text-[9px] font-black uppercase text-amber-900 underline">Quitar del banco</button>
                     </div>
                  )}

                  {top3.length > 0 && (
                     <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                           <Star size={11} className="text-amber-500 fill-amber-500" /> Mejores opciones para el banco
                        </p>
                        <div className="space-y-1.5">
                           {top3.map((p, i) => (
                              <PlayerRow key={p.id} p={p} players={players} fitScore={p.currentAbility / 20}
                                 onPick={() => handlePickForBenchSeat(p)} highlight={i === 0} badge={i === 0 ? 'Recomendado' : undefined} />
                           ))}
                        </div>
                     </div>
                  )}

                  {rest.length > 0 && (
                     <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Resto del plantel</p>
                        <div className="space-y-1.5">
                           {rest.map(p => (
                              <PlayerRow key={p.id} p={p} players={players} fitScore={p.currentAbility / 20} onPick={() => handlePickForBenchSeat(p)} />
                           ))}
                        </div>
                     </div>
                  )}

                  {ranked.length === 0 && (
                     <p className="p-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">No hay jugadores disponibles para el banco</p>
                  )}
               </div>

               <footer className="px-4 py-3 border-t border-[#a0b0a0] flex gap-2 shrink-0">
                  <FMButton variant="secondary" onClick={() => setPickBenchSeat(null)} className="flex-1 py-2.5 text-[9px]">
                     CANCELAR
                  </FMButton>
               </footer>
            </div>
         </div>
      );
    };

   return (
      <div className="flex flex-col h-full bg-[#d4dcd4] overflow-hidden select-none" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onContextMenu={e => e.preventDefault()}>
         {onSquadChange && (
            <div className="shrink-0 flex items-center justify-between bg-[#3a4a3a] text-white px-3 py-1.5">
               <button onClick={() => onSquadChange(squadOrder[(squadOrder.indexOf(currentSquad) - 1 + squadOrder.length) % squadOrder.length])} className="p-1 hover:bg-white/10 rounded transition-colors"><ChevronLeft size={16} /></button>
               <span className="text-[10px] font-black uppercase tracking-widest">{squadLabels[currentSquad]}</span>
               <button onClick={() => onSquadChange(squadOrder[(squadOrder.indexOf(currentSquad) + 1) % squadOrder.length])} className="p-1 hover:bg-white/10 rounded transition-colors"><ChevronRight size={16} /></button>
            </div>
         )}
         <div className="flex flex-col lg:flex-row flex-1 overflow-hidden relative">
            {/* Panel izquierdo: botones en 1 renglón + fichas del cuerpo técnico */}
            <aside className="flex flex-col gap-1 lg:gap-2 p-1 sm:p-1.5 lg:p-2 bg-[#e8ece8] border-b lg:border-b-0 lg:border-r border-[#a0b0a0] lg:w-52 shrink-0 z-30 shadow-sm">
               <div className="flex gap-0.5 sm:gap-1">
                  <button onClick={() => setViewMode('PITCH')} aria-label="Dibujo" title="Dibujo"
                     className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 px-0.5 sm:px-2 py-1.5 lg:py-2 rounded-[1px] text-[7px] sm:text-[8px] font-black uppercase transition-all ${viewMode === 'PITCH' ? 'bg-[#3a4a3a] text-white shadow-md' : 'bg-[#bcc8bc] text-slate-700 hover:bg-black/5'}`}>
                     <LayoutGrid size={10} /> <span className="hidden lg:inline">DIBUJO</span>
                  </button>
                  <button onClick={() => setViewMode('INSTRUCTIONS')} aria-label="Instrucciones" title="Instrucciones"
                     className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 px-0.5 sm:px-2 py-1.5 lg:py-2 rounded-[1px] text-[7px] sm:text-[8px] font-black uppercase transition-all ${viewMode === 'INSTRUCTIONS' ? 'bg-[#3a4a3a] text-white shadow-md' : 'bg-[#bcc8bc] text-slate-700 hover:bg-black/5'}`}>
                     <ClipboardList size={10} /> <span className="hidden lg:inline">INSTRUC.</span>
                  </button>
                  <button onClick={() => setArrowMode(!arrowMode)} aria-label="Flechas" title="Flechas"
                     className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 px-0.5 sm:px-2 py-1.5 lg:py-2 rounded-[1px] text-[7px] sm:text-[8px] font-black uppercase transition-all ${arrowMode ? 'bg-amber-500 text-black shadow-md' : 'bg-[#bcc8bc] text-slate-700 hover:bg-black/5'}`}>
                     <GitBranch size={10} /> <span className="hidden lg:inline">FLECHAS</span>
                  </button>
                  <button onClick={() => setIsSaveModalOpen(true)} aria-label="Guardar táctica" title="Guardar táctica"
                     className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 px-0.5 sm:px-2 py-1.5 lg:py-2 rounded-[1px] text-[7px] sm:text-[8px] font-black uppercase transition-all bg-[#bcc8bc] text-slate-700 hover:bg-black/5">
                     <Save size={10} /> <span className="hidden lg:inline">GUARDAR</span>
                  </button>
                  <button onClick={() => setConfirmAction('CLEAR')} aria-label="Borrar once" title="Borrar once"
                     className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 px-0.5 sm:px-2 py-1.5 lg:py-2 rounded-[1px] text-[7px] sm:text-[8px] font-black uppercase transition-all bg-red-600 text-white hover:bg-red-700">
                     <Trash2 size={10} /> <span className="hidden lg:inline">BORRAR</span>
                  </button>
               </div>

               <div className="hidden lg:block h-px bg-[#a0b0a0]/40 shrink-0"></div>

               <div className="flex lg:flex-col gap-1 lg:gap-1.5">
                  {staffCards.map(card => (
                     <button key={card.id} disabled={!card.onClick} onClick={card.onClick}
                        className="relative min-w-0 flex-1 lg:flex-none lg:w-full flex items-center gap-1 sm:gap-1.5 p-0.5 sm:p-1 lg:p-1.5 rounded-sm border border-[#a0b0a0] bg-white shadow-sm text-left enabled:hover:border-[#3a4a3a] enabled:hover:bg-[#f2f7f2] transition-all"
                        title={card.roleLabel}>
                        {card.badge && (
                           <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                           </span>
                        )}
                        <span className={`w-6 h-6 sm:w-7 sm:h-7 lg:w-9 lg:h-9 rounded-full shrink-0 flex items-center justify-center text-white border-2 border-white shadow ${assistantColor}`}>
                           <User size={12} />
                        </span>
                        <span className="min-w-0 flex-1">
                           <span className="block text-[6.5px] sm:text-[8px] lg:text-[9px] font-black uppercase truncate leading-tight text-slate-900">{card.name}</span>
                           <span className="block text-[6px] sm:text-[7px] lg:text-[7px] font-black uppercase tracking-wide text-slate-500 truncate">{card.roleLabel}</span>
                        </span>
                     </button>
                  ))}
               </div>
            </aside>

         <div className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 relative overflow-hidden bg-[#cbd5e1]/30 p-1 sm:p-2 flex">
                {viewMode === 'PITCH' ? (
                   <div className="flex flex-col items-center gap-1 sm:gap-1.5 w-full h-full min-h-0">
                       <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center gap-1 sm:gap-1.5">
                       {renderPitch(true)}
                       <div
                         onTouchStart={(e) => { const t = e.touches[0]; setLupe({ x: t.clientX, y: t.clientY }); }}
                         onTouchMove={(e) => { const t = e.touches[0]; setLupe({ x: t.clientX, y: t.clientY }); }}
                         onTouchEnd={() => setLupe(null)}
                         onTouchCancel={() => setLupe(null)}
                         className="w-full shrink-0 lg:w-auto lg:max-w-[420px] bg-white/60 px-1 py-0.5 rounded-sm border border-[#a0b0a0] flex items-center justify-center gap-2 sm:gap-4 shadow-sm text-[6px] sm:text-[7px] font-black text-slate-500 uppercase tracking-tight whitespace-nowrap overflow-hidden"
                       >
                           <span className="flex items-center gap-1 shrink-0"><MousePointer2 size={7} className="text-slate-400" /> CLICK: ELEGIR</span>
                           <span className="flex items-center gap-1 shrink-0"><ArrowUpRight size={7} className="text-slate-400" /> ARRASTRAR: MOVER</span>
                           <span className="flex items-center gap-1 shrink-0"><GitBranch size={7} className="text-amber-600" /> FLECHAS: ORIGEN→DESTINO</span>
                       </div>
                       {lupe && (
                          <div className="fixed z-[700] pointer-events-none flex justify-center" style={{ left: 0, right: 0, top: Math.max(8, lupe.y - 130) }}>
                             <div className="bg-black/90 border-2 border-amber-400 rounded-2xl px-5 py-3 shadow-2xl text-center max-w-[92vw] animate-fade-up">
                                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] font-black uppercase tracking-widest text-amber-100 leading-snug">
                                   <span>CLICK FICHA: ELEGIR</span>
                                   <span className="text-amber-500">·</span>
                                   <span>ARRASTRAR: MOVER / INTERCAMBIAR</span>
                                   <span className="text-amber-500">·</span>
                                   <span>FLECHAS: ORIGEN → DESTINO</span>
                                </div>
                                <div className="mt-1.5 text-[8px] font-bold text-white/60 uppercase tracking-widest">Soltá el dedo para cerrar</div>
                             </div>
                          </div>
                       )}
                       </div>
                       <div className="w-full shrink-0 lg:hidden">
                          <div className="border border-[#a0b0a0] bg-[#e8ece8] rounded-sm shadow-sm">
                             {renderBenchPanel()}
                          </div>
                       </div>
                   </div>
               ) : (
                   <div className="w-full h-full overflow-y-auto custom-scroll flex justify-center">
                      <div className="w-full max-w-4xl flex flex-col gap-4 pb-12 animate-fade-up">
                      <div className="flex gap-1 bg-[#bcc8bc] p-0.5 rounded-sm border border-[#a0b0a0] self-stretch sm:self-start shadow-sm">
                          <button onClick={() => setInstructionType('TEAM')} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[9px] font-black uppercase rounded-[1px] transition-all ${instructionType === 'TEAM' ? 'bg-[#3a4a3a] text-white shadow-md' : 'text-slate-700 hover:bg-black/5'}`}>Instrucciones de Equipo</button>
                          <button onClick={() => setInstructionType('INDIVIDUAL')} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[9px] font-black uppercase rounded-[1px] transition-all ${instructionType === 'INDIVIDUAL' ? 'bg-[#3a4a3a] text-white shadow-md' : 'text-slate-700 hover:bg-black/5'}`}>Instrucciones Individuales</button>
                      </div>

                      {instructionType === 'TEAM' ? (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <FMBox title="Instrucciones de Equipo" noPadding className="shadow-lg">
                                <div className="p-2 sm:p-4 bg-white/50 space-y-0.5">
                                    <SliderRow label="Mentalidad" value={activeTactic.settings.mentality} onChange={(v) => updateTeamSettings('mentality', v)} getLabel={getMentalityLabel} />
                                    <SliderRow label="Libertad Creativa" value={activeTactic.settings.creativeFreedom} onChange={(v) => updateTeamSettings('creativeFreedom', v)} />
                                    <SliderRow label="Estilo de Pase" value={activeTactic.settings.passingStyle} onChange={(v) => updateTeamSettings('passingStyle', v)} />
                                    <SliderRow label="Tempo" value={activeTactic.settings.tempo} onChange={(v) => updateTeamSettings('tempo', v)} />
                                    <SliderRow label="Anchura" value={activeTactic.settings.width} onChange={(v) => updateTeamSettings('width', v)} />
                                    <SliderRow label="Presión" value={activeTactic.settings.closingDown} onChange={(v) => updateTeamSettings('closingDown', v)} />
                                    <SliderRow label="Pérdida de Tiempo" value={activeTactic.settings.timeWasting} onChange={(v) => updateTeamSettings('timeWasting', v)} />
                                    <SliderRow label="Línea Defensiva" value={activeTactic.settings.defensiveLine} onChange={(v) => updateTeamSettings('defensiveLine', v)} />
                                    <SliderRow label="Entradas" value={activeTactic.settings.tackling} onChange={(v) => updateTeamSettings('tackling', v)} />
                                </div>
                            </FMBox>
                            <FMBox title="Órdenes Específicas" noPadding className="shadow-lg">
                                <div className="p-2 sm:p-4 bg-white/50 grid grid-cols-1 sm:grid-cols-2 gap-x-2">
                                    <CheckboxRow label="Marcaje Férreo" checked={activeTactic.settings.tightMarking} onChange={(v) => updateTeamSettings('tightMarking', v)} />
                                    <CheckboxRow label="Hombre Objetivo" checked={activeTactic.settings.useTargetMan} onChange={(v) => updateTeamSettings('useTargetMan', v)} />
                                    <CheckboxRow label="Usar Organizador" checked={activeTactic.settings.usePlaymaker} onChange={(v) => updateTeamSettings('usePlaymaker', v)} />
                                    <CheckboxRow label="Fuera de Juego" checked={activeTactic.settings.playOffside} onChange={(v) => updateTeamSettings('playOffside', v)} />
                                    <CheckboxRow label="Contraataque" checked={activeTactic.settings.counterAttack} onChange={(v) => updateTeamSettings('counterAttack', v)} />
                                </div>
                            </FMBox>
                          </div>
                      ) : (
                          <div className="flex flex-col md:flex-row gap-4 min-h-[500px]">
                              <div className="w-full md:w-48 shrink-0 flex flex-col gap-2">
                                  <div className="h-[250px] md:h-[280px] flex justify-center">
                                     {renderPitch()}
                                  </div>
                                  {selectedSlot !== null && starters.find(p => p.tacticalPosition === selectedSlot) && (
                                      <div className="p-3 bg-[#e8ece8] border border-[#a0b0a0] rounded-sm text-center shadow-md border-t-4 border-t-slate-800">
                                          <p className="text-[10px] font-black uppercase text-slate-900 truncate">
                                              {starters.find(p => p.tacticalPosition === selectedSlot)?.name}
                                          </p>
                                          <p className="text-[8px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Línea: {SLOT_CONFIG[selectedSlot].line}</p>
                                      </div>
                                  )}
                              </div>

                              <div className="flex-1 overflow-y-auto custom-scroll">
                                  {selectedSlot !== null ? (
                                      <div className="space-y-4">
                                          <FMBox title="Instrucciones Individuales" noPadding className="shadow-lg">
                                              <div className="p-2 sm:p-4 bg-white/50 space-y-0.5">
                                                  <SliderRow label="Mentalidad" value={activeTactic.individualSettings[selectedSlot]?.mentality || 10} onChange={(v) => updateIndividualSettings(selectedSlot, 'mentality', v)} getLabel={getMentalityLabel} />
                                                  <SliderRow label="Libertad Creativa" value={activeTactic.individualSettings[selectedSlot]?.creativeFreedom || 10} onChange={(v) => updateIndividualSettings(selectedSlot, 'creativeFreedom', v)} />
                                                  <SliderRow label="Estilo de Pase" value={activeTactic.individualSettings[selectedSlot]?.passingStyle || 10} onChange={(v) => updateIndividualSettings(selectedSlot, 'passingStyle', v)} />
                                                  <SliderRow label="Presión" value={activeTactic.individualSettings[selectedSlot]?.closingDown || 10} onChange={(v) => updateIndividualSettings(selectedSlot, 'closingDown', v)} />
                                                  <SliderRow label="Entradas" value={activeTactic.individualSettings[selectedSlot]?.tackling || 10} onChange={(v) => updateIndividualSettings(selectedSlot, 'tackling', v)} />
                                                  
                                                  <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-x-4">
                                                      <CycleOption label="Subidas" value={activeTactic.individualSettings[selectedSlot]?.forwardRuns || 'MIXED'} options={[{id:'RARELY', label:'Poco'}, {id:'MIXED', label:'A veces'}, {id:'OFTEN', label:'Siempre'}]} onChange={(v) => updateIndividualSettings(selectedSlot, 'forwardRuns', v)} />
                                                      <CycleOption label="Correr con balón" value={activeTactic.individualSettings[selectedSlot]?.runWithBall || 'MIXED'} options={[{id:'RARELY', label:'Poco'}, {id:'MIXED', label:'A veces'}, {id:'OFTEN', label:'Siempre'}]} onChange={(v) => updateIndividualSettings(selectedSlot, 'runWithBall', v)} />
                                                      <CycleOption label="Tiros lejanos" value={activeTactic.individualSettings[selectedSlot]?.longShots || 'MIXED'} options={[{id:'RARELY', label:'Poco'}, {id:'MIXED', label:'A veces'}, {id:'OFTEN', label:'Siempre'}]} onChange={(v) => updateIndividualSettings(selectedSlot, 'longShots', v)} />
                                                      <CycleOption label="Pases al hueco" value={activeTactic.individualSettings[selectedSlot]?.throughBalls || 'MIXED'} options={[{id:'RARELY', label:'Poco'}, {id:'MIXED', label:'A veces'}, {id:'OFTEN', label:'Siempre'}]} onChange={(v) => updateIndividualSettings(selectedSlot, 'throughBalls', v)} />
                                                      <CycleOption label="Centrar balón" value={activeTactic.individualSettings[selectedSlot]?.crossBall || 'MIXED'} options={[{id:'RARELY', label:'Poco'}, {id:'MIXED', label:'A veces'}, {id:'OFTEN', label:'Siempre'}]} onChange={(v) => updateIndividualSettings(selectedSlot, 'crossBall', v)} />
                                                  </div>

                                                  <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 border-t border-[#a0b0a0]/20 mt-2">
                                                      <CheckboxRow label="Marcaje Férreo" checked={activeTactic.individualSettings[selectedSlot]?.tightMarking || false} onChange={(v) => updateIndividualSettings(selectedSlot, 'tightMarking', v)} />
                                                      <CheckboxRow label="Aguantar Balón" checked={activeTactic.individualSettings[selectedSlot]?.holdUpBall || false} onChange={(v) => updateIndividualSettings(selectedSlot, 'holdUpBall', v)} />
                                                  </div>
                                              </div>
                                          </FMBox>
                                      </div>
                                  ) : (
                                      <div className="h-48 md:h-full flex flex-col items-center justify-center text-slate-400 bg-white/20 rounded border-2 border-dashed border-slate-400 shadow-inner">
                                          <MousePointer2 size={32} className="mb-2 opacity-30" />
                                          <p className="text-[10px] font-black uppercase tracking-[0.2em] px-6 text-center">Selecciona una ficha para configurar sus órdenes individuales</p>
                                      </div>
                                  )}
                              </div>
                          </div>
                      )}
                  </div>
                  </div>
               )}
            </div>

            {/* Bench Panel - Desktop */}
            <div className="w-64 border-l border-[#a0b0a0] bg-[#e8ece8] flex-col shadow-inner hidden lg:flex">
               {renderBenchPanel()}
            </div>
         </div>
         </div>

         {renderPickModal()}
         {renderBenchPickModal()}

         {/* Arrow Menu Modal */}
         {arrowMenuSlot !== null && (
            <div className="fixed inset-0 z-[500] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm animate-overlay-in" onClick={() => setArrowMenuSlot(null)}>
               <FMBox title="Flecha de ataque" className="w-full max-w-sm shadow-2xl border-2 border-slate-400">
                  <div className="p-6 space-y-6">
                     <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0"><GitBranch size={18} /></div>
                        <div>
                           <p className="text-xs font-black text-slate-900 uppercase leading-snug">Existe una flecha desde {SLOT_CONFIG[arrowMenuSlot]?.abbr || arrowMenuSlot}</p>
                           <p className="text-[10px] text-slate-600 mt-1 leading-relaxed">Podés borrarla o dibujar una nueva hacia otro puesto.</p>
                        </div>
                     </div>
                     <div className="flex flex-col gap-2">
                        <FMButton variant="danger" onClick={() => { deleteArrowsForSlots([arrowMenuSlot]); setArrowMenuSlot(null); }} className="w-full py-3">
                           <Trash2 size={12}/> BORRAR FLECHA
                        </FMButton>
                        <FMButton variant="secondary" onClick={() => { setDrawingArrowFrom(arrowMenuSlot); setArrowMenuSlot(null); }} className="w-full py-3">
                           <GitBranch size={12}/> DIBUJAR OTRA
                        </FMButton>
                        <FMButton variant="secondary" onClick={() => setArrowMenuSlot(null)} className="w-full py-3">CANCELAR</FMButton>
                     </div>
                  </div>
               </FMBox>
            </div>
         )}

         {/* Confirm Modal: Clear Selection */}
         {confirmAction && (
            <div className="fixed inset-0 z-[500] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm animate-overlay-in" onClick={() => setConfirmAction(null)}>
               <FMBox title="Borrar selección" className="w-full max-w-sm shadow-2xl border-2 border-slate-400">
                  <div className="p-6 space-y-6">
                     <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0"><Trash2 size={18} /></div>
                        <div>
                           <p className="text-xs font-black text-slate-900 uppercase leading-snug">Quitar todos los jugadores del campo</p>
                           <p className="text-[10px] text-slate-600 mt-1 leading-relaxed">Todos los puestos quedarán vacíos y podrás armar el once desde cero.</p>
                        </div>
                     </div>
                     <div className="flex gap-2">
                        <FMButton variant="secondary" onClick={() => setConfirmAction(null)} className="flex-1 py-3">CANCELAR</FMButton>
                        <FMButton variant="primary" onClick={() => { handleClearSelection(); setConfirmAction(null); }} className="flex-1 py-3">CONFIRMAR</FMButton>
                     </div>
                  </div>
               </FMBox>
            </div>
         )}

         {/* Save Modal */}
         {isSaveModalOpen && (
            <div className="fixed inset-0 z-[500] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm animate-overlay-in">
               <FMBox title="Guardar Esquema Táctico" className="w-full max-w-sm shadow-2xl border-2 border-slate-400">
                  <div className="p-6 space-y-6">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Nombre de la Táctica</label>
                        <input autoFocus type="text" className="w-full bg-white border border-[#a0b0a0] rounded-sm px-4 py-3 text-sm font-black uppercase outline-none focus:border-[#3a4a3a] shadow-inner text-slate-800" placeholder="Ej: 4-4-2 OFENSIVA..." value={newTacticName} onChange={(e) => setNewTacticName(e.target.value)} />
                     </div>
                     <div className="flex gap-2">
                        <FMButton variant="secondary" onClick={() => setIsSaveModalOpen(false)} className="flex-1 py-3">CANCELAR</FMButton>
                        <FMButton variant="primary" onClick={() => { if(newTacticName && activeTactic) { world.saveTactic(newTacticName, [...activeTactic.positions], { ...activeTactic.settings }); setIsSaveModalOpen(false); } }} className="flex-1 py-3">CONFIRMAR</FMButton>
                     </div>
                  </div>
               </FMBox>
             </div>
          )}
         </div>
    );
 };
