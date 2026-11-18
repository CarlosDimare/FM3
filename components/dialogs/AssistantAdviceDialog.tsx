import React, { useMemo, useEffect, useState } from 'react';
import { world } from '../../services/worldManager';
import { generateUUID } from '../../services/utils';
import { useGameStore } from '../../stores/gameStore';
import { useDialogueStore } from '../../stores/dialogueStore';
import {
  generateTacticAdvice, applyTacticPreset, generateLineupAdvice, applyLineup,
  getTacticalStaff, TacticArchetype,
} from '../../services/staffAdviceService';
import { notifyTactics } from '../../stores/worldStore';
import { CharacterDialog } from './CharacterDialog';
import { SpeechBubble } from './SpeechBubble';
import { LineupPitch } from './LineupPitch';
import { FMButton } from '../FMUI';

interface AssistantAdviceDialogProps {
  onStartMatch?: () => void;
}

type DialogPhase = 'recommendation' | 'alternatives' | 'lineup';

export const AssistantAdviceDialog: React.FC<AssistantAdviceDialogProps> = ({ onStartMatch }) => {
  const { kind, phase, selection, data, advance, select, close, setClosingPhrase } = useDialogueStore();
  const [localPhase, setLocalPhase] = useState<DialogPhase>('recommendation');
  const [selectedAlt, setSelectedAlt] = useState<TacticArchetype | null>(null);
  const nextFixture = useGameStore(s => s.nextFixture);
  const currentDate = useGameStore(s => s.currentDate);

  useEffect(() => {
    if (kind === 'ASSISTANT' && phase === 'opening') {
      const timer = setTimeout(() => advance(), 250);
      return () => clearTimeout(timer);
    }
  }, [kind, phase, advance]);

  useEffect(() => {
    if (phase === 'closing') {
      const timer = setTimeout(() => {
        const fromTactics = data?.source === 'TACTICS';
        close();
        if (!fromTactics) onStartMatch?.();
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [phase, close, onStartMatch, data?.source]);

  const recordEffects = (accion: string) => {
    if (!currentDate) return;
    world.addInboxMessage('SQUAD', 'Consejo del staff', `${staffName}: ${accion}`, currentDate, tacticalStaff?.id);
    world.recordInteraction({
      id: generateUUID(),
      date: currentDate,
      channel: 'COACH_STAFF',
      actorId: 'COACH',
      targetId: tacticalStaff?.id || club.id,
      type: 'TACTICAL_ADVICE',
      tone: 'MODERATE',
      result: 'POSITIVE',
      moraleChange: 0,
      tensionChange: 0,
      description: accion,
    });
  };

  const applySelectedTactic = (arch: TacticArchetype) => {
    const tactics = world.getTactics();
    const tactic = (data?.tacticId && tactics.find(t => t.id === data.tacticId)) || tactics[0];
    if (!tactic) return;
    applyTacticPreset(tactic, arch);
    if (advice.formacionRecomendada && advice.formacionRecomendada.id !== tactic.id) {
      const targetTactic = tactics.find(t => t.id === advice.formacionRecomendada!.id) || tactics[0];
      if (targetTactic) {
        targetTactic.settings = { ...tactic.settings };
        targetTactic.positions = [...advice.formacionRecomendada.positions];
        notifyTactics();
      }
    }
    recordEffects(`Aplicó el plan táctico ${arch} con formación ${advice.formacionNombre || tactic.id}.`);
    if (tacticalStaff) {
      const staff = world.getStaff(tacticalStaff.id);
      if (staff) staff.siguioConsejoUltimaVez = true;
    }
  };

  const handleAcceptRecommendation = () => {
    applySelectedTactic(advice.recomendacion);
    setLocalPhase('lineup');
  };

  const handleShowAlternatives = () => {
    setLocalPhase('alternatives');
  };

  const handleSelectAlternative = () => {
    if (!selectedAlt) return;
    applySelectedTactic(selectedAlt);
    setLocalPhase('lineup');
  };

  const clubId = data?.clubId;
  const club = clubId ? world.getClub(clubId) : undefined;
  const opponentId = data?.opponentId || (nextFixture && clubId
    ? (nextFixture.homeTeamId === clubId ? nextFixture.awayTeamId : nextFixture.homeTeamId)
    : undefined);
  const opponent = opponentId ? world.getClub(opponentId) : undefined;

  const tacticalStaff = clubId ? getTacticalStaff(clubId, data?.staffId) : null;
  const staffRole = tacticalStaff?.role || 'ASSISTANT_MANAGER';
  const staffName = tacticalStaff?.name || 'El Asistente';
  const staffTitle = staffRole === 'RESERVE_MANAGER' ? 'Entrenador Reserva'
    : staffRole === 'YOUTH_MANAGER' ? 'Entrenador Sub-20'
    : 'Ayudante de Campo';
  const iniciales = staffName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const clubPrimary = club?.primaryColor || 'bg-[#3a4a3a]';
  const clubBorder = club?.primaryColor ? club.primaryColor.replace('bg-', 'border-') : 'border-[#3a4a3a]';

  const advice = useMemo(() => {
    const raw = club ? generateTacticAdvice(club, opponent, data?.squad || 'SENIOR', tacticalStaff || undefined) : null;
    if (!raw || !tacticalStaff) return raw;
    if (tacticalStaff.siguioConsejoUltimaVez && selection) {
      const lastArch = selection as TacticArchetype;
      raw.textoPrincipal = `La última vez fuimos con ${lastArch === 'CONSERVATIVE' ? 'Conservador' : lastArch === 'RISKY' ? 'Arriesgado' : 'Equilibrado'} y salió bien. ¿repetimos o probamos algo nuevo?`;
    }
    return raw;
  }, [club?.id, opponent?.id, tacticalStaff?.siguioConsejoUltimaVez, tacticalStaff?.id, tacticalStaff?.preferredFormation, selection, data?.squad]);

  const lineup = useMemo(
    () => (club ? generateLineupAdvice(club, data?.squad || 'SENIOR') : null),
    [club?.id, localPhase, data?.squad],
  );

  if (kind !== 'ASSISTANT' || !club || !advice || !lineup) return null;

  const cargoMostrado = staffRole === 'RESERVE_MANAGER' ? 'Entrenador Reserva'
    : staffRole === 'YOUTH_MANAGER' ? 'Entrenador Sub-20'
    : 'Segundo Entrenador · Ayudante de Campo';

  const handleAceptarOnce = () => {
    applyLineup(club.id, lineup.xi, data?.squad || 'SENIOR');
    const arch = (selection as TacticArchetype) || advice.recomendacion;
    const formacion = advice.formacionNombre || '4-4-2';
    recordEffects(`Confirmó el once inicial para el próximo partido.`);
    setClosingPhrase(arch === 'CONSERVATIVE' ? `Dale, vamos con Conservador. Cerramos filas y esperamos el momento. Formación: ${formacion}.`
      : arch === 'RISKY' ? `Dale, vamos con Arriesgado. A por todas desde el primer minuto. Formación: ${formacion}.`
      : `Dale, vamos con Equilibrado. Nos vemos en la cancha. Formación: ${formacion}.`);
  };

  const handleAceptarYPartido = () => {
    handleAceptarOnce();
    onStartMatch?.();
  };

  const handleVolverConsejo = () => {
    setLocalPhase('recommendation');
    setSelectedAlt(null);
  };

  const alternativeOptions = advice.opciones.filter(op => op.id !== advice.recomendacion);

  const archetypeMeta: Record<TacticArchetype, { titulo: string; descripcion: string; efectos: string[] }> = {
    CONSERVATIVE: {
      titulo: 'Conservador',
      descripcion: 'Cerrar filas y golpear de contra.',
      efectos: ['Cierra líneas y protege el área', 'Contraataque como arma principal', 'Menos presión y línea defensiva baja'],
    },
    BALANCED: {
      titulo: 'Equilibrado',
      descripcion: 'Mantener la estructura actual.',
      efectos: ['Sin cambios radicales', 'Juego posicional', 'Presión y línea en valores medios'],
    },
    RISKY: {
      titulo: 'Arriesgado',
      descripcion: 'Presión total y juego vertical.',
      efectos: ['Presión alta y línea adelantada', 'Juego directo hacia el área', 'Riesgo en transiciones defensivas'],
    },
  };

  const renderArchetypeCard = (arch: TacticArchetype, isRecommended: boolean, isSelected: boolean) => {
    const meta = archetypeMeta[arch];
    return (
      <div
        className={`p-3 rounded-sm border-2 bg-white transition-all ${
          isSelected ? 'border-[#3a4a3a] shadow-md' : 'border-[#a0b0a0]'
        } ${isRecommended ? 'ring-1 ring-[#3a4a3a]/30' : ''}`}
      >
        {isRecommended && (
          <div className="bg-[#3a4a3a] text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm mb-2 inline-block">
            Recomendado
          </div>
        )}
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-900">{meta.titulo}</p>
        <p className="text-[9px] font-bold text-slate-500 mt-0.5 leading-snug">{meta.descripcion}</p>
        <ul className="mt-2 space-y-1">
          {meta.efectos.map((ef, j) => (
            <li key={j} className="flex items-start gap-1.5 text-[9px] font-bold text-slate-600 leading-snug">
              <span className="text-green-700 shrink-0 mt-0.5">✓</span> {ef}
            </li>
          ))}
        </ul>
        {isRecommended && (
          <p className="mt-2 pt-2 border-t border-[#a0b0a0]/40 text-[9px] italic font-bold text-slate-600 leading-snug">
            {advice.justificacion}
          </p>
        )}
      </div>
    );
  };

  return (
    <CharacterDialog
      nombre={staffName}
      cargo={cargoMostrado}
      iniciales={iniciales}
      clubColor={clubPrimary}
      onClose={close}
      footer={phase === 'closing' ? null : (localPhase === 'lineup' ? (
        <>
          <FMButton variant="primary" onClick={handleAceptarOnce} className="px-6 py-2.5 text-[10px]">
            Aceptar once
          </FMButton>
          {onStartMatch ? (
            <FMButton variant="secondary" onClick={handleAceptarYPartido} className="px-6 py-2.5 text-[10px]">
              Aceptar e ir al partido
            </FMButton>
          ) : (
            <FMButton variant="secondary" onClick={handleVolverConsejo} className="px-6 py-2.5 text-[10px]">
              Volver al consejo
            </FMButton>
          )}
        </>
      ) : localPhase === 'recommendation' ? (
        <>
          <FMButton variant="primary" onClick={handleAcceptRecommendation} className="px-6 py-2.5 text-[10px]">
            Sí, vamos con esa
          </FMButton>
          <FMButton variant="secondary" onClick={handleShowAlternatives} className="px-6 py-2.5 text-[10px]">
            No, probemos otra
          </FMButton>
        </>
      ) : (
        <>
          <FMButton variant="primary" onClick={handleSelectAlternative} disabled={!selectedAlt} className="px-6 py-2.5 text-[10px]">
            Confirmar
          </FMButton>
          <FMButton variant="secondary" onClick={handleVolverConsejo} className="px-6 py-2.5 text-[10px]">
            Volver
          </FMButton>
        </>
      ))}
      quickReplies={undefined}
    >
      {phase === 'closing' ? (
        <div className="space-y-4 pt-2 animate-fade-up">
          <SpeechBubble texto={useDialogueStore.getState().closingPhrase || ''} />
          <p className="text-[9px] italic font-bold text-slate-500 uppercase tracking-widest px-1">
            Los cambios quedaron aplicados al plan táctico del plantel.
          </p>
        </div>
      ) : localPhase === 'recommendation' ? (
        <div className="space-y-4">
          <SpeechBubble
            texto={advice.textoPrincipal}
            subtitulo="Informe basado en el estado de ambos planteles"
          />
          {advice.formacionNombre && (
            <div className="bg-[#3a4a3a] text-white p-3 rounded-sm flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest opacity-80">Formación Recomendada</span>
                <p className="text-sm font-black uppercase">{advice.formacionNombre}</p>
              </div>
            </div>
          )}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Estilo Recomendado</p>
            {renderArchetypeCard(advice.recomendacion, true, true)}
          </div>
        </div>
      ) : localPhase === 'alternatives' ? (
        <div className="space-y-4">
          <SpeechBubble
            texto="Entiendo. Tenemos otras dos opciones sobre la mesa. Elegí con cuál seguimos."
            subtitulo="Alternativas disponibles"
          />
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Otras Opciones</p>
            <div className="flex flex-col sm:flex-row gap-3">
              {alternativeOptions.map(op => (
                <div
                  key={op.id}
                  onClick={() => setSelectedAlt(op.id)}
                  className={`flex-1 cursor-pointer transition-all ${
                    selectedAlt === op.id ? 'ring-2 ring-[#3a4a3a] shadow-md' : ''
                  }`}
                >
                  {renderArchetypeCard(op.id, false, selectedAlt === op.id)}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <SpeechBubble
            texto={lineup.textoPaso2}
            subtitulo={lineup.resumen}
          />
          <LineupPitch
            clubId={club.id}
            clubColor={clubPrimary}
            xi={lineup.xi}
            banquillo={lineup.banquillo}
          />
        </div>
      )}
    </CharacterDialog>
  );
};
