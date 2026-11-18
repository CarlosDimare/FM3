import React, { useEffect, useState } from 'react';
import { Club, Player } from '../types';
import { Play, Clipboard, ShieldCheck, AlertOctagon, Info, Settings } from 'lucide-react';
import { FMBox, FMButton } from './FMUI';
import { useDialogueStore } from '../stores/dialogueStore';
import { detectManagerInitiatedTriggers } from '../services/playerDialogueTriggers';
import { DialogueAvatar } from './dialogs/DialogueAvatar';
import { checkAssistantTrigger } from '../services/dialogueTriggers';

interface PreMatchViewProps {
  club: Club;
  opponent: Club;
  starters: Player[];
  opponentStarters: Player[];
  onStart: () => void;
  onGoToTactics: () => void;
  nextFixture?: import('../types').Fixture;
}

export const PreMatchView: React.FC<PreMatchViewProps> = ({ club, opponent, starters, opponentStarters, onStart, onGoToTactics, nextFixture }) => {
  const invalidStarters = starters.filter(p => p.injury || (p.suspension && p.suspension.matchesLeft > 0));
  const hasInvalidStarters = invalidStarters.length > 0;
  const isReady = starters.length === 11 && !hasInvalidStarters;

  const assistantTrigger = checkAssistantTrigger({
    currentView: 'PRE_MATCH',
    currentDate: new Date(),
    userClubId: club.id,
    nextFixture,
  });

  useEffect(() => {
    detectManagerInitiatedTriggers(club.id, 'PRE_MATCH');
  }, [club.id]);

  const validOpponentStarters = opponentStarters.length >= 11 ? opponentStarters : opponentStarters;
  const [page, setPage] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipe = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipe && page === 0) setPage(1);
    if (distance < -minSwipe && page === 1) setPage(0);
  };

  const renderFormation = (title: string, players: Player[], clubLabel: string, clubColor: string) => (
    <div className="flex flex-col h-full">
      <h3 className="text-slate-600 font-black uppercase text-[10px] tracking-widest mb-4 flex items-center gap-2 border-b border-[#a0b0a0] pb-2">
        <Clipboard size={14}/> {title}
      </h3>
      <div className="space-y-1 flex-1 overflow-y-auto">
        {players.length === 0 ? (
          <div className="p-12 border-2 border-dashed border-[#a0b0a0] rounded-sm bg-[#f2f7f2] text-center text-slate-600 font-black italic uppercase tracking-widest text-[10px]">Alineación no definida</div>
        ) : (
          players.sort((a,b) => (a.tacticalPosition || 0) - (b.tacticalPosition || 0)).map(p => (
            <div key={p.id} className={`flex items-center justify-between p-3 rounded-sm border-b transition-colors ${p.injury || p.suspension ? 'bg-red-50 border-red-200' : 'bg-[#f2f7f2] border-[#a0b0a0]'}`}>
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-sm flex items-center justify-center text-[9px] font-black text-white shrink-0 ${clubColor}`}>{p.positions[0]}</span>
                <div className="flex flex-col">
                   <span className="text-slate-900 font-black uppercase text-xs italic">{p.name}</span>
                   {(p.injury || p.suspension) && <span className="text-[8px] text-red-700 font-black uppercase">No disponible</span>}
                </div>
              </div>
              <span className="text-slate-900 font-black text-[10px]">{(p.currentAbility/20).toFixed(1)} ★</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#d4dcd4] overflow-hidden" style={{ fontFamily: 'Verdana, sans-serif' }}>
      <div className="flex-1 overflow-hidden relative">
         <div
           className="flex h-full transition-transform duration-300 ease-out"
           style={{ transform: `translateX(-${page * 100}%)` }}
           onTouchStart={onTouchStart}
           onTouchMove={onTouchMove}
           onTouchEnd={onTouchEnd}
         >
            <div className="w-full shrink-0 h-full overflow-y-auto custom-scroll p-4 sm:p-10">
               <div className="max-w-3xl mx-auto bg-white md:rounded-sm border-x md:border border-[#a0b0a0] shadow-2xl overflow-hidden flex flex-col min-h-[500px]">
                  <div className="p-6 sm:p-8 bg-[#e8ece8] border-b border-[#a0b0a0] flex items-center justify-between shrink-0">
                     <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white font-black text-lg sm:text-2xl shadow-lg border-2 border-white ${club.primaryColor} ${club.primaryColor === 'bg-white' ? 'text-slate-900 border-[#a0b0a0]' : ''}`}>{club.shortName}</div>
                        <div>
                           <h2 className="text-lg sm:text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Tu Formación</h2>
                           <p className="text-slate-700 font-black text-[9px] sm:text-[11px] uppercase tracking-[0.2em]">{club.name}</p>
                        </div>
                     </div>
                  </div>
                  <div className="p-4 sm:p-6 flex-1">
                     {renderFormation('Tu Formación', starters, club.name, club.primaryColor)}
                  </div>
               </div>
            </div>
            <div className="w-full shrink-0 h-full overflow-y-auto custom-scroll p-4 sm:p-10">
               <div className="max-w-3xl mx-auto bg-white md:rounded-sm border-x md:border border-[#a0b0a0] shadow-2xl overflow-hidden flex flex-col min-h-[500px]">
                  <div className="p-6 sm:p-8 bg-[#e8ece8] border-b border-[#a0b0a0] flex items-center justify-between shrink-0">
                     <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white font-black text-lg sm:text-2xl shadow-lg border-2 border-white ${opponent.primaryColor} ${opponent.primaryColor === 'bg-white' ? 'text-slate-900 border-[#a0b0a0]' : ''}`}>{opponent.shortName}</div>
                        <div>
                           <h2 className="text-lg sm:text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Formación Rival</h2>
                           <p className="text-slate-700 font-black text-[9px] sm:text-[11px] uppercase tracking-[0.2em]">{opponent.name}</p>
                        </div>
                     </div>
                  </div>
                  <div className="p-4 sm:p-6 flex-1">
                     {renderFormation('Formación Rival', validOpponentStarters, opponent.name, opponent.primaryColor)}
                  </div>
               </div>
            </div>
         </div>
         {/* Pagination dots */}
         <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-10">
            <button onClick={() => setPage(0)} className={`w-2 h-2 rounded-full transition-colors ${page === 0 ? 'bg-[#3a4a3a]' : 'bg-slate-400'}`} />
            <button onClick={() => setPage(1)} className={`w-2 h-2 rounded-full transition-colors ${page === 1 ? 'bg-[#3a4a3a]' : 'bg-slate-400'}`} />
         </div>
      </div>
      {club && (
        <DialogueAvatar
          clubColor={club.primaryColor}
          cargo="Ayudante de Campo"
          badge={assistantTrigger}
          onClick={() => useDialogueStore.getState().open('ASSISTANT', { clubId: club.id, opponentId: opponent.id, source: 'PRE_MATCH' })}
        />
      )}
    </div>
  );
};
