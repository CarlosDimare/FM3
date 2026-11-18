import React, { useState } from 'react';
import { Club } from '../types';
import { world } from '../services/worldManager';
import { notifyAll } from '../stores/worldStore';
import { FMButton } from './FMUI';
import { Building2, Award, Target, TrendingUp, ShieldCheck, Users, ArrowUp, Megaphone, DollarSign, Briefcase, FolderPlus, Landmark } from 'lucide-react';

interface BoardViewProps {
  userClub: Club;
  currentDate: Date;
}

const OBJECTIVE_LABELS: Record<string, string> = {
  WIN_LEAGUE: 'Ganar la Liga',
  TOP_4: 'Top 4 (europa)',
  WIN_CUP: 'Ganar la Copa',
  CUP_SEMIS: 'Semifinal de Copa',
  TOP_HALF: 'Mitad superior',
  AVOID_RELEGATION: 'Evitar el descenso',
};

type MeetingTopic = { id: string; label: string; icon: React.ReactNode };

const MEETING_TOPICS: MeetingTopic[] = [
  { id: 'FORM', label: 'Plantilla', icon: <Users size={11} /> },
  { id: 'OBJECTIVE', label: 'Objetivo', icon: <Target size={11} /> },
  { id: 'SUPPORT', label: 'Respaldo', icon: <ShieldCheck size={11} /> },
  { id: 'FUTURE', label: 'Largo plazo', icon: <TrendingUp size={11} /> },
];

const Section: React.FC<{ title: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-[#e8ece8] border border-[#a0b0a0] rounded-sm shadow-sm flex flex-col min-h-0 overflow-hidden ${className}`}>
    <div className="border-b border-[#a0b0a0] px-2 py-1 flex items-center justify-between gap-1 shrink-0" style={{ background: 'linear-gradient(to bottom, #cfd8cf 0%, #a3b4a3 100%)' }}>
      <span className="text-[#1a1a1a] font-bold text-[9px] tracking-tight uppercase truncate" style={{ fontFamily: 'Verdana, sans-serif' }}>{title}</span>
    </div>
    <div className="p-1 min-h-0">{children}</div>
  </div>
);

const MiniCard: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = 'text-slate-900' }) => (
  <div className="bg-white border border-slate-300 rounded-sm px-2 py-1.5">
    <div className="text-[7px] font-black text-slate-500 uppercase tracking-widest">{label}</div>
    <div className={`font-black text-[11px] leading-tight truncate ${color}`}>{value}</div>
  </div>
);

export const BoardView: React.FC<BoardViewProps> = ({ userClub, currentDate }) => {
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [objectiveDraft, setObjectiveDraft] = useState<string>(userClub.seasonObjective || 'TOP_HALF');
  const [meetingLog, setMeetingLog] = useState<{ topic: string; response: string; tone: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' }[]>([]);

  const refreshClub = () => notifyAll();

  const handleUpgrade = (facility: 'training' | 'youth') => {
    const result = world.requestFacilityUpgrade(userClub.id, facility, currentDate);
    setFeedback({ type: result.success ? 'success' : 'error', message: result.message });
    refreshClub();
  };

  const handleBudgetRequest = () => {
    const result = world.requestBudgetIncrease(userClub.id, currentDate);
    setFeedback({ type: result.success ? 'success' : 'error', message: result.message });
    refreshClub();
  };

  const handleObjectiveSubmit = () => {
    const result = world.setSeasonObjective(userClub.id, objectiveDraft as NonNullable<Club['seasonObjective']>, currentDate);
    setFeedback({ type: result.success ? 'success' : 'error', message: result.message });
    refreshClub();
  };

  const handleMeeting = (topic: MeetingTopic) => {
    const confidence = userClub.boardConfidence;
    const tone: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' = confidence >= 70 ? 'POSITIVE' : confidence >= 40 ? 'NEUTRAL' : 'NEGATIVE';
    let response = '';
    switch (topic.id) {
      case 'FORM':
        response = tone === 'POSITIVE'
          ? 'La junta confía en tu plantilla y te respaldará en el mercado.'
          : tone === 'NEUTRAL'
          ? 'La junta ve competente al equipo, pero pide más consistencia.'
          : 'La directiva cuestiona la competitividad de la plantilla actual.';
        break;
      case 'OBJECTIVE':
        response = tone === 'POSITIVE'
          ? 'La junta acepta debatir el objetivo contigo.'
          : tone === 'NEUTRAL'
          ? 'Escuchan tu propuesta, aunque los recursos son los que son.'
          : 'La junta rechaza revisar el objetivo: exigen cumplir lo pactado.';
        break;
      case 'SUPPORT':
        response = tone === 'POSITIVE'
          ? 'Te ratifican como el hombre del proyecto y te blindan ante la prensa.'
          : tone === 'NEUTRAL'
          ? 'Confirman su apoyo si los resultados acompañan.'
          : 'Dejan claro que el respaldo no es incondicional.';
        break;
      case 'FUTURE':
        response = tone === 'POSITIVE'
          ? 'Comparten tu visión: apuestan por un proyecto de 3 años.'
          : tone === 'NEUTRAL'
          ? 'Hablan de un plan de estabilidad sin sobresaltos.'
          : 'La directiva solo piensa en el corto plazo.';
        break;
    }
    setMeetingLog(prev => [{ topic: topic.label, response, tone }, ...prev].slice(0, 3));
    setFeedback(null);
  };

  const trainingCost = Math.round((userClub.trainingFacilities + 1) * (userClub.trainingFacilities + 1) * 50000);
  const youthCost = Math.round((userClub.youthFacilities + 1) * (userClub.youthFacilities + 1) * 50000);
  const requestedAmount = Math.round(userClub.finances.transferBudget * 0.3);

  const confidenceColor = userClub.boardConfidence >= 70 ? 'text-green-600' : userClub.boardConfidence >= 40 ? 'text-amber-600' : 'text-red-600';
  const profile = world.managerProfile;
  const folderCount = (userClub.transferFolderIds || []).length;

  return (
    <div className="p-2 h-full flex flex-col gap-2 bg-[#d4dcd4] overflow-hidden">
      <header className="shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-[#3a4a3a] rounded-sm text-white shrink-0"><Award size={15} /></div>
          <div className="min-w-0">
            <h2 className="text-base md:text-xl font-black text-slate-900 uppercase italic tracking-tighter truncate" style={{ fontFamily: 'Verdana, sans-serif' }}>Directiva</h2>
            <p className="hidden md:block text-slate-600 font-bold text-[9px] uppercase tracking-widest truncate">Propuestas a la junta de {userClub.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {folderCount > 0 && (
            <span className="flex items-center gap-1 text-[8px] font-black uppercase px-2 py-1 rounded-sm border bg-amber-50 border-amber-300 text-amber-800">
              <FolderPlus size={10} /> {folderCount}
            </span>
          )}
          <span className={`font-black text-base ${confidenceColor}`}>{Math.round(userClub.boardConfidence)}%</span>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-2 md:grid-cols-3 gap-1.5 content-start overflow-hidden">
        {/* Confianza */}
        <Section title="Confianza" className="col-span-2 md:col-span-1">
          <div className="h-3 bg-slate-300 rounded-sm overflow-hidden border border-slate-400 mb-1">
            <div
              className={`h-full transition-all ${userClub.boardConfidence >= 70 ? 'bg-green-500' : userClub.boardConfidence >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${userClub.boardConfidence}%` }}
            />
          </div>
          <p className="text-[7px] text-slate-500 italic leading-tight">
            {userClub.boardConfidence >= 70 ? 'Alta estima. Aceptarán tus peticiones.' :
             userClub.boardConfidence >= 40 ? 'Estabilidad normal.' :
             'Confianza baja. Peticiones en riesgo.'}
          </p>
        </Section>

        {/* Objetivo */}
        <Section title="Objetivo de temporada" className="col-span-2 md:col-span-2">
          <div className="flex gap-1">
            <select
              value={objectiveDraft}
              onChange={(e) => setObjectiveDraft(e.target.value)}
              className="flex-1 min-w-0 bg-white border border-[#a0b0a0] rounded-sm px-1.5 py-1 text-[9px] font-black uppercase text-slate-800 outline-none focus:border-[#3a4a3a]"
            >
              {Object.entries(OBJECTIVE_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
            <FMButton onClick={handleObjectiveSubmit} className="text-[9px] shrink-0 px-2 py-1">
              <Target size={11} /> Proponer
            </FMButton>
          </div>
        </Section>

        {/* Finanzas + presupuesto */}
        <Section title="Saldo, fichajes y presupuesto" className="col-span-2">
          <div className="grid grid-cols-2 gap-1 mb-1">
            <MiniCard label="Saldo" value={`$${userClub.finances.balance.toLocaleString()}`} />
            <MiniCard label="Presup. Fichajes" value={`$${userClub.finances.transferBudget.toLocaleString()}`} color="text-green-700" />
          </div>
          <div className="flex items-center justify-between gap-1 bg-white border border-slate-300 rounded-sm px-1.5 py-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Landmark size={11} className="text-[#3a4a3a] shrink-0" />
              <span className="text-[8px] font-black uppercase truncate">Aumento 30%: <span className="text-green-700">${requestedAmount.toLocaleString()}</span></span>
            </div>
            <FMButton onClick={handleBudgetRequest} variant="primary" className="text-[8px] px-1.5 py-0.5 shrink-0">
              <DollarSign size={9} /> Pedir
            </FMButton>
          </div>
        </Section>

        {/* Instalaciones */}
        <Section title="Mejoras de instalaciones" className="col-span-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-1 bg-white border border-slate-300 rounded-sm px-1.5 py-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <Building2 size={11} className="text-[#3a4a3a] shrink-0" />
                <span className="text-[8px] font-black uppercase truncate">Entren. {userClub.trainingFacilities}/20</span>
                <span className="text-[7px] text-slate-500 hidden md:inline">${trainingCost.toLocaleString()}</span>
              </div>
              <FMButton onClick={() => handleUpgrade('training')} disabled={userClub.trainingFacilities >= 20 || userClub.finances.balance < trainingCost} className="text-[8px] px-1.5 py-0.5 shrink-0">
                <ArrowUp size={9} /> Mejorar
              </FMButton>
            </div>
            <div className="flex items-center justify-between gap-1 bg-white border border-slate-300 rounded-sm px-1.5 py-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <Users size={11} className="text-[#3a4a3a] shrink-0" />
                <span className="text-[8px] font-black uppercase truncate">Juveniles {userClub.youthFacilities}/20</span>
                <span className="text-[7px] text-slate-500 hidden md:inline">${youthCost.toLocaleString()}</span>
              </div>
              <FMButton onClick={() => handleUpgrade('youth')} disabled={userClub.youthFacilities >= 20 || userClub.finances.balance < youthCost} className="text-[8px] px-1.5 py-0.5 shrink-0">
                <ArrowUp size={9} /> Mejorar
              </FMButton>
            </div>
          </div>
        </Section>

        {/* Reuniones */}
        <Section title="Reunión con la directiva" className="col-span-2 md:col-span-2">
          <div className="grid grid-cols-2 gap-1">
            {MEETING_TOPICS.map(topic => (
              <button
                key={topic.id}
                onClick={() => handleMeeting(topic)}
                className="flex items-center gap-1 bg-white border border-[#a0b0a0] hover:border-[#3a4a3a] hover:bg-[#f2f7f2] rounded-sm px-2 py-1.5 text-[8px] font-black uppercase text-slate-700 transition-all text-left"
              >
                <span className="text-[#3a4a3a] shrink-0">{topic.icon}</span> {topic.label}
              </button>
            ))}
          </div>
          {meetingLog.length > 0 && (
            <div className="mt-1 space-y-1">
              {meetingLog.slice(0, 1).map((entry, i) => (
                <div key={i} className={`border-l-4 rounded-sm px-2 py-1 text-[8px] font-bold ${entry.tone === 'POSITIVE' ? 'border-green-500 bg-green-50 text-green-900' : entry.tone === 'NEUTRAL' ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-red-500 bg-red-50 text-red-900'}`}>
                  <div className="text-[7px] font-black uppercase tracking-widest opacity-70 mb-0.5">Acta · {entry.topic}</div>
                  {entry.response}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Tu cargo */}
        <Section title="Tu cargo en el club" className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-sm px-2 py-1.5">
            <div className="p-1.5 bg-[#e8ece8] border border-[#a0b0a0] rounded-sm text-[#3a4a3a] shrink-0">
              <Briefcase size={12} />
            </div>
            <div className="min-w-0">
              <div className="text-[8px] font-black uppercase text-slate-900 truncate">{profile?.currentClubName || userClub.name}</div>
              <div className="text-[7px] text-slate-600 font-bold truncate">Entrenador · {profile?.seasonInClub || 1}ª temporada</div>
            </div>
            <Megaphone size={12} className="text-slate-300 shrink-0 ml-auto" />
          </div>
        </Section>
      </div>

      {feedback && (
        <div className={`shrink-0 px-2 py-1.5 rounded-sm border ${feedback.type === 'success' ? 'bg-green-100 border-green-400 text-green-900' : 'bg-red-100 border-red-400 text-red-900'} text-[9px] font-bold`}>
          {feedback.message}
        </div>
      )}
    </div>
  );
};