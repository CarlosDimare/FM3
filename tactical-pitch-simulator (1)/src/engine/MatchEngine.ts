import { FORMATIONS } from './formations';
import { soundEngine } from './soundEngine';
import {
  BallState,
  ClubPreset,
  GaitMode,
  HEATMAP_COLS,
  HEATMAP_ROWS,
  HEATMAP_SIZE,
  MatchEvent,
  MatchEventType,
  MatchPhase,
  MatchSnapshot,
  PassLink,
  PlayerInstruction,
  PlayerMatchState,
  ShoutType,
  ShotRecord,
  TeamSide,
  TeamStats,
  TeamTactics,
  XgTimelinePoint,
} from '../types/match';

export const PITCH_LENGTH = 105; // x: -52.5 to +52.5
export const PITCH_WIDTH = 68;   // z: -34 to +34
export const HALF_L = PITCH_LENGTH / 2; // 52.5
export const HALF_W = PITCH_WIDTH / 2;  // 34
export const GOAL_HALF_WIDTH = 3.66;
export const GOAL_HEIGHT = 2.44;
const GOAL_DEPTH = 2.2;
const POST_RADIUS = 0.065;
const BALL_RADIUS = 0.11;
const BALL_MASS = 0.43; // kg (FIFA Size 5 regulation)
const AIR_DENSITY = 1.225; // kg/m³
const BALL_CROSS_SECTION = Math.PI * BALL_RADIUS * BALL_RADIUS;
const DRAG_COEFF_FACTOR = (AIR_DENSITY * BALL_CROSS_SECTION) / (2 * BALL_MASS);
const MATCH_CLOCK_RATE = 10.0; // 10 match seconds per 1 real second at 1x

interface TurfSurfaceProps {
  restitution: number;
  rollingDecay: number;
  coulombFriction: number;
  spinGrip: number;
  microJitter: number;
}

function createEmptyStats(): TeamStats {
  return {
    possessionSeconds: 0,
    possessionPct: 50,
    shots: 0,
    shotsOnTarget: 0,
    shotsBlocked: 0,
    xg: 0,
    xgot: 0,
    xa: 0,
    bigChances: 0,
    corners: 0,
    fouls: 0,
    offsides: 0,
    yellowCards: 0,
    redCards: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    keyPasses: 0,
    progressivePasses: 0,
    passesIntoBox: 0,
    finalThirdPasses: 0,
    crossesAttempted: 0,
    crossesCompleted: 0,
    reboundsRecovered: 0,
    progressiveCarries: 0,
    dribblesAttempted: 0,
    dribblesCompleted: 0,
    tacklesWon: 0,
    interceptions: 0,
    clearances: 0,
    groundDuelsWon: 0,
    groundDuelsLost: 0,
    aerialDuelsWon: 0,
    aerialDuelsLost: 0,
    saves: 0,
    ppda: 0,
    oppBuildPassesForPpda: 0,
    defActionsForPpda: 0,
    fieldTiltPct: 50,
    territorialThirds: [1, 1, 1],
    attackChannels: [1, 1, 1],
    zoneActivity: new Array(9).fill(0),
    heatmap: new Array(HEATMAP_SIZE).fill(0),
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function dist2D(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dz * dz);
}

export class MatchEngine {
  public phase: MatchPhase = 'first_half';
  public clockSeconds = 0;
  public addedTime = 2;
  public homeScore = 0;
  public awayScore = 0;
  public homeClub: ClubPreset;
  public awayClub: ClubPreset;
  public homeTactics: TeamTactics;
  public awayTactics: TeamTactics;
  public homePlayers: PlayerMatchState[] = [];
  public awayPlayers: PlayerMatchState[] = [];
  public homeStats: TeamStats = createEmptyStats();
  public awayStats: TeamStats = createEmptyStats();
  public homeSubsUsed = 0;
  public awaySubsUsed = 0;
  public homeShoutCooldown = 0;
  public awayAiCooldown = 120;
  public lastBannerEvent: MatchEvent | null = null;
  public bannerTimer = 0;
  public events: MatchEvent[] = [];
  public shots: ShotRecord[] = [];
  public xgTimeline: XgTimelinePoint[] = [{ minute: 0, homeXg: 0, awayXg: 0 }];
  public passMap = new Map<string, PassLink>();
  public ball: BallState;
  public homeOffsideLineX = -15;
  public awayOffsideLineX = 15;
  public momentum = 0;

  private lastLoggedMinute = 0;
  private eventCounter = 0;
  private shotCounter = 0;
  private transitionTimer = 0;
  private lastPossessionSide: TeamSide | null = null;
  private pendingRestartPos: { x: number; z: number } | null = null;
  private windX = (Math.random() - 0.5) * 1.8;
  private windZ = (Math.random() - 0.5) * 1.8;
  private goalNetDelayTimer = 0;
  private goalScoredLock = false;
  private pendingKickoffTeam: TeamSide | null = null;
  private postBounceCooldown = 0;
  public telemetryAnomalies = 0;
  private telemetrySampleTimer = 0;
  private telemetryAnomalyList: string[] = [];
  private lastGoalClock = -999;

  // Pre-allocated active lists & off-ball decision cache (zero GC per substep)
  private activeHome: PlayerMatchState[] = [];
  private activeAway: PlayerMatchState[] = [];
  private activeAll: PlayerMatchState[] = [];
  private offBallDecisionTimer = 0;
  private lastDecisionOwnerKey = '';
  private offBallPlan = new Map<
    string,
    {
      tx: number;
      tz: number;
      gait: GaitMode;
      intent: PlayerMatchState['intent'];
      faceX: number;
      faceZ: number;
      hasFace: boolean;
    }
  >();

  // Zero-alloc ring buffer for raw 0.25s + event telemetry frames (formatted only when viewed/copied)
  private rawFrames: {
    clockSeconds: number;
    minute: number;
    homeScore: number;
    awayScore: number;
    phase: MatchPhase;
    tag: string;
    detected: string | null;
    bx: number;
    by: number;
    bz: number;
    bpx: number;
    bpy: number;
    bpz: number;
    bvx: number;
    bvy: number;
    bvz: number;
    bsx: number;
    bsy: number;
    bsz: number;
    ownerId: string | null;
    setPiece: BallState['setPiece'];
    setPieceTeam: TeamSide;
    setPieceTimer: number;
    isShotInFlight: boolean;
    netDelay: number;
    lock: boolean;
    home: {
      number: number;
      shortName: string;
      role: PlayerMatchState['assignedRole'];
      x: number;
      y: number;
      z: number;
      vx: number;
      vz: number;
      gait: GaitMode;
      mode: PlayerMatchState['carrierMode'];
      intent: PlayerMatchState['intent'];
    }[];
    away: {
      number: number;
      shortName: string;
      role: PlayerMatchState['assignedRole'];
      x: number;
      y: number;
      z: number;
      vx: number;
      vz: number;
      gait: GaitMode;
      mode: PlayerMatchState['carrierMode'];
      intent: PlayerMatchState['intent'];
    }[];
  }[] = [];
  private rawFrameHead = 0;
  private rawFrameCount = 0;
  private cachedTelemetryFrames: string[] = [];
  private telemetryCacheDirty = false;

  public get telemetryFrames(): string[] {
    if (this.telemetryCacheDirty) {
      this.rebuildTelemetryFrameStrings();
    }
    return this.cachedTelemetryFrames;
  }

  constructor(homeClub: ClubPreset, awayClub: ClubPreset) {
    this.homeClub = homeClub;
    this.awayClub = awayClub;
    this.homeTactics = { ...homeClub.defaultTactics };
    this.awayTactics = { ...awayClub.defaultTactics };
    this.ball = this.createInitialBall();
    this.initSquads();
    this.setupKickoff('home', true);
  }

  private lastErrorSide: TeamSide | null = null;
  private lastErrorPlayerId: string | null = null;
  private lastErrorTimer = 0;
  private pressingTriggerTimer = 0;
  private reboundTimer = 0;
  private reboundShotSide: TeamSide | null = null;
  private intendedPassTargetId: string | null = null;
  private playerById = new Map<string, PlayerMatchState>();
  private shotElapsed = 0;

  private createInitialBall(): BallState {
    return {
      x: 0,
      y: 0.11,
      z: 0,
      prevX: 0,
      prevY: 0.11,
      prevZ: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      spinX: 0,
      spinY: 0,
      spinZ: 0,
      knuckleSeed: Math.random() * Math.PI * 2,
      ownerId: null,
      lastTouchTeam: null,
      lastTouchPlayerId: null,
      lastPasserId: null,
      lastPassWasKeyCandidate: false,
      lastPassWasCross: false,
      lastPassOriginX: 0,
      lastPassOriginZ: 0,
      lastPassTimestamp: 0,
      isShotInFlight: false,
      shotTeam: null,
      shotXgot: 0,
      shotTargetY: 1.0,
      shotTargetZ: 0,
      setPiece: 'kickoff',
      setPieceTeam: 'home',
      setPieceTimer: 1.0,
      netRippleLeft: 0,
      netRippleRight: 0,
    };
  }

  public resetMatch(homeClub: ClubPreset, awayClub: ClubPreset) {
    this.homeClub = homeClub;
    this.awayClub = awayClub;
    this.homeTactics = { ...homeClub.defaultTactics };
    this.awayTactics = { ...awayClub.defaultTactics };
    this.phase = 'first_half';
    this.clockSeconds = 0;
    this.addedTime = 2;
    this.homeScore = 0;
    this.awayScore = 0;
    this.homeStats = createEmptyStats();
    this.awayStats = createEmptyStats();
    this.homeSubsUsed = 0;
    this.awaySubsUsed = 0;
    this.homeShoutCooldown = 0;
    this.awayAiCooldown = 120;
    this.lastBannerEvent = null;
    this.bannerTimer = 0;
    this.events = [];
    this.shots = [];
    this.xgTimeline = [{ minute: 0, homeXg: 0, awayXg: 0 }];
    this.passMap.clear();
    this.lastLoggedMinute = 0;
    this.transitionTimer = 0;
    this.lastPossessionSide = null;
    this.momentum = 0;
    this.windX = (Math.random() - 0.5) * 1.8;
    this.windZ = (Math.random() - 0.5) * 1.8;
    this.goalNetDelayTimer = 0;
    this.goalScoredLock = false;
    this.pendingKickoffTeam = null;
    this.postBounceCooldown = 0;
    this.rawFrameHead = 0;
    this.rawFrameCount = 0;
    this.cachedTelemetryFrames = [];
    this.telemetryCacheDirty = false;
    this.offBallDecisionTimer = 0;
    this.lastDecisionOwnerKey = '';
    this.telemetryAnomalies = 0;
    this.telemetrySampleTimer = 0;
    this.telemetryAnomalyList = [];
    this.lastGoalClock = -999;
    this.intendedPassTargetId = null;
    this.ball = this.createInitialBall();
    this.initSquads();
    this.setupKickoff('home', true);
  }

  private initSquads() {
    const homeSlots = FORMATIONS[this.homeTactics.formation];
    const awaySlots = FORMATIONS[this.awayTactics.formation];

    const buildPlayer = (
      p: ClubPreset['squad'][number],
      idx: number,
      side: TeamSide,
      slots: typeof homeSlots
    ): PlayerMatchState => ({
      ...p,
      side,
      slotIndex: idx,
      assignedRole: idx < 11 ? slots[idx].role : p.naturalRole,
      instruction: 'equilibrado',
      onPitch: idx < 11,
      subbedOff: false,
      x: side === 'home' ? -10 : 10,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      facing: side === 'home' ? 0 : Math.PI,
      headYaw: 0,
      stridePhase: Math.random() * Math.PI * 2,
      kickAnimTimer: 0,
      lastKickFoot: p.foot === 'I' ? 'I' : 'D',
      diveAnimTimer: 0,
      diveDir: 0,
      diveHeight: 1.0,
      isJumping: false,
      slideTimer: 0,
      slideCooldown: 0,
      slideDirX: 0,
      slideDirZ: 0,
      stumbleTimer: 0,
      stamina: 100,
      morale: 78,
      rating: 6.4,
      minutesPlayed: 0,
      goals: 0,
      assists: 0,
      shots: 0,
      shotsOnTarget: 0,
      passesAttempted: 0,
      passesCompleted: 0,
      keyPasses: 0,
      progressivePasses: 0,
      progressiveCarries: 0,
      dribblesAttempted: 0,
      dribblesCompleted: 0,
      tacklesWon: 0,
      interceptions: 0,
      clearances: 0,
      shotsBlocked: 0,
      groundDuelsWon: 0,
      groundDuelsLost: 0,
      aerialDuelsWon: 0,
      aerialDuelsLost: 0,
      saves: 0,
      xgotFaced: 0,
      goalsConceded: 0,
      foulsCommitted: 0,
      foulsWon: 0,
      yellowCards: 0,
      redCard: false,
      injured: false,
      knockSeverity: 0,
      crossesAttempted: 0,
      crossesCompleted: 0,
      xgGenerated: 0,
      xgotGenerated: 0,
      xa: 0,
      errorsLeadingToShot: 0,
      distanceMeters: 0,
      sprints: 0,
      touches: 0,
      avgX: 0,
      avgZ: 0,
      heatmap: new Array(HEATMAP_SIZE).fill(0),
      intent: idx === 0 ? 'portero' : 'posicional',
      intentTimer: Math.random() * 0.6,
      gaitMode: 'trote',
      carrierMode: 'none',
      carrierModeTimer: 0,
      carryCommitTimer: 0,
      carryStartX: 0,
      carryStartZ: 0,
      scanTurnTarget: side === 'home' ? 0 : Math.PI,
      curveBias: idx % 2 === 0 ? 1 : -1,
      feintTimer: 0,
      feintDir: 1,
      pausaTimer: 0,
      dribbleTouchTimer: 0,
      giveAndGoTimer: 0,
      reactionTimer: 0,
      actionCooldown: 0,
      targetX: 0,
      targetZ: 0,
    });

    this.homePlayers = this.homeClub.squad.map((p, idx) => buildPlayer(p, idx, 'home', homeSlots));
    this.awayPlayers = this.awayClub.squad.map((p, idx) => buildPlayer(p, idx, 'away', awaySlots));
    this.offBallPlan.clear();
    this.playerById.clear();
    for (const p of this.homePlayers) {
      this.playerById.set(p.id, p);
      this.offBallPlan.set(p.id, {
        tx: p.x,
        tz: p.z,
        gait: 'carrera',
        intent: 'posicional',
        faceX: 0,
        faceZ: 0,
        hasFace: false,
      });
    }
    for (const p of this.awayPlayers) {
      this.playerById.set(p.id, p);
      this.offBallPlan.set(p.id, {
        tx: p.x,
        tz: p.z,
        gait: 'carrera',
        intent: 'posicional',
        faceX: 0,
        faceZ: 0,
        hasFace: false,
      });
    }
  }

  // Attack direction: +1 attacks +52.5 (right), -1 attacks -52.5 (left)
  public getAttackDir(side: TeamSide): 1 | -1 {
    const firstHalf = this.phase === 'first_half' || this.phase === 'pre_kickoff' || this.phase === 'half_time';
    if (firstHalf) {
      return side === 'home' ? 1 : -1;
    }
    return side === 'home' ? -1 : 1;
  }

  public getDisplayMinute(): number {
    return Math.min(120, Math.floor(this.clockSeconds / 60));
  }

  private addEvent(
    type: MatchEventType,
    title: string,
    description: string,
    side?: TeamSide,
    playerName?: string,
    assistName?: string,
    showBanner = false
  ) {
    const rawMin = Math.floor(this.clockSeconds / 60);
    const halfLimit = this.phase === 'second_half' || this.phase === 'full_time' ? 90 : 45;
    const minute = Math.min(halfLimit, rawMin);
    const added = rawMin > halfLimit ? rawMin - halfLimit : 0;

    const ev: MatchEvent = {
      id: `ev-${++this.eventCounter}`,
      minute,
      addedTime: added,
      type,
      side,
      playerName,
      assistName,
      title,
      description,
    };
    this.events.unshift(ev);
    if (this.events.length > 140) this.events.pop();

    if (showBanner) {
      this.lastBannerEvent = ev;
      this.bannerTimer = 4.2;
    }
  }

  private setupKickoff(team: TeamSide, isPeriodStart = false) {
    this.goalScoredLock = false;
    this.goalNetDelayTimer = 0;
    this.pendingKickoffTeam = null;
    this.ball.x = 0;
    this.ball.y = 0.11;
    this.ball.z = 0;
    this.ball.prevX = 0;
    this.ball.prevY = 0.11;
    this.ball.prevZ = 0;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.vz = 0;
    this.ball.spinX = 0;
    this.ball.spinY = 0;
    this.ball.spinZ = 0;
    this.ball.ownerId = null;
    this.ball.isShotInFlight = false;
    this.ball.shotTeam = null;
    this.ball.lastPasserId = null;
    this.intendedPassTargetId = null;
    this.ball.setPiece = 'kickoff';
    this.ball.setPieceTeam = team;
    this.ball.setPieceTimer = isPeriodStart ? 0.8 : 1.1;

    // Position players in their own halves
    const positionTeam = (players: PlayerMatchState[], side: TeamSide) => {
      const dir = this.getAttackDir(side);
      const tactics = side === 'home' ? this.homeTactics : this.awayTactics;
      const slots = FORMATIONS[tactics.formation];
      players.forEach((p) => {
        if (!p.onPitch || p.redCard) return;
        const slot = slots[Math.min(10, p.slotIndex)];
        let px = -dir * HALF_L + dir * (slot.xNorm * HALF_L * 0.92);
        let pz = slot.zNorm * PITCH_WIDTH * 0.9;
        if (side === team && p.slotIndex === 9) {
          px = -dir * 0.6;
          pz = 0;
        }
        if (side !== team && Math.abs(px) < 9.5) {
          px = -dir * 10.5;
        }
        p.x = px;
        p.z = pz;
        p.vx = 0;
        p.vz = 0;
        p.facing = dir === 1 ? 0 : Math.PI;
        p.intent = p.assignedRole === 'POR' ? 'portero' : 'posicional';
        p.gaitMode = 'trote';
      });
    };

    this.offBallPlan.clear();
    positionTeam(this.homePlayers, 'home');
    positionTeam(this.awayPlayers, 'away');
    this.recordTelemetryFrame('KICKOFF');

    if (isPeriodStart) {
      if (this.clockSeconds < 5) {
        this.addEvent(
          'kickoff',
          'Inicio del partido',
          `Rueda el balón en el ${this.homeClub.stadiumName}. ${this.homeClub.name} frente a ${this.awayClub.name}.`,
          team,
          undefined,
          undefined,
          true
        );
        soundEngine.playWhistle('short');
      } else {
        this.addEvent(
          'kickoff',
          'Comienza la 2ª parte',
          `Se reanuda el encuentro tras el descanso.`,
          team,
          undefined,
          undefined,
          true
        );
        soundEngine.playWhistle('short');
      }
    }
  }

  public startSecondHalf() {
    if (this.phase !== 'half_time') return;
    this.phase = 'second_half';
    this.clockSeconds = 45 * 60;
    this.addedTime = 2 + Math.floor(Math.random() * 3);
    this.goalScoredLock = false;
    this.goalNetDelayTimer = 0;
    this.pendingKickoffTeam = null;
    this.setupKickoff('away', true);
  }

  public updateHomeTactics(partial: Partial<TeamTactics>) {
    const prevFormation = this.homeTactics.formation;
    this.homeTactics = { ...this.homeTactics, ...partial };
    if (partial.formation && partial.formation !== prevFormation) {
      const slots = FORMATIONS[partial.formation];
      this.homePlayers
        .filter((p) => p.onPitch && !p.redCard)
        .forEach((p) => {
          if (slots[p.slotIndex]) {
            p.assignedRole = slots[p.slotIndex].role;
          }
        });
      this.addEvent(
        'tactical_change',
        `Cambio de dibujo: ${partial.formation}`,
        `${this.homeClub.shortCode} ajusta su sistema táctico a ${partial.formation}.`,
        'home',
        undefined,
        undefined,
        true
      );
    }
  }

  public updatePlayerInstruction(playerId: string, instruction: PlayerInstruction) {
    const p = this.homePlayers.find((pl) => pl.id === playerId);
    if (!p) return;
    p.instruction = instruction;
  }

  public swapHomeSlots(playerAId: string, playerBId: string) {
    const a = this.homePlayers.find((p) => p.id === playerAId);
    const b = this.homePlayers.find((p) => p.id === playerBId);
    if (!a || !b || a.id === b.id) return;
    const tempSlot = a.slotIndex;
    const tempRole = a.assignedRole;
    a.slotIndex = b.slotIndex;
    a.assignedRole = b.assignedRole;
    b.slotIndex = tempSlot;
    b.assignedRole = tempRole;
  }

  public makeSubstitution(side: TeamSide, outPlayerId: string, inPlayerId: string): boolean {
    const players = side === 'home' ? this.homePlayers : this.awayPlayers;
    const subsUsed = side === 'home' ? this.homeSubsUsed : this.awaySubsUsed;
    if (subsUsed >= 5) return false;

    const outP = players.find((p) => p.id === outPlayerId && p.onPitch && !p.redCard);
    const inP = players.find((p) => p.id === inPlayerId && !p.onPitch && !p.subbedOff);
    if (!outP || !inP) return false;

    outP.onPitch = false;
    outP.subbedOff = true;
    if (this.ball.ownerId === outP.id) {
      this.ball.ownerId = null;
    }

    inP.onPitch = true;
    inP.slotIndex = outP.slotIndex;
    inP.assignedRole = outP.assignedRole;
    inP.instruction = outP.instruction;
    inP.x = outP.x;
    inP.z = Math.sign(outP.z || 1) * Math.min(HALF_W - 1, Math.abs(outP.z) + 2);
    inP.stamina = 100;
    inP.morale = 84;

    if (side === 'home') this.homeSubsUsed += 1;
    else this.awaySubsUsed += 1;

    const club = side === 'home' ? this.homeClub : this.awayClub;
    this.addEvent(
      'substitution',
      `Sustitución (${club.shortCode})`,
      `Entra ${inP.shortName} (#${inP.number}) por ${outP.shortName} (#${outP.number}).`,
      side,
      inP.shortName,
      outP.shortName,
      true
    );
    return true;
  }

  public triggerShout(shout: ShoutType) {
    if (this.homeShoutCooldown > 0) return;
    this.homeShoutCooldown = 300; // 5 match minutes cooldown

    let label = '';
    let desc = '';
    let moraleBoost = 5;

    switch (shout) {
      case 'animar':
        label = 'Grito: ¡Ánimo!';
        desc = 'Pides más confianza y empuje desde la banda. Sube la moral del equipo.';
        moraleBoost = 7;
        break;
      case 'concentracion':
        label = 'Grito: ¡Concentración!';
        desc = 'Exiges rigor defensivo y cero concesiones en las marcas.';
        moraleBoost = 4;
        break;
      case 'presionar':
        label = 'Grito: ¡Presionad arriba!';
        desc = 'Ordenas adelantar la línea de presión para asfixiar la salida rival.';
        this.homeTactics.pressing = 'gegenpress';
        moraleBoost = 5;
        break;
      case 'calma':
        label = 'Grito: ¡Calma y posesión!';
        desc = 'Pides pausar el ritmo y asegurar cada entrega.';
        this.homeTactics.tempo = 'pausado';
        this.homeTactics.passing = 'corto';
        moraleBoost = 4;
        break;
      case 'atacar':
        label = 'Grito: ¡A por el gol!';
        desc = 'El equipo adelanta líneas buscando verticalidad inmediata.';
        this.homeTactics.mentality = 'ofensiva';
        this.homeTactics.tempo = 'alto';
        moraleBoost = 6;
        break;
    }

    this.homePlayers
      .filter((p) => p.onPitch && !p.redCard)
      .forEach((p) => {
        p.morale = clamp(p.morale + moraleBoost, 35, 100);
      });

    this.addEvent('shout', label, desc, 'home', undefined, undefined, true);
  }

  // Main fixed-step advancement with 4x sub-stepping capability for Swept-Sphere CCD
  public step(realDt: number, speedMultiplier: number) {
    if (this.phase === 'half_time' || this.phase === 'full_time' || this.phase === 'pre_kickoff') {
      if (this.bannerTimer > 0) this.bannerTimer = Math.max(0, this.bannerTimer - realDt);
      return;
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - realDt);
      if (this.bannerTimer === 0) this.lastBannerEvent = null;
    }

    const clampedRealDt = Math.min(realDt, 0.05);
    const totalSimDt = clampedRealDt * speedMultiplier;
    const subSteps = Math.max(2, Math.ceil(totalSimDt / 0.012));
    const dt = totalSimDt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      if (this.stepPhysics(dt)) break;
    }
  }

  private stepPhysics(dt: number): boolean {
    this.clockSeconds += dt * MATCH_CLOCK_RATE;
    if (this.homeShoutCooldown > 0) {
      this.homeShoutCooldown = Math.max(0, this.homeShoutCooldown - dt * MATCH_CLOCK_RATE);
    }
    if (this.lastErrorTimer > 0) {
      this.lastErrorTimer = Math.max(0, this.lastErrorTimer - dt);
    }
    if (this.pressingTriggerTimer > 0) {
      this.pressingTriggerTimer = Math.max(0, this.pressingTriggerTimer - dt);
    }
    if (this.reboundTimer > 0) {
      this.reboundTimer = Math.max(0, this.reboundTimer - dt);
    }
    if (this.ball.isShotInFlight) {
      this.shotElapsed += dt;
    } else {
      this.shotElapsed = 0;
    }

    const currentMin = Math.floor(this.clockSeconds / 60);
    if (currentMin > this.lastLoggedMinute) {
      this.lastLoggedMinute = currentMin;
      this.xgTimeline.push({
        minute: currentMin,
        homeXg: Number(this.homeStats.xg.toFixed(2)),
        awayXg: Number(this.awayStats.xg.toFixed(2)),
      });
      this.runAwayManagerAI(currentMin);
      this.recalculateRatings();
    }

    this.ball.netRippleLeft = Math.max(0, this.ball.netRippleLeft - dt * 1.8);
    this.ball.netRippleRight = Math.max(0, this.ball.netRippleRight - dt * 1.8);
    if (this.postBounceCooldown > 0) {
      this.postBounceCooldown = Math.max(0, this.postBounceCooldown - dt);
    }

    this.telemetrySampleTimer += dt;
    if (this.telemetrySampleTimer >= 0.25) {
      this.telemetrySampleTimer = 0;
      this.recordTelemetryFrame('TICK');
    }

    if (this.goalNetDelayTimer > 0) {
      this.goalNetDelayTimer -= dt;
      if (this.goalNetDelayTimer <= 0) {
        this.goalNetDelayTimer = 0;
        const nextTeam = this.pendingKickoffTeam || 'home';
        this.pendingKickoffTeam = null;
        this.setupKickoff(nextTeam, false);
        return false;
      }
      this.updateBall(dt);
      return false;
    }

    const halfEnd = 45 * 60 + this.addedTime * 60;
    const fullEnd = 90 * 60 + this.addedTime * 60;
    if (
      this.phase === 'first_half' &&
      this.clockSeconds >= halfEnd &&
      !this.ball.isShotInFlight &&
      this.goalNetDelayTimer <= 0
    ) {
      this.phase = 'half_time';
      soundEngine.playWhistle('double');
      this.addEvent(
        'halftime',
        'Descanso',
        `Final de la primera parte. ${this.homeClub.shortCode} ${this.homeScore} - ${this.awayScore} ${this.awayClub.shortCode}.`,
        undefined,
        undefined,
        undefined,
        true
      );
      return true;
    }
    if (
      this.phase === 'second_half' &&
      this.clockSeconds >= fullEnd &&
      !this.ball.isShotInFlight &&
      this.goalNetDelayTimer <= 0
    ) {
      this.phase = 'full_time';
      soundEngine.playWhistle('fulltime');
      this.addEvent(
        'fulltime',
        'Final del partido',
        `Pitido final. Resultado definitivo: ${this.homeClub.name} ${this.homeScore} - ${this.awayScore} ${this.awayClub.name}.`,
        undefined,
        undefined,
        undefined,
        true
      );
      return true;
    }

    this.refreshActiveLists();
    this.updateOffsideLines();
    this.updateTelemetry(dt);

    if (this.ball.setPiece !== 'open_play') {
      this.ball.setPieceTimer -= dt;
      this.updateSetPiecePositioning(dt);
      if (this.ball.setPieceTimer <= 0) {
        this.executeSetPiece();
      }
      return false;
    }

    this.updatePlayers(dt);
    this.resolvePlayerCollisions(dt);
    this.updateBall(dt);
    return false;
  }

  private refreshActiveLists() {
    this.activeHome.length = 0;
    this.activeAway.length = 0;
    this.activeAll.length = 0;
    for (let i = 0; i < this.homePlayers.length; i++) {
      const p = this.homePlayers[i];
      if (p.onPitch && !p.redCard) {
        this.activeHome.push(p);
        this.activeAll.push(p);
      }
    }
    for (let i = 0; i < this.awayPlayers.length; i++) {
      const p = this.awayPlayers[i];
      if (p.onPitch && !p.redCard) {
        this.activeAway.push(p);
        this.activeAll.push(p);
      }
    }
  }

  private updateOffsideLines() {
    const calcLine = (players: PlayerMatchState[], dir: 1 | -1): number => {
      let firstX = Infinity;
      let secondX = Infinity;
      let secondPlayer: PlayerMatchState | null = null;
      let firstPlayer: PlayerMatchState | null = null;
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        const metric = p.x * dir;
        if (metric < firstX) {
          secondX = firstX;
          secondPlayer = firstPlayer;
          firstX = metric;
          firstPlayer = p;
        } else if (metric < secondX) {
          secondX = metric;
          secondPlayer = p;
        }
      }
      const secondLast = secondPlayer || firstPlayer;
      if (!secondLast) return -dir * 20;
      const fatigueLag = secondLast.stamina < 52 ? -dir * 0.55 : 0;
      return secondLast.x + fatigueLag;
    };
    this.homeOffsideLineX = calcLine(this.activeHome, this.getAttackDir('home'));
    this.awayOffsideLineX = calcLine(this.activeAway, this.getAttackDir('away'));
  }

  private recordPlayerHeatmapAndAverage(p: PlayerMatchState) {
    const dir = this.getAttackDir(p.side);
    const normX = clamp((p.x * dir + HALF_L) / PITCH_LENGTH, 0, 0.999);
    const normZ = clamp((p.z * dir + HALF_W) / PITCH_WIDTH, 0, 0.999);
    const col = Math.floor(normX * HEATMAP_COLS);
    const row = Math.floor(normZ * HEATMAP_ROWS);
    const idx = row * HEATMAP_COLS + col;
    p.heatmap[idx] += 1;
    const teamStats = p.side === 'home' ? this.homeStats : this.awayStats;
    teamStats.heatmap[idx] += 1;

    p.touches += 1;
    p.avgX = p.avgX + (p.x * dir - p.avgX) / p.touches;
    p.avgZ = p.avgZ + (p.z * dir - p.avgZ) / p.touches;
  }

  private recalculateRatings() {
    const scoreSide = (list: PlayerMatchState[]) => {
      for (const p of list) {
        if (!p.onPitch && !p.subbedOff) continue;
        let base = 6.3;
        base += p.goals * 0.95;
        base += p.assists * 0.62;
        base += p.keyPasses * 0.16;
        base += p.progressivePasses * 0.045;
        base += p.progressiveCarries * 0.05;
        base += p.dribblesCompleted * 0.09;
        base += p.tacklesWon * 0.11;
        base += p.interceptions * 0.08;
        base += p.clearances * 0.04;
        base += p.aerialDuelsWon * 0.05 - p.aerialDuelsLost * 0.03;
        base += p.groundDuelsWon * 0.04 - p.groundDuelsLost * 0.03;
        if (p.passesAttempted >= 6) {
          const acc = p.passesCompleted / p.passesAttempted;
          base += (acc - 0.72) * 0.9;
        }
        if (p.assignedRole === 'POR') {
          base += p.saves * 0.24 + (p.xgotFaced - p.goalsConceded) * 0.45;
        }
        base -= p.foulsCommitted * 0.08;
        base -= p.yellowCards * 0.25;
        base -= p.errorsLeadingToShot * 0.45;
        p.rating = clamp(Number(base.toFixed(1)), 5.2, 10.0);
      }
    };
    scoreSide(this.homePlayers);
    scoreSide(this.awayPlayers);
  }

  private updateTelemetry(dt: number) {
    const owner = this.findPlayerById(this.ball.ownerId);
    const activeTeam = owner ? owner.side : this.ball.lastTouchTeam;

    if (activeTeam === 'home') {
      this.homeStats.possessionSeconds += dt;
      const dir = this.getAttackDir('home');
      const normX = (this.ball.x * dir + HALF_L) / PITCH_LENGTH;
      const third = normX < 0.333 ? 0 : normX < 0.667 ? 1 : 2;
      this.homeStats.territorialThirds[third] += dt;
      const relZ = this.ball.z * dir;
      const channel = relZ < -11.33 ? 0 : relZ > 11.33 ? 2 : 1;
      this.homeStats.attackChannels[channel] += dt;
      this.homeStats.zoneActivity[third * 3 + channel] += dt;
    } else if (activeTeam === 'away') {
      this.awayStats.possessionSeconds += dt;
      const dir = this.getAttackDir('away');
      const normX = (this.ball.x * dir + HALF_L) / PITCH_LENGTH;
      const third = normX < 0.333 ? 0 : normX < 0.667 ? 1 : 2;
      this.awayStats.territorialThirds[third] += dt;
      const relZ = this.ball.z * dir;
      const channel = relZ < -11.33 ? 0 : relZ > 11.33 ? 2 : 1;
      this.awayStats.attackChannels[channel] += dt;
      this.awayStats.zoneActivity[third * 3 + channel] += dt;
    }

    const totalPoss = this.homeStats.possessionSeconds + this.awayStats.possessionSeconds;
    if (totalPoss > 0) {
      this.homeStats.possessionPct = Math.round((this.homeStats.possessionSeconds / totalPoss) * 100);
      this.awayStats.possessionPct = 100 - this.homeStats.possessionPct;
    }

    // Opta PPDA & Field Tilt live updates
    this.homeStats.ppda =
      this.homeStats.defActionsForPpda > 0
        ? Number((this.homeStats.oppBuildPassesForPpda / this.homeStats.defActionsForPpda).toFixed(1))
        : Number(this.homeStats.oppBuildPassesForPpda.toFixed(1));
    this.awayStats.ppda =
      this.awayStats.defActionsForPpda > 0
        ? Number((this.awayStats.oppBuildPassesForPpda / this.awayStats.defActionsForPpda).toFixed(1))
        : Number(this.awayStats.oppBuildPassesForPpda.toFixed(1));

    const totalFinalThird = this.homeStats.finalThirdPasses + this.awayStats.finalThirdPasses;
    if (totalFinalThird > 0) {
      this.homeStats.fieldTiltPct = Math.round((this.homeStats.finalThirdPasses / totalFinalThird) * 100);
      this.awayStats.fieldTiltPct = 100 - this.homeStats.fieldTiltPct;
    }

    if (activeTeam && activeTeam !== this.lastPossessionSide) {
      this.lastPossessionSide = activeTeam;
      this.transitionTimer = 5.0; // Authentic 5-second Gegenpress / transition burst
    } else if (this.transitionTimer > 0) {
      this.transitionTimer = Math.max(0, this.transitionTimer - dt);
    }

    const targetMom = owner
      ? (owner.side === 'home' ? 1 : -1) * clamp(Math.abs(this.ball.x) / HALF_L, 0.2, 1)
      : this.momentum * 0.99;
    this.momentum += (targetMom - this.momentum) * Math.min(1, dt * 0.6);
  }

  private findPlayerById(id: string | null): PlayerMatchState | undefined {
    if (!id) return undefined;
    return this.playerById.get(id);
  }

  private getTacticalAnchor(
    p: PlayerMatchState,
    teamHasBall: boolean,
    owner?: PlayerMatchState
  ): { x: number; z: number } {
    const tactics = p.side === 'home' ? this.homeTactics : this.awayTactics;
    const dir = this.getAttackDir(p.side);
    const slot = FORMATIONS[tactics.formation][Math.min(10, p.slotIndex)];
    const ballXNorm = clamp((this.ball.x * dir + HALF_L) / PITCH_LENGTH, 0, 1);

    if (p.assignedRole === 'POR') {
      const linePush =
        tactics.defensiveLine === 'adelantada' || tactics.defensiveLine === 'fuera_de_juego'
          ? 7.5
          : tactics.defensiveLine === 'normal'
          ? 4.0
          : 1.8;
      const sweeperSkill = (p.attributes.gk * 0.6 + p.attributes.pace * 0.4) / 100;
      const gkX = -dir * (HALF_L - 2.0 - ballXNorm * linePush * sweeperSkill);
      // Scale lateral tracking by ball proximity so opposite-end GK doesn't mirror the ball in lockstep
      const lateralTrack = clamp(0.24 - ballXNorm * 0.19, 0.04, 0.24);
      const gkZ = clamp(this.ball.z * lateralTrack, -3.8, 3.8);
      return { x: gkX, z: gkZ };
    }

    const mentalityShift: Record<TeamTactics['mentality'], number> = {
      muy_defensiva: -0.11,
      defensiva: -0.06,
      equilibrada: 0,
      ofensiva: 0.065,
      ataque_total: 0.125,
    };
    const defLineShift: Record<TeamTactics['defensiveLine'], number> = {
      muy_atras: -0.1,
      normal: 0,
      adelantada: 0.075,
      fuera_de_juego: 0.11,
    };
    const widthScale =
      tactics.width === 'estrecho' ? 0.78 : tactics.width === 'amplio' ? 1.16 : 0.98;

    // FM08 TT&F "Rule of One" progressive band mentality offset (keeps vertical lines connected)
    const roleRuleOffset: Record<PlayerMatchState['assignedRole'], number> = {
      POR: -0.05,
      DFC: -0.028,
      LI: -0.014,
      LD: -0.014,
      MCD: -0.012,
      CAR: 0.008,
      MC: 0.008,
      MCO: 0.022,
      EI: 0.024,
      ED: 0.024,
      DC: 0.036,
    };

    let xNorm = slot.xNorm;
    let zNorm = slot.zNorm * widthScale;

    if (teamHasBall) {
      // Attacking Phase: Rule of One progressive depth + Team Mentality
      xNorm += 0.07 + mentalityShift[tactics.mentality] + roleRuleOffset[p.assignedRole];

      // Build-up phase (Salida de balón)
      if (ballXNorm < 0.36 && tactics.playOutFromBack) {
        if (p.assignedRole === 'DFC') {
          zNorm *= 1.38; // Split CBs wide
          xNorm -= 0.03;
        } else if (p.assignedRole === 'LI' || p.assignedRole === 'LD' || p.assignedRole === 'CAR') {
          zNorm = Math.sign(zNorm || 1) * 0.43; // Fullbacks hug touchlines
          xNorm += 0.04;
        } else if (p.assignedRole === 'MCD') {
          xNorm = Math.max(0.24, xNorm - 0.07); // Drop to offer passing triangle
          zNorm = clamp(-this.ball.z / PITCH_WIDTH * 0.4, -0.12, 0.12);
        }
      }

      // Counter-attack vertical burst during transition
      if (tactics.counterAttack && this.transitionTimer > 0 && owner?.side === p.side) {
        if (p.assignedRole === 'DC' || p.assignedRole === 'EI' || p.assignedRole === 'ED' || p.assignedRole === 'MCO') {
          xNorm += 0.13;
        }
      }

      // Preferred-foot winger behavior & half-spaces vs wide channels (FM role realism)
      if (p.assignedRole === 'EI' || p.assignedRole === 'ED') {
        const isInverted =
          (p.assignedRole === 'EI' && p.foot === 'D') ||
          (p.assignedRole === 'ED' && p.foot === 'I');
        if (tactics.width === 'estrecho' || (isInverted && tactics.width !== 'amplio' && ballXNorm > 0.48)) {
          zNorm = Math.sign(zNorm || 1) * 0.21; // Inverted wingers tuck into half-spaces
        } else if (!isInverted || tactics.width === 'amplio') {
          zNorm = Math.sign(zNorm || 1) * 0.42; // Touchline wingers stretch the back line
        }
      }
      if (p.assignedRole === 'LI' || p.assignedRole === 'LD' || p.assignedRole === 'CAR') {
        const wingerRole = p.assignedRole === 'LI' ? 'EI' : p.assignedRole === 'LD' ? 'ED' : null;
        const sameSideWinger = wingerRole
          ? (p.side === 'home' ? this.homePlayers : this.awayPlayers).find(
              (m) => m.onPitch && m.assignedRole === wingerRole
            )
          : undefined;
        const wingerInverted =
          sameSideWinger &&
          ((sameSideWinger.assignedRole === 'EI' && sameSideWinger.foot === 'D') ||
            (sameSideWinger.assignedRole === 'ED' && sameSideWinger.foot === 'I'));
        if (
          tactics.mentality === 'ofensiva' ||
          tactics.mentality === 'ataque_total' ||
          tactics.width === 'estrecho' ||
          wingerInverted
        ) {
          xNorm += 0.095; // Overlap into outside lane when winger cuts inside
          zNorm = Math.sign(zNorm || 1) * 0.44;
        }
      }

      // Final third intelligence
      if (ballXNorm > 0.66) {
        if (p.assignedRole === 'MCD') {
          xNorm = Math.min(xNorm, 0.62); // Rest-defense screen at edge of box
        } else if (p.assignedRole === 'MCO') {
          xNorm = Math.max(xNorm, 0.74);
          zNorm = clamp(-this.ball.z / PITCH_WIDTH * 0.35, -0.16, 0.16);
        }
      }

      // Individual instructions
      if (p.instruction === 'subir_mas' || p.instruction === 'entrar_al_area') xNorm += 0.085;
      if (p.instruction === 'mantener_posicion') xNorm -= 0.06;
      if (p.instruction === 'libertad_creativa') {
        // Drift toward ball-side half-space to link play
        const ballZNorm = this.ball.z / PITCH_WIDTH;
        zNorm = zNorm * 0.6 + ballZNorm * 0.42;
      }

      // Rest-defense ball-side lateral shift & gentle organic sway (prevents vz=0.00 lockstep rails)
      const attBallZNorm = this.ball.z / PITCH_WIDTH;
      if (
        p.assignedRole === 'DFC' ||
        p.assignedRole === 'MCD' ||
        ((p.assignedRole === 'LI' || p.assignedRole === 'LD' || p.assignedRole === 'CAR') &&
          Math.sign(zNorm || 1) !== Math.sign(attBallZNorm || 1))
      ) {
        const restShift = p.assignedRole === 'MCD' ? 0.16 : 0.13;
        zNorm = zNorm * (1 - restShift * 0.55) + attBallZNorm * restShift;
      }
      xNorm += Math.sin(this.clockSeconds * 0.13 + p.slotIndex * 2.11) * 0.014;
      zNorm += Math.cos(this.clockSeconds * 0.11 + p.slotIndex * 1.67) * 0.016;
    } else {
      // Defending Phase: Cohesive Block & Ball-Side Shifting (Basculación)
      const compactness =
        tactics.pressing === 'bloque_bajo'
          ? 0.78
          : tactics.pressing === 'bloque_medio'
          ? 0.88
          : 1.02;

      xNorm = 0.22 + (xNorm - 0.22) * compactness - 0.06 + defLineShift[tactics.defensiveLine] * 0.75;
      if (p.instruction === 'mantener_posicion') xNorm -= 0.04;

      // Synchronized offside line for defenders
      if (
        tactics.defensiveLine === 'fuera_de_juego' &&
        (p.assignedRole === 'DFC' || p.assignedRole === 'LI' || p.assignedRole === 'LD')
      ) {
        xNorm = Math.max(xNorm, 0.24);
      }

      // Ball-side horizontal shift (basculación) with role-based variation to prevent robotic lockstep
      const ballZNorm = this.ball.z / PITCH_WIDTH;
      const isBallSide = Math.sign(zNorm || 1) === Math.sign(ballZNorm || 1);
      const zShiftWeight =
        p.assignedRole === 'DC'
          ? 0.21
          : p.assignedRole === 'EI' || p.assignedRole === 'ED'
          ? isBallSide
            ? 0.34
            : 0.22
          : isBallSide
          ? 0.38
          : 0.30;
      const zKeepWeight = 1 - zShiftWeight * 0.72;
      zNorm = zNorm * zKeepWeight + ballZNorm * zShiftWeight;

      // Subtle per-slot organic breathing offset so teammates don't glide in parallel lockstep
      xNorm += Math.sin(this.clockSeconds * 0.14 + p.slotIndex * 2.17) * 0.016;
      zNorm += Math.cos(this.clockSeconds * 0.12 + p.slotIndex * 1.73) * 0.022;
    }

    // Longitudinal team shift tied to ball X (forwards retain slight counter-outlet depth variation)
    const baseInfluence = teamHasBall ? 0.36 : p.assignedRole === 'DC' ? 0.38 : 0.46;
    const roleVar = ((p.slotIndex % 3) - 1) * 0.018;
    const ballInfluence = clamp(baseInfluence + roleVar, 0.28, 0.52);
    let finalXNorm = clamp(
      xNorm * (1 - ballInfluence) + (ballXNorm - 0.5 + xNorm) * ballInfluence,
      0.07,
      0.93
    );

    // Respect opponent offside line when attacking without ball
    if (teamHasBall) {
      const oppLine = p.side === 'home' ? this.awayOffsideLineX : this.homeOffsideLineX;
      const oppLineNorm = (oppLine * dir + HALF_L) / PITCH_LENGTH;
      // Smart attackers (high vision) hold their run just onside
      const onsideMargin = 0.012 + (1 - p.attributes.vision / 100) * 0.025;
      if (finalXNorm > oppLineNorm - onsideMargin && ballXNorm < oppLineNorm) {
        finalXNorm = oppLineNorm - onsideMargin;
      }
    }

    const worldX = -dir * HALF_L + dir * finalXNorm * PITCH_LENGTH;
    const worldZ = clamp(zNorm * PITCH_WIDTH, -HALF_W + 2.2, HALF_W - 2.2);

    return { x: worldX, z: worldZ };
  }

  private updatePlayers(dt: number) {
    const owner = this.findPlayerById(this.ball.ownerId);
    const homeHasBall = owner ? owner.side === 'home' : this.ball.lastTouchTeam === 'home';

    const homeActive = this.activeHome;
    const awayActive = this.activeAway;
    const allActive = this.activeAll;

    const decisionOwnerKey = `${this.ball.ownerId ?? 'free'}|${this.intendedPassTargetId ?? ''}|${this.ball.isShotInFlight ? 1 : 0}`;
    if (decisionOwnerKey !== this.lastDecisionOwnerKey) {
      this.lastDecisionOwnerKey = decisionOwnerKey;
      this.offBallDecisionTimer = 0;
    }

    this.offBallDecisionTimer -= dt;
    const runDecisionTick = this.offBallDecisionTimer <= 0;
    if (runDecisionTick) {
      this.offBallDecisionTimer = 0.10; // Scaled to compressed match clock (FM08 4 Hz equivalent without stale targets)
    }

    // Find top-3 nearest outfield pressers per team in O(N) without array allocations
    const findTop3Pressers = (
      list: PlayerMatchState[]
    ): [PlayerMatchState | null, PlayerMatchState | null, PlayerMatchState | null] => {
      let p1: PlayerMatchState | null = null;
      let p2: PlayerMatchState | null = null;
      let p3: PlayerMatchState | null = null;
      let d1 = Infinity;
      let d2 = Infinity;
      let d3 = Infinity;
      for (let i = 0; i < list.length; i++) {
        const pl = list[i];
        if (pl.assignedRole === 'POR') continue;
        const d = dist2D(pl.x, pl.z, this.ball.x, this.ball.z);
        if (d < d1) {
          d3 = d2;
          p3 = p2;
          d2 = d1;
          p2 = p1;
          d1 = d;
          p1 = pl;
        } else if (d < d2) {
          d3 = d2;
          p3 = p2;
          d2 = d;
          p2 = pl;
        } else if (d < d3) {
          d3 = d;
          p3 = pl;
        }
      }
      return [p1, p2, p3];
    };

    const [hPress1, hPress2, hPress3] = findTop3Pressers(homeActive);
    const [aPress1, aPress2, aPress3] = findTop3Pressers(awayActive);

    const carrier = owner;
    const isPressingTriggered = Boolean(
      carrier &&
        (carrier.carrierMode === 'trapping' ||
          carrier.carrierMode === 'shielding' ||
          carrier.dribbleTouchTimer > 0.16 ||
          Math.abs(carrier.z) > HALF_W - 7.5 ||
          this.pressingTriggerTimer > 0)
    );

    for (let i = 0; i < allActive.length; i++) {
      const p = allActive[i];
      p.minutesPlayed += (dt * MATCH_CLOCK_RATE) / 60;
      if (p.actionCooldown > 0) p.actionCooldown = Math.max(0, p.actionCooldown - dt);
      if (p.kickAnimTimer > 0) p.kickAnimTimer = Math.max(0, p.kickAnimTimer - dt);
      if (p.diveAnimTimer > 0) p.diveAnimTimer = Math.max(0, p.diveAnimTimer - dt);
      if (p.intentTimer > 0) p.intentTimer = Math.max(0, p.intentTimer - dt);
      if (p.carrierModeTimer > 0) p.carrierModeTimer = Math.max(0, p.carrierModeTimer - dt);
      if (p.carryCommitTimer > 0) p.carryCommitTimer = Math.max(0, p.carryCommitTimer - dt);
      if (p.feintTimer > 0) p.feintTimer = Math.max(0, p.feintTimer - dt);
      if (p.pausaTimer > 0) p.pausaTimer = Math.max(0, p.pausaTimer - dt);
      if (p.dribbleTouchTimer > 0) p.dribbleTouchTimer = Math.max(0, p.dribbleTouchTimer - dt);
      if (p.giveAndGoTimer > 0) p.giveAndGoTimer = Math.max(0, p.giveAndGoTimer - dt);
      if (p.reactionTimer > 0) p.reactionTimer = Math.max(0, p.reactionTimer - dt);
      if (p.slideCooldown > 0) p.slideCooldown = Math.max(0, p.slideCooldown - dt);
      if (p.stumbleTimer > 0) p.stumbleTimer = Math.max(0, p.stumbleTimer - dt);

      // Unconditional Vertical Jump Physics (fixes any leftover airborne p.y > 0)
      if (p.isJumping || p.y > 0) {
        p.vy -= 9.81 * dt;
        p.y += p.vy * dt;
        if (p.y <= 0) {
          p.y = 0;
          p.vy = 0;
          p.isJumping = false;
          if (p.intent === 'salto_aereo') {
            p.intent = 'posicional';
          }
        }
      }

      if (p.carrierMode === 'scanning') {
        p.headYaw = Math.sin(this.clockSeconds * 0.95 + p.slotIndex) * 0.62;
      } else {
        const angleToBall = Math.atan2(this.ball.z - p.z, this.ball.x - p.x);
        let relHead = angleToBall - p.facing;
        while (relHead > Math.PI) relHead -= Math.PI * 2;
        while (relHead < -Math.PI) relHead += Math.PI * 2;
        const clampedHead = clamp(relHead, -0.75, 0.75);
        p.headYaw += (clampedHead - p.headYaw) * Math.min(1, dt * 8);
      }

      if (p.stumbleTimer > 0) {
        p.intent = 'desequilibrio';
        p.gaitMode = 'trote';
        p.vx *= Math.max(0, 1 - dt * 6.5);
        p.vz *= Math.max(0, 1 - dt * 6.5);
        p.x = clamp(p.x + p.vx * dt, -HALF_L - 1.5, HALF_L + 1.5);
        p.z = clamp(p.z + p.vz * dt, -HALF_W - 1.5, HALF_W + 1.5);
        continue;
      }
      if (p.intent === 'desequilibrio') {
        p.intent = 'posicional';
      }

      if (p.slideTimer > 0) {
        p.slideTimer = Math.max(0, p.slideTimer - dt);
        p.intent = 'entrada';
        const slideSpeed = 6.8 * (p.slideTimer / 0.42 + 0.35);
        p.vx = p.slideDirX * slideSpeed;
        p.vz = p.slideDirZ * slideSpeed;
        p.x = clamp(p.x + p.vx * dt, -HALF_L - 1.5, HALF_L + 1.5);
        p.z = clamp(p.z + p.vz * dt, -HALF_W - 1.5, HALF_W + 1.5);
        p.facing = Math.atan2(p.slideDirZ, p.slideDirX);
        this.checkBallInteraction(p, dt);
        continue;
      }

      if (p.intent === 'entrada') {
        p.intent = 'posicional';
      }
      if (!p.isJumping && p.y <= 0.01 && p.intent === 'salto_aereo') {
        p.intent = 'posicional';
      }

      const isOwner = this.ball.ownerId === p.id;
      const teamHasBall = p.side === 'home' ? homeHasBall : !homeHasBall;
      const tactics = p.side === 'home' ? this.homeTactics : this.awayTactics;
      const dir = this.getAttackDir(p.side);
      const opps = p.side === 'home' ? awayActive : homeActive;

      const ballHorizSpeedSq = this.ball.vx * this.ball.vx + this.ball.vz * this.ball.vz;
      const passAge = this.clockSeconds - this.ball.lastPassTimestamp;
      const isFriendlyPassInFlight =
        !this.ball.ownerId &&
        !this.ball.isShotInFlight &&
        this.intendedPassTargetId !== null &&
        this.ball.lastTouchTeam === p.side &&
        passAge < 42 &&
        (ballHorizSpeedSq > 1.3 * 1.3 || this.ball.y > 0.35);
      const isIntendedReceiver = isFriendlyPassInFlight && this.intendedPassTargetId === p.id;

      if (isOwner) {
        this.handleBallCarrier(p, dt);
      } else {
        if (p.carrierMode !== 'none') {
          p.carrierMode = 'none';
          p.carrierModeTimer = 0;
          p.carryCommitTimer = 0;
        }
        if (p.assignedRole === 'POR') {
          this.updateGoalkeeper(p, dt);
        } else {
          const distToBall = dist2D(p.x, p.z, this.ball.x, this.ball.z);
          if (
            !this.ball.ownerId &&
            !p.isJumping &&
            p.y === 0 &&
            this.ball.y > 1.2 &&
            this.ball.y < 2.85 &&
            distToBall < 2.85 &&
            this.ball.vy < 2.8 &&
            p.actionCooldown <= 0
          ) {
            const jumpBoost =
              (p.attributes.physical / 100) * 1.45 + (p.attributes.defending / 100) * 0.45;
            p.vy = 3.25 + jumpBoost;
            p.isJumping = true;
            p.y = Math.max(p.y, p.vy * dt);
            p.intent = 'salto_aereo';
          }

          const press1 = p.side === 'home' ? hPress1 : aPress1;
          const press2 = p.side === 'home' ? hPress2 : aPress2;
          const press3 = p.side === 'home' ? hPress3 : aPress3;
          const isPrimaryPresser = press1?.id === p.id;
          const isSecondPresser = press2?.id === p.id;
          const isThirdPresser = press3?.id === p.id;

          let plan = this.offBallPlan.get(p.id);
          if (!plan) {
            plan = {
              tx: p.x,
              tz: p.z,
              gait: 'carrera',
              intent: 'posicional',
              faceX: 0,
              faceZ: 0,
              hasFace: false,
            };
            this.offBallPlan.set(p.id, plan);
          }

          // Passing team teammates NEVER chase their own pass in 'presion'; only intended receiver meets it.
          const isChasingLoose =
            !this.ball.ownerId &&
            (isIntendedReceiver ||
              (!isFriendlyPassInFlight &&
                (isPrimaryPresser || (isSecondPresser && distToBall < 10.5))));

          const isCloseActivePresser =
            !teamHasBall && isPrimaryPresser && distToBall < 9.5;
          const isFinalThirdAttacker =
            teamHasBall && p.x * dir > 22 && distToBall < 24;

          if (runDecisionTick || isChasingLoose || isCloseActivePresser || isFinalThirdAttacker) {
            const anchor = this.getTacticalAnchor(p, teamHasBall, owner);
            let tx = anchor.x;
            let tz = anchor.z;
            let hasFace = false;
            let faceX = this.ball.x;
            let faceZ = this.ball.z;

            if (isIntendedReceiver) {
              p.intent = p.isJumping ? 'salto_aereo' : 'apoyo_corto';
              hasFace = true;
              const bSpd = Math.hypot(this.ball.vx, this.ball.vz);
              const isAirBall = this.ball.y > 0.42 || this.ball.vy > 0.45;
              if (bSpd > 1.8) {
                const ux = this.ball.vx / bSpd;
                const uz = this.ball.vz / bSpd;
                const proj = (p.x - this.ball.x) * ux + (p.z - this.ball.z) * uz;
                if (isAirBall) {
                  const tAir = clamp(
                    (this.ball.vy +
                      Math.sqrt(
                        Math.max(0, this.ball.vy * this.ball.vy + 2 * 9.81 * Math.max(0, this.ball.y - 1.0))
                      )) /
                      9.81,
                    0.08,
                    1.25
                  );
                  tx = clamp(this.ball.x + this.ball.vx * tAir * 0.92, -HALF_L + 1.5, HALF_L - 1.5);
                  tz = clamp(this.ball.z + this.ball.vz * tAir * 0.92, -HALF_W + 1.5, HALF_W - 1.5);
                } else if (proj >= -0.5) {
                  // Actively step toward slow/medium ground passes on the front foot instead of standing still
                  if (proj < 3.4 || bSpd < 7.8) {
                    const quickLead = clamp(distToBall / Math.max(5.5, bSpd + 4.5), 0.05, 0.28);
                    tx = clamp(this.ball.x + this.ball.vx * quickLead, -HALF_L + 1.5, HALF_L - 1.5);
                    tz = clamp(this.ball.z + this.ball.vz * quickLead, -HALF_W + 1.5, HALF_W - 1.5);
                  } else {
                    const estReach = Math.max(2.5, bSpd * 0.88);
                    const meetS = clamp(proj * 0.56, 0.6, Math.min(estReach, Math.max(0.6, proj - 1.8)));
                    tx = clamp(this.ball.x + ux * meetS, -HALF_L + 1.5, HALF_L - 1.5);
                    tz = clamp(this.ball.z + uz * meetS, -HALF_W + 1.5, HALF_W - 1.5);
                  }
                } else {
                  const overLead = clamp(distToBall / Math.max(5, bSpd), 0.1, 0.42);
                  tx = clamp(this.ball.x + this.ball.vx * overLead, -HALF_L + 1.5, HALF_L - 1.5);
                  tz = clamp(this.ball.z + this.ball.vz * overLead, -HALF_W + 1.5, HALF_W - 1.5);
                }
              } else {
                tx = clamp(this.ball.x, -HALF_L + 1.5, HALF_L - 1.5);
                tz = clamp(this.ball.z, -HALF_W + 1.5, HALF_W - 1.5);
              }
            } else if (
              !this.ball.ownerId &&
              this.reboundTimer > 0 &&
              this.reboundShotSide === p.side &&
              p.x * dir > 25 &&
              distToBall < 14 &&
              (p.assignedRole === 'DC' || p.assignedRole === 'MCO' || p.assignedRole === 'EI' || p.assignedRole === 'ED')
            ) {
              p.intent = p.isJumping ? 'salto_aereo' : 'llegada_area';
              tx = this.ball.x + this.ball.vx * 0.22;
              tz = this.ball.z + this.ball.vz * 0.22;
            } else if (
              !this.ball.ownerId &&
              !isFriendlyPassInFlight &&
              (isPrimaryPresser || (isSecondPresser && distToBall < 10.5))
            ) {
              p.intent = p.isJumping ? 'salto_aereo' : 'presion';
              const lead = 0.22 + (p.attributes.vision / 100) * 0.28;
              tx = this.ball.x + this.ball.vx * lead;
              tz = this.ball.z + this.ball.vz * lead;
            } else if (!teamHasBall && owner) {
              const carrierInDefHalf = this.ball.x * dir < 4;
              const basePress =
                tactics.pressing === 'gegenpress'
                  ? 38
                  : tactics.pressing === 'presion_alta'
                  ? 30
                  : tactics.pressing === 'bloque_medio'
                  ? 22
                  : 15;
              const pressRange = carrierInDefHalf ? Math.max(basePress, 24) : basePress;
              const counterPressWindow =
                (tactics.pressing === 'gegenpress' || tactics.pressing === 'presion_alta') &&
                (this.transitionTimer > 2.0 || isPressingTriggered);
              const oppGoalThreat = Math.abs(this.ball.x - -dir * HALF_L) < 30;
              const isGoalSide = (p.x - this.ball.x) * dir < 0.8;

              if (
                (isPrimaryPresser && distToBall < pressRange) ||
                (counterPressWindow && (isSecondPresser || isThirdPresser) && distToBall < 16.5)
              ) {
                const shouldCommit =
                  tactics.pressing === 'gegenpress' ||
                  isPressingTriggered ||
                  oppGoalThreat ||
                  carrierInDefHalf ||
                  distToBall < 4.5 ||
                  !isGoalSide ||
                  owner.dribbleTouchTimer > 0.15;

                if (shouldCommit) {
                  p.intent = 'presion';
                  const toBallX = this.ball.x - p.x;
                  const toBallZ = this.ball.z - p.z;
                  const dPress = Math.max(0.5, Math.sqrt(toBallX * toBallX + toBallZ * toBallZ));
                  const perpX = -toBallZ / dPress;
                  const perpZ = toBallX / dPress;
                  const centerSign = this.ball.z >= 0 ? -1 : 1;
                  const arcMag = clamp((dPress - 2.2) * 0.34, 0, 3.4);
                  tx = this.ball.x - dir * 0.75 + perpX * centerSign * arcMag * 0.3;
                  tz = this.ball.z * 0.97 + (perpZ * centerSign > 0 ? 1 : -1) * arcMag * 0.6;

                  if (
                    isPrimaryPresser &&
                    distToBall > 1.15 &&
                    distToBall < 2.25 &&
                    p.slideCooldown <= 0 &&
                    p.actionCooldown <= 0 &&
                    owner.assignedRole !== 'POR' &&
                    (oppGoalThreat || Math.abs(this.ball.z) > 15 || p.instruction === 'marcaje_ferreo') &&
                    Math.random() < 0.055 * ((p.attributes.defending / 100) * 1.1)
                  ) {
                    const sLen = Math.max(0.2, Math.hypot(this.ball.x - p.x, this.ball.z - p.z));
                    p.slideDirX = (this.ball.x - p.x) / sLen;
                    p.slideDirZ = (this.ball.z - p.z) / sLen;
                    p.slideTimer = 0.42;
                    p.slideCooldown = 4.5;
                  }
                } else {
                  p.intent = 'temporizando';
                  const bx = -dir * HALF_L - this.ball.x;
                  const bz = 0 - this.ball.z;
                  const bLen = Math.max(1, Math.sqrt(bx * bx + bz * bz));
                  tx = this.ball.x + (bx / bLen) * 2.2;
                  tz = this.ball.z + (bz / bLen) * 2.2;
                  hasFace = true;
                }
              } else if (
                isSecondPresser &&
                (tactics.pressing === 'gegenpress' || tactics.pressing === 'presion_alta' || distToBall < 18) &&
                distToBall < pressRange * 0.95
              ) {
                p.intent = 'cobertura';
                let dangerOpp: PlayerMatchState | null = null;
                let dangerScore = -Infinity;
                for (let j = 0; j < opps.length; j++) {
                  const o = opps[j];
                  if (o.id === owner.id || o.assignedRole === 'POR') continue;
                  const sc = o.x * -dir;
                  if (sc > dangerScore) {
                    dangerScore = sc;
                    dangerOpp = o;
                  }
                }
                if (dangerOpp) {
                  tx = this.ball.x * 0.5 + dangerOpp.x * 0.5;
                  tz = this.ball.z * 0.5 + dangerOpp.z * 0.5;
                  hasFace = true;
                }
              } else {
                const trackRadius = p.instruction === 'marcaje_ferreo' ? 16 : 11;
                let runner: PlayerMatchState | null = null;
                let runnerDist = trackRadius;
                for (let j = 0; j < opps.length; j++) {
                  const o = opps[j];
                  if (o.assignedRole === 'POR' || o.id === owner.id) continue;
                  if (
                    o.intent !== 'desmarque_ruptura' &&
                    o.intent !== 'pared' &&
                    o.intent !== 'arrastre' &&
                    p.instruction !== 'marcaje_ferreo'
                  ) {
                    continue;
                  }
                  const dAnc = dist2D(o.x, o.z, anchor.x, anchor.z);
                  if (dAnc < runnerDist) {
                    runnerDist = dAnc;
                    runner = o;
                  }
                }

                if (runner) {
                  p.intent = 'marcaje';
                  tx = runner.x - dir * (p.instruction === 'marcaje_ferreo' ? 1.55 : 2.3);
                  tz = runner.z * 0.94;
                  hasFace = true;
                } else if ((p.x - this.ball.x) * dir > 7.5 + (p.slotIndex % 3) * 1.4) {
                  p.intent = 'repliegue';
                  const dropBlend = 0.28 + (p.slotIndex % 3) * 0.05;
                  tx = (-dir * HALF_L) * dropBlend + anchor.x * (1 - dropBlend);
                  tz = anchor.z * (0.76 + (p.slotIndex % 2) * 0.08);
                } else {
                  p.intent = 'posicional';
                }
              }
            } else if (teamHasBall && ((owner && owner.side === p.side) || (isFriendlyPassInFlight && !isIntendedReceiver))) {
              const refX = owner ? owner.x : this.ball.x;
              const refZ = owner ? owner.z : this.ball.z;
              const oppLine = p.side === 'home' ? this.awayOffsideLineX : this.homeOffsideLineX;
              const onsideMaxX =
                dir === 1 ? Math.min(HALF_L - 3.0, oppLine - 0.85) : Math.max(-HALF_L + 3.0, oppLine + 0.85);
              const carrierDist = dist2D(p.x, p.z, refX, refZ);

              if (p.giveAndGoTimer > 0) {
                p.intent = 'pared';
              } else if (p.intentTimer <= 0 || p.intent === 'presion' || p.intent === 'repliegue' || p.intent === 'marcaje' || p.intent === 'cobertura' || p.intent === 'temporizando') {
                p.intentTimer = 0.78 + Math.random() * 0.75;
                p.curveBias = Math.random() < 0.5 ? 1 : -1;
                if (p.assignedRole === 'DC' || p.instruction === 'entrar_al_area') {
                  const r = Math.random();
                  p.intent = r < 0.56 ? 'desmarque_ruptura' : r < 0.78 ? 'arrastre' : 'apoyo_corto';
                } else if ((p.assignedRole === 'EI' || p.assignedRole === 'ED') && Math.sign(this.ball.z || 1) !== Math.sign(p.z || 1)) {
                  p.intent = this.ball.x * dir > 20 && Math.abs(this.ball.z) > 13 ? 'llegada_area' : 'amplitud';
                } else if ((p.assignedRole === 'EI' || p.assignedRole === 'ED') && Math.sign(this.ball.z || 1) === Math.sign(p.z || 1)) {
                  p.intent = Math.random() < 0.45 ? 'arrastre' : 'desmarque_ruptura';
                } else if ((p.assignedRole === 'LI' || p.assignedRole === 'LD' || p.assignedRole === 'CAR') && Math.sign(this.ball.z || 1) === Math.sign(p.z || 1)) {
                  p.intent = refX * dir > 3 ? 'amplitud' : 'apoyo_corto';
                } else if (p.assignedRole === 'MC' || p.assignedRole === 'MCO') {
                  p.intent = carrierDist < 22 ? 'apoyo_corto' : Math.random() < 0.36 ? 'desmarque_ruptura' : 'posicional';
                } else {
                  p.intent = 'posicional';
                }
              }

              if (p.intent === 'pared') {
                const burstX = p.x + dir * 13.5;
                tx = dir === 1 ? Math.min(onsideMaxX, burstX) : Math.max(onsideMaxX, burstX);
                const bendZ = p.z > refZ ? 4.8 : -4.8;
                tz = clamp(p.z + bendZ, -HALF_W + 4, HALF_W - 4);
              } else if (p.intent === 'desmarque_ruptura') {
                const targetPush = dir === 1 ? Math.max(tx, this.ball.x + 17) : Math.min(tx, this.ball.x - 17);
                const finalPushX = dir === 1 ? Math.min(onsideMaxX, targetPush) : Math.max(onsideMaxX, targetPush);
                const xRemaining = Math.abs(finalPushX - p.x);
                if (xRemaining > 6.5) {
                  tx = p.x + (finalPushX - p.x) * 0.58;
                  tz = clamp(tz + (p.z >= 0 ? 1 : -1) * 4.5 * (p.curveBias > 0 ? 1 : 0.4), -HALF_W + 3, HALF_W - 3);
                } else {
                  tx = finalPushX;
                  tz = clamp(tz + (p.z > 0 ? -4.8 : 4.8), -17, 17);
                }
              } else if (p.intent === 'arrastre') {
                const decoyZSign = this.ball.z >= 0 ? -1 : 1;
                const decoyX = p.x + dir * 11;
                tx = dir === 1 ? Math.min(onsideMaxX, decoyX) : Math.max(onsideMaxX, decoyX);
                tz = clamp(p.z + decoyZSign * 9.5, -HALF_W + 4.5, HALF_W - 4.5);
              } else if (p.intent === 'amplitud') {
                const wingSign = Math.sign(p.z || (this.ball.z > 0 ? -1 : 1));
                tz = wingSign * (HALF_W - 3.6);
                if (p.assignedRole === 'LI' || p.assignedRole === 'LD' || p.assignedRole === 'CAR') {
                  tx = dir === 1 ? Math.min(onsideMaxX, Math.max(tx, refX + 9)) : Math.max(onsideMaxX, Math.min(tx, refX - 9));
                } else if (p.assignedRole === 'EI' || p.assignedRole === 'ED') {
                  tx = dir === 1 ? Math.min(onsideMaxX, Math.max(tx, this.ball.x + 8)) : Math.max(onsideMaxX, Math.min(tx, this.ball.x - 8));
                }
              } else if (p.intent === 'apoyo_corto' && carrierDist > 7 && carrierDist < 26) {
                tx = tx * 0.68 + (refX - dir * 3.2) * 0.32;
                for (let j = 0; j < opps.length; j++) {
                  const o = opps[j];
                  if (this.pointToSegmentDist(o.x, o.z, refX, refZ, tx, tz) < 2.6) {
                    const sideShift = tz - o.z >= 0 ? 1 : -1;
                    tz = clamp(tz + sideShift * 4.8, -HALF_W + 2.5, HALF_W - 2.5);
                    break;
                  }
                }
              }

              const canEnterBoxCrash = Math.abs(this.ball.z) > 13 && this.ball.x * dir > 20;
              const holdBoxCrash = p.intent === 'llegada_area' && this.ball.x * dir > 12;
              if (
                holdBoxCrash ||
                (canEnterBoxCrash &&
                  (p.assignedRole === 'DC' ||
                    p.instruction === 'entrar_al_area' ||
                    (p.assignedRole === 'EI' && this.ball.z > 0) ||
                    (p.assignedRole === 'ED' && this.ball.z < 0)))
              ) {
                p.intent = 'llegada_area';
                const desiredBoxX = dir * (HALF_L - (p.assignedRole === 'MCO' ? 13.5 : 9.0));
                tx = dir === 1 ? Math.min(onsideMaxX, desiredBoxX) : Math.max(onsideMaxX, desiredBoxX);
                tz =
                  p.assignedRole === 'DC'
                    ? Math.sign(this.ball.z || 1) * 1.8
                    : p.assignedRole === 'MCO'
                    ? 0
                    : -Math.sign(this.ball.z || 1) * 6.2;
              } else if (p.intent === 'llegada_area') {
                p.intent = p.assignedRole === 'EI' || p.assignedRole === 'ED' ? 'amplitud' : 'posicional';
              }
            } else {
              // Loose ball or opponent pass in flight for non-pressing players: refresh intent cleanly
              if ((p.x - this.ball.x) * dir > 8.5 + (p.slotIndex % 3) * 1.4 && !teamHasBall) {
                p.intent = 'repliegue';
                const dropBlend = 0.28 + (p.slotIndex % 3) * 0.05;
                tx = (-dir * HALF_L) * dropBlend + anchor.x * (1 - dropBlend);
                tz = anchor.z * (0.76 + (p.slotIndex % 2) * 0.08);
              } else {
                p.intent = p.isJumping ? 'salto_aereo' : 'posicional';
              }
            }

            const mates = p.side === 'home' ? homeActive : awayActive;
            for (let j = 0; j < mates.length; j++) {
              const m = mates[j];
              if (m.id === p.id) continue;
              const dx = p.x - m.x;
              const dz = p.z - m.z;
              const d = Math.sqrt(dx * dx + dz * dz);
              if (d > 0.01 && d < 4.2) {
                const push = (4.2 - d) * 1.1;
                tx += (dx / d) * push - (dz / d) * p.curveBias * 0.65;
                tz += (dz / d) * push + (dx / d) * p.curveBias * 0.65;
              }
            }
            for (let j = 0; j < opps.length; j++) {
              if (p.intent === 'presion' || p.intent === 'temporizando' || p.intent === 'marcaje') continue;
              const o = opps[j];
              const dx = p.x - o.x;
              const dz = p.z - o.z;
              const d = Math.sqrt(dx * dx + dz * dz);
              if (d > 0.01 && d < 2.8) {
                const evade = (2.8 - d) * 0.95;
                tx += (dx / d) * evade - (dz / d) * p.curveBias * 0.9;
                tz += (dz / d) * evade + (dx / d) * p.curveBias * 0.9;
              }
            }

            const distTarget = dist2D(p.x, p.z, tx, tz);
            if (p.intent === 'repliegue' && distTarget < 1.85) {
              p.intent = 'posicional';
            }
            if (distTarget > 5.0 && p.intent !== 'presion' && p.intent !== 'temporizando' && !isIntendedReceiver) {
              const toX = tx - p.x;
              const toZ = tz - p.z;
              const len = Math.max(1, Math.sqrt(toX * toX + toZ * toZ));
              const arcMag = Math.sin(clamp(distTarget / 24, 0, 1) * Math.PI) * 3.8 * p.curveBias;
              const sway = Math.sin(this.clockSeconds * 0.28 + p.slotIndex * 1.9) * 1.6;
              tx += (-toZ / len) * (arcMag + sway);
              tz += (toX / len) * (arcMag + sway);
            }

            const clampedTx = clamp(tx, -HALF_L + 1.2, HALF_L - 1.2);
            const clampedTz = clamp(tz, -HALF_W + 1.2, HALF_W - 1.2);

            let gait: GaitMode = 'carrera';
            const wantsSprint =
              (!this.ball.ownerId && !isFriendlyPassInFlight && isPrimaryPresser) ||
              (isIntendedReceiver && distTarget > 3.2) ||
              p.intent === 'pared' ||
              p.intent === 'desmarque_ruptura' ||
              p.intent === 'arrastre' ||
              p.intent === 'llegada_area' ||
              (p.intent === 'presion' && (isPrimaryPresser || distToBall < 12.5)) ||
              (p.intent === 'repliegue' && (p.x - this.ball.x) * dir > 11.5 && distTarget > 4.0) ||
              (teamHasBall && tactics.counterAttack && this.transitionTimer > 0 && p.x * dir > -10 && distTarget > 4.0);

            if (wantsSprint && distTarget > 2.4) {
              gait = 'sprint';
            } else if (
              isIntendedReceiver ||
              p.intent === 'amplitud' ||
              p.intent === 'apoyo_corto' ||
              p.intent === 'cobertura' ||
              p.intent === 'marcaje' ||
              p.intent === 'presion' ||
              p.intent === 'repliegue'
            ) {
              gait = distTarget < 1.5 ? 'carrera' : 'apoyo';
            } else if (distTarget < 5.0 && distToBall > 18) {
              gait = 'trote';
            } else {
              gait = 'carrera';
            }

            const baseIntent = p.intent === 'salto_aereo' ? 'posicional' : p.intent;
            plan.tx = clampedTx;
            plan.tz = clampedTz;
            plan.gait = gait;
            plan.intent = baseIntent;
            plan.hasFace = hasFace;
            plan.faceX = faceX;
            plan.faceZ = faceZ;
            p.intent = p.isJumping && p.y > 0.01 ? 'salto_aereo' : baseIntent;
          } else {
            const safePlanIntent =
              plan.intent === 'salto_aereo' || plan.intent === 'entrada' || plan.intent === 'desequilibrio'
                ? 'posicional'
                : plan.intent;
            p.intent = p.isJumping && p.y > 0.01 ? 'salto_aereo' : safePlanIntent;
          }

          const damp = isIntendedReceiver ? Math.min(1, dt * 11.0) : Math.min(1, dt * 6.8);
          p.targetX += (plan.tx - p.targetX) * damp;
          p.targetZ += (plan.tz - p.targetZ) * damp;
          const faceArg = plan.hasFace ? { x: plan.faceX, z: plan.faceZ } : undefined;
          this.movePlayerToward(p, p.targetX, p.targetZ, dt, plan.gait, 1.0, faceArg);
        }
      }

      this.checkBallInteraction(p, dt);
    }
  }

  private resolvePlayerCollisions(_dt: number) {
    const active = this.activeAll;
    const minSep = 0.76;

    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (Math.abs(a.y - b.y) > 1.35) continue;

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d <= 0.001 || d >= minSep) continue;

        const nx = dx / d;
        const nz = dz / d;
        const overlap = minSep - d;

        const massA = 0.72 + (a.attributes.physical / 100) * 0.56;
        const massB = 0.72 + (b.attributes.physical / 100) * 0.56;
        const totalMass = massA + massB;

        a.x = clamp(a.x - nx * overlap * (massB / totalMass), -HALF_L - 1.5, HALF_L + 1.5);
        a.z = clamp(a.z - nz * overlap * (massB / totalMass), -HALF_W - 1.5, HALF_W + 1.5);
        b.x = clamp(b.x + nx * overlap * (massA / totalMass), -HALF_L - 1.5, HALF_L + 1.5);
        b.z = clamp(b.z + nz * overlap * (massA / totalMass), -HALF_W - 1.5, HALF_W + 1.5);

        // Relative velocity along collision normal
        const relVx = b.vx - a.vx;
        const relVz = b.vz - a.vz;
        const vn = relVx * nx + relVz * nz;
        if (vn < 0) {
          const restitution = 0.25;
          const jImp = (-(1 + restitution) * vn) / (1 / massA + 1 / massB);
          a.vx -= (jImp / massA) * nx;
          a.vz -= (jImp / massA) * nz;
          b.vx += (jImp / massB) * nx;
          b.vz += (jImp / massB) * nz;

          // Heavy opponent shoulder-to-shoulder or sliding contact triggers stumble or ground duel outcome
          if (a.side !== b.side && Math.abs(vn) > 3.8) {
            if (a.slideTimer > 0 && this.ball.ownerId === b.id && a.actionCooldown <= 0) {
              this.handleFoul(a, b);
              continue;
            }
            if (b.slideTimer > 0 && this.ball.ownerId === a.id && b.actionCooldown <= 0) {
              this.handleFoul(b, a);
              continue;
            }
            const balA = massA * (a.stamina > 55 ? 1 : 0.76);
            const balB = massB * (b.stamina > 55 ? 1 : 0.76);
            if (balA < balB * 0.85 && a.stumbleTimer <= 0 && a.assignedRole !== 'POR') {
              a.stumbleTimer = 0.34;
              if (this.ball.ownerId === a.id) {
                this.ball.ownerId = null;
                a.groundDuelsLost += 1;
                b.groundDuelsWon += 1;
                (a.side === 'home' ? this.homeStats : this.awayStats).groundDuelsLost += 1;
                (b.side === 'home' ? this.homeStats : this.awayStats).groundDuelsWon += 1;
              }
            } else if (balB < balA * 0.85 && b.stumbleTimer <= 0 && b.assignedRole !== 'POR') {
              b.stumbleTimer = 0.34;
              if (this.ball.ownerId === b.id) {
                this.ball.ownerId = null;
                b.groundDuelsLost += 1;
                a.groundDuelsWon += 1;
                (b.side === 'home' ? this.homeStats : this.awayStats).groundDuelsLost += 1;
                (a.side === 'home' ? this.homeStats : this.awayStats).groundDuelsWon += 1;
              }
            }
          }
        }
      }
    }
  }

  private movePlayerToward(
    p: PlayerMatchState,
    tx: number,
    tz: number,
    dt: number,
    gaitOrSprint: GaitMode | boolean,
    carryPenalty = 1.0,
    faceTarget?: { x: number; z: number }
  ) {
    const prevGait = p.gaitMode;
    const requestedGait: GaitMode =
      typeof gaitOrSprint === 'boolean' ? (gaitOrSprint ? 'sprint' : 'carrera') : gaitOrSprint;
    p.targetX = tx;
    p.targetZ = tz;

    const wrapAngle = (a: number) => {
      let r = a;
      while (r > Math.PI) r -= Math.PI * 2;
      while (r < -Math.PI) r += Math.PI * 2;
      return r;
    };

    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);

    if (d < 0.25) {
      p.gaitMode = 'trote';
      p.vx *= Math.max(0, 1 - dt * 11);
      p.vz *= Math.max(0, 1 - dt * 11);
      if (faceTarget) {
        p.facing = wrapAngle(Math.atan2(faceTarget.z - p.z, faceTarget.x - p.x));
      }
      p.stamina = Math.min(100, p.stamina + 0.045 * dt);
      return;
    }

    const curSpeedPre = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    // Realistic distance-aware gait downgrade: never report/burn 'sprint' for micro-adjustments
    let gait: GaitMode = requestedGait;
    if (d < 0.65) {
      gait = 'trote';
    } else if (gait === 'sprint' && d < 1.85) {
      gait = 'carrera';
    } else if (gait === 'sprint' && d < 2.8 && curSpeedPre < 4.4) {
      gait = 'apoyo';
    } else if (gait === 'apoyo' && d < 1.15) {
      gait = 'carrera';
    }
    p.gaitMode = gait;
    if (gait === 'sprint' && prevGait !== 'sprint') {
      p.sprints += 1;
    }

    // FM08-calibrated sprint envelope: ~6.8 m/s (slow CB/GK) up to ~9.8 m/s (elite sprinter, 35.3 km/h)
    const paceNorm = clamp((p.attributes.pace - 40) / 56, 0, 1);
    const sprintMax = 6.8 + Math.pow(paceNorm, 1.15) * 3.0;
    const fatigueCurve = p.stamina < 50 ? 0.68 + (p.stamina / 50) * 0.32 : 1.0;
    const knockFactor = p.knockSeverity === 2 ? 0.45 : p.knockSeverity === 1 ? 0.82 : 1.0;
    const staminaFactor = (0.78 + (p.stamina / 100) * 0.22) * fatigueCurve * knockFactor;
    const moraleFactor = 0.95 + (p.morale / 100) * 0.07;

    const gaitRatioMap: Record<GaitMode, number> = {
      trote: 0.36,
      carrera: 0.58,
      apoyo: 0.78,
      sprint: 1.0,
    };
    const baseSpeed = sprintMax * gaitRatioMap[gait];
    const maxSpeed =
      baseSpeed * staminaFactor * moraleFactor * carryPenalty * Math.min(1, d * 1.45);

    const dirX = dx / d;
    const dirZ = dz / d;
    const curSpeed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);

    // Agility mapped to FM08 1-20 scale for sharp-turn (>60 deg) speed cap without ice-skating drift
    const agilityAttr = (p.attributes.dribbling * 0.56 + p.attributes.pace * 0.22 + p.attributes.physical * 0.22) / 100;
    const agility = (0.70 + agilityAttr * 0.54) * fatigueCurve;
    const agility20 = clamp(1 + agilityAttr * fatigueCurve * 19, 1, 20);
    const balanceNorm = clamp((p.attributes.physical * 0.6 + p.attributes.dribbling * 0.4) / 100, 0.35, 1.0);

    let turnSpeedCap = 1.0;
    let isSharpTurn = false;
    if (curSpeed > 2.2) {
      const dot = (p.vx * dirX + p.vz * dirZ) / curSpeed;
      if (dot < 0.5) {
        isSharpTurn = true;
        // FM08 sharp-turn (>60 deg) speed reduction proportional to agility & balance
        const agilitySave = (agility20 / 20) * 0.32 + balanceNorm * 0.14;
        const sharpness = (0.5 - dot) / 1.5;
        turnSpeedCap = clamp(1 - sharpness * Math.max(0.18, 0.68 - agilitySave), 0.38, 1.0);
      }
    }

    const desiredVx = dirX * maxSpeed * turnSpeedCap;
    const desiredVz = dirZ * maxSpeed * turnSpeedCap;

    // Biomechanical acceleration: crisp lateral/first-step footwork (15-20 m/s²) tapering to FM08 high-speed ramp (5.5-8.5 m/s²)
    const accelNorm = clamp((p.attributes.pace * 0.65 + p.attributes.dribbling * 0.35 - 40) / 55, 0, 1);
    const highSpeedAccel = (5.5 + accelNorm * 3.0) * staminaFactor;
    const firstStepAccel = (15.0 + accelNorm * 5.0) * staminaFactor;
    const speedRatio = clamp((curSpeed - 3.8) / Math.max(1, sprintMax - 3.8), 0, 1);
    const maxAccel = firstStepAccel * (1 - speedRatio) + highSpeedAccel * speedRatio;
    const maxDecel = (19.0 + accelNorm * 6.0 + (isSharpTurn ? 4.5 : 0)) * staminaFactor;

    const dvx = desiredVx - p.vx;
    const dvz = desiredVz - p.vz;
    const dvMag = Math.sqrt(dvx * dvx + dvz * dvz);
    if (dvMag > 0.0001) {
      const isBraking = isSharpTurn || desiredVx * p.vx + desiredVz * p.vz < curSpeed * curSpeed * 0.85;
      const maxDeltaV = (isBraking ? maxDecel : maxAccel) * dt;
      const step = dvMag < maxDeltaV ? dvMag : maxDeltaV;
      p.vx += (dvx / dvMag) * step;
      p.vz += (dvz / dvMag) * step;
    }

    const cappedSpeed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    if (cappedSpeed > maxSpeed && maxSpeed > 0.01) {
      const scale = maxSpeed / cappedSpeed;
      p.vx *= scale;
      p.vz *= scale;
    }

    p.x = clamp(p.x + p.vx * dt, -HALF_L - 1.5, HALF_L + 1.5);
    p.z = clamp(p.z + p.vz * dt, -HALF_W - 1.5, HALF_W + 1.5);

    const speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    p.distanceMeters += speed * dt;

    if (faceTarget) {
      const targetAngle = Math.atan2(faceTarget.z - p.z, faceTarget.x - p.x);
      let diff = targetAngle - p.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.facing = wrapAngle(p.facing + diff * Math.min(1, dt * 11));
      if (speed > 0.25) p.stridePhase += speed * dt * 2.1;
    } else if (speed > 0.35) {
      const targetAngle = Math.atan2(p.vz, p.vx);
      let diff = targetAngle - p.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurnRate = dt * (7.2 + agility * 4.6) * (speed > 6.2 ? 0.74 : 1.0);
      p.facing = wrapAngle(p.facing + diff * Math.min(1, maxTurnRate));
      p.stridePhase += speed * dt * 2.1;
    }

    const drainRate = gait === 'sprint' ? 0.135 : gait === 'apoyo' ? 0.048 : gait === 'carrera' ? 0.022 : 0.005;
    const physRes = (1.24 - (p.attributes.physical / 100) * 0.44) * (p.knockSeverity === 1 ? 1.25 : 1.0);
    if (speed < 1.35) {
      p.stamina = Math.min(100, p.stamina + 0.035 * dt);
    } else {
      p.stamina = Math.max(15, p.stamina - drainRate * physRes * dt);
    }

    // Muscle strain risk when sprinting heavily fatigued (dt-scaled so knocks occur realistically)
    if (gait === 'sprint' && p.stamina < 24 && p.knockSeverity === 0 && Math.random() < 0.012 * dt) {
      p.knockSeverity = 1;
      p.stamina = Math.max(15, p.stamina - 6);
      this.addEvent(
        'injury',
        `Molestia muscular (${p.shortName})`,
        `${p.shortName} acusa el esfuerzo físico y cojea levemente tras un sprint.`,
        p.side,
        p.shortName
      );
    }
  }

  private updateGoalkeeper(gk: PlayerMatchState, dt: number) {
    const dir = this.getAttackDir(gk.side);
    const ownGoalX = -dir * HALF_L;
    const gkSkill = gk.attributes.gk / 100;
    const gkTier = clamp((gk.attributes.gk - 35) / 60, 0, 1);

    // 1. Incoming shot response with physiological reaction time & IK dive vector
    if (this.ball.isShotInFlight && this.ball.shotTeam !== gk.side && this.ball.vx * -dir > 4) {
      // Mid-air dive commits goalkeeper momentum instead of teleport-sprinting simultaneously
      if (gk.diveAnimTimer > 0) {
        gk.intent = 'portero';
        gk.vx *= Math.pow(0.45, dt);
        gk.vz *= Math.pow(0.68, dt);
        gk.x = clamp(gk.x + gk.vx * dt, -HALF_L - 0.5, HALF_L + 0.5);
        gk.z = clamp(gk.z + gk.vz * dt, -GOAL_HALF_WIDTH - 1.5, GOAL_HALF_WIDTH + 1.5);
        return;
      }

      const reactionDelay = 0.175 - gkTier * 0.105; // ~0.079s elite vs ~0.121s mid-low vs ~0.156s lower tier
      if (this.shotElapsed < reactionDelay) {
        gk.intent = 'portero';
        this.movePlayerToward(gk, gk.x, gk.z, dt, 'trote', 1.0, {
          x: this.ball.x,
          z: this.ball.z,
        });
        return;
      }

      const timeToGoal = Math.abs((ownGoalX + dir * 0.7 - this.ball.x) / (this.ball.vx || 0.01));
      if (timeToGoal > 0 && timeToGoal < 1.4) {
        const readAccuracy = 0.65 + gkTier * 0.32;
        const predictedZ = clamp(
          this.ball.z + this.ball.vz * timeToGoal * readAccuracy,
          -GOAL_HALF_WIDTH - 0.22,
          GOAL_HALF_WIDTH + 0.22
        );
        const predictedY = clamp(
          this.ball.y + this.ball.vy * timeToGoal - 0.5 * 9.81 * timeToGoal * timeToGoal,
          0.25,
          GOAL_HEIGHT
        );
        gk.intent = 'portero';
        this.movePlayerToward(gk, ownGoalX + dir * 1.2, predictedZ, dt, 'sprint', 1.0, {
          x: this.ball.x,
          z: this.ball.z,
        });
        const reactionWindow = 0.44 + gkTier * 0.21;
        if (Math.abs(predictedZ - gk.z) > 0.65 && timeToGoal < reactionWindow) {
          gk.diveAnimTimer = 0.55;
          gk.diveDir = Math.sign(predictedZ - gk.z);
          gk.diveHeight = predictedY;
          gk.vz += gk.diveDir * (2.45 + gkTier * 2.55);
        }
        return;
      }
    }

    // 2. Sweeper-Keeper Exit on through-balls / loose balls behind high defensive line
    const distBallToGoal = dist2D(this.ball.x, this.ball.z, ownGoalX, 0);
    if (!this.ball.ownerId && distBallToGoal < 33 && this.ball.lastTouchTeam !== gk.side) {
      const opps = gk.side === 'home' ? this.activeAway : this.activeHome;
      let nearestOppDist = 99;
      for (let i = 0; i < opps.length; i++) {
        const o = opps[i];
        if (o.assignedRole === 'POR') continue;
        const d = dist2D(o.x, o.z, this.ball.x, this.ball.z);
        if (d < nearestOppDist) nearestOppDist = d;
      }
      const gkDistToBall = dist2D(gk.x, gk.z, this.ball.x, this.ball.z);
      if (gkDistToBall < nearestOppDist + 1.8 && gkDistToBall < 26) {
        gk.intent = 'portero_libero';
        const lead = 0.25;
        this.movePlayerToward(
          gk,
          this.ball.x + this.ball.vx * lead,
          this.ball.z + this.ball.vz * lead,
          dt,
          'sprint',
          1.0,
          { x: this.ball.x, z: this.ball.z }
        );
        return;
      }
    }

    // 3. Angle-bisector narrowing when opponent attacks final third
    if (distBallToGoal < 30 && this.ball.lastTouchTeam !== gk.side) {
      gk.intent = 'portero';
      const stepOut = clamp((1 - distBallToGoal / 30) * (1.8 + gkTier * 3.4), 1.2, 5.0);
      const bx = this.ball.x - ownGoalX;
      const bz = this.ball.z;
      const bLen = Math.max(1, Math.sqrt(bx * bx + bz * bz));
      const targetX = ownGoalX + (bx / bLen) * stepOut;
      const targetZ = clamp((bz / bLen) * stepOut * 1.45, -GOAL_HALF_WIDTH + 0.6, GOAL_HALF_WIDTH - 0.6);
      this.movePlayerToward(gk, targetX, targetZ, dt, distBallToGoal < 18 ? 'sprint' : 'apoyo', 1.0, {
        x: this.ball.x,
        z: this.ball.z,
      });
      return;
    }

    gk.intent = 'portero';
    const anchor = this.getTacticalAnchor(gk, false);
    this.movePlayerToward(gk, anchor.x, anchor.z, dt, 'trote', 1.0, { x: this.ball.x, z: this.ball.z });
  }

  private handleBallCarrier(p: PlayerMatchState, dt: number) {
    const dir = this.getAttackDir(p.side);
    const oppGoalX = dir * HALF_L;
    const tactics = p.side === 'home' ? this.homeTactics : this.awayTactics;
    const opps = p.side === 'home' ? this.activeAway : this.activeHome;
    const teamActive = p.side === 'home' ? this.activeHome : this.activeAway;
    const mates = teamActive.filter((m) => m.id !== p.id);

    const isGK = p.assignedRole === 'POR';
    const distToGoal = dist2D(p.x, p.z, oppGoalX, 0);
    const dribSkill = p.attributes.dribbling / 100;
    const visionSkill = p.attributes.vision / 100;
    const shootSkill = p.attributes.shooting / 100;
    const firstTouchSkill = (p.attributes.dribbling * 0.55 + p.attributes.passing * 0.45) / 100;

    let nearestOppDist = Infinity;
    let nearestOpp: PlayerMatchState | null = null;
    // Measure forward green-space cone (±35° ahead in attacking half-space) for open-grass carrying
    let greenSpaceDist = Math.min(22, Math.max(4, (oppGoalX - p.x) * dir));
    for (const o of opps) {
      const dx = o.x - p.x;
      const dz = o.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < nearestOppDist) {
        nearestOppDist = d;
        nearestOpp = o;
      }
      if (d > 0.5 && d < greenSpaceDist) {
        const forwardProj = dx * dir;
        if (forwardProj > 0) {
          const latAngle = Math.abs(Math.atan2(dz, forwardProj));
          if (latAngle < 0.62) {
            greenSpaceDist = Math.min(greenSpaceDist, d);
          }
        }
      }
    }

    const keepBallAtToe = (angle: number, reach = 0.52) => {
      const pocketX = p.x + Math.cos(angle) * reach;
      const pocketZ = p.z + Math.sin(angle) * reach;
      this.ball.vx = p.vx + (pocketX - this.ball.x) * 7.5;
      this.ball.vz = p.vz + (pocketZ - this.ball.z) * 7.5;
      this.ball.y = 0.11;
    };

    const rotateFacingToward = (targetAngle: number, rate: number) => {
      let diff = targetAngle - p.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.facing += diff * Math.min(1, dt * rate);
      while (p.facing > Math.PI) p.facing -= Math.PI * 2;
      while (p.facing < -Math.PI) p.facing += Math.PI * 2;
    };

    // -------------------------------------------------------------------------
    // CARRIER STATE MACHINE: trapping (in stride if space!) -> scanning / driving / shielding
    // -------------------------------------------------------------------------
    if (p.carrierMode === 'trapping') {
      p.intent = 'controlando';
      const hasRunway = !isGK && greenSpaceDist > 6.8 && nearestOppDist > 3.1 && dribSkill > 0.68;
      if (hasRunway) {
        // Cushioned directional first touch right into a dribble sprint!
        p.gaitMode = 'apoyo';
        const brake = Math.max(0, 1 - dt * 2.4);
        p.vx *= brake;
        p.vz *= brake;
      } else {
        p.gaitMode = 'trote';
        const brake = Math.max(0, 1 - dt * 5.0);
        p.vx *= brake;
        p.vz *= brake;
      }
      p.x = clamp(p.x + p.vx * dt, -HALF_L - 1.2, HALF_L + 1.2);
      p.z = clamp(p.z + p.vz * dt, -HALF_W - 1.2, HALF_W + 1.2);
      rotateFacingToward(p.scanTurnTarget, 10.5);
      keepBallAtToe(p.facing, hasRunway ? 0.65 : 0.48);

      // Urgent GK/box clearance or immediate runway carry transition
      if (p.carrierModeTimer > 0 && !(isGK && nearestOppDist < 2.6)) {
        return;
      }

      const isDefOrAnchor =
        p.assignedRole === 'POR' || p.assignedRole === 'DFC' || p.assignedRole === 'MCD';
      if (!isGK && !isDefOrAnchor && greenSpaceDist > 8.5 && nearestOppDist > 3.8 && dribSkill > 0.72) {
        p.carrierMode = 'driving';
        p.carryCommitTimer = 0.22 + dribSkill * 0.24;
        p.intent = 'conduccion';
      } else if (!isGK && nearestOppDist < 3.1 && greenSpaceDist < 5.5) {
        p.carrierMode = 'shielding';
        p.carrierModeTimer = 0.24 + (1 - visionSkill) * 0.12;
        p.intent = 'temporizacion_ofensiva';
      } else {
        p.carrierMode = 'scanning';
        const tempoScale =
          tactics.tempo === 'vertiginoso' ? 0.26 : tactics.tempo === 'alto' ? 0.38 : tactics.tempo === 'pausado' ? 0.68 : 0.48;
        p.carrierModeTimer = (0.07 + visionSkill * 0.09 + Math.random() * 0.05) * tempoScale;
        p.actionCooldown = p.carrierModeTimer * 0.45;
        p.intent = 'escaneando';
      }
      return;
    }

    if (p.carrierMode === 'scanning') {
      p.intent = 'escaneando';
      p.gaitMode = 'trote';
      const walkBrake = Math.max(0, 1 - dt * 4.8);
      p.vx *= walkBrake;
      p.vz *= walkBrake;
      p.x = clamp(p.x + p.vx * dt, -HALF_L - 1.2, HALF_L + 1.2);
      p.z = clamp(p.z + p.vz * dt, -HALF_W - 1.2, HALF_W + 1.2);
      const scanAngle = Math.atan2(0 - p.z * 0.35, dir * 18);
      p.scanTurnTarget = scanAngle;
      rotateFacingToward(scanAngle, 8.2);
      keepBallAtToe(p.facing, 0.5);

      if (p.carrierModeTimer > 0 && nearestOppDist > 3.2) {
        return;
      }

      const isDefOrAnchor =
        p.assignedRole === 'POR' || p.assignedRole === 'DFC' || p.assignedRole === 'MCD';
      if (!isGK && !isDefOrAnchor && greenSpaceDist > 8.5 && nearestOppDist > 3.8 && Math.random() < 0.28 + dribSkill * 0.2) {
        p.carrierMode = 'driving';
        p.carryCommitTimer = 0.22 + dribSkill * 0.22;
        p.intent = 'conduccion';
      } else {
        p.carrierMode = 'none';
        p.actionCooldown = 0;
      }
    }

    if (p.carrierMode === 'shielding') {
      p.intent = 'temporizacion_ofensiva';
      p.gaitMode = 'trote';
      const brake = Math.max(0, 1 - dt * 5.8);
      p.vx *= brake;
      p.vz *= brake;
      p.x = clamp(p.x + p.vx * dt, -HALF_L - 1.2, HALF_L + 1.2);
      p.z = clamp(p.z + p.vz * dt, -HALF_W - 1.2, HALF_W + 1.2);
      const shieldAngle = nearestOpp
        ? Math.atan2(p.z - nearestOpp.z, p.x - nearestOpp.x)
        : Math.atan2(0, dir);
      rotateFacingToward(shieldAngle, 9.5);
      keepBallAtToe(shieldAngle, 0.48);

      if (p.carrierModeTimer > 0 && nearestOppDist < 3.8) {
        return;
      }
      p.carrierMode = 'none';
      p.actionCooldown = 0;
    }

    // -------------------------------------------------------------------------
    // DRIVING / CORRIDOR NAVIGATION + PHYSICAL DRIBBLE KICKS
    // -------------------------------------------------------------------------
    let dribbleTargetX = p.x + dir * 5;
    let dribbleTargetZ = p.z;
    const isDefenderOrAnchor =
      p.assignedRole === 'POR' || p.assignedRole === 'DFC' || p.assignedRole === 'MCD';
    const isInvertedWinger =
      (p.assignedRole === 'EI' && p.foot === 'D') ||
      (p.assignedRole === 'ED' && p.foot === 'I');

    // Trigger subtle body feints / slalom modulation every ~0.65-1.4s in open/1v1 play
    if (p.feintTimer <= 0) {
      p.feintTimer = isDefenderOrAnchor ? 1.4 + Math.random() * 0.6 : 0.65 + Math.random() * 0.55;
      p.feintDir = Math.random() < 0.5 ? 1 : -1;
    }

    // Trigger La Pausa (brief tempo hold by creative MC/MCO to draw pressure & open lanes)
    if (
      p.pausaTimer <= 0 &&
      p.carryCommitTimer <= 0 &&
      (p.assignedRole === 'MC' || p.assignedRole === 'MCO') &&
      visionSkill > 0.78 &&
      tactics.tempo !== 'vertiginoso' &&
      nearestOppDist > 4.2 &&
      nearestOppDist < 9.5 &&
      Math.random() < 0.025
    ) {
      p.pausaTimer = 0.46;
      p.intent = 'temporizacion_ofensiva';
    }

    if (p.pausaTimer > 0) {
      dribbleTargetX = p.x + dir * 0.8;
      dribbleTargetZ = p.z + p.feintDir * 1.6;
    } else if (isDefenderOrAnchor && p.x * dir < -4) {
      // Defenders & DMs carry decisively forward into open lanes without wobbling laterally
      dribbleTargetX = p.x + dir * (greenSpaceDist > 9 ? 11.5 : 6.0);
      dribbleTargetZ = nearestOpp && nearestOppDist < 5.5 ? p.z + p.feintDir * 2.5 : p.z * 0.9;
    } else if (isInvertedWinger && p.x * dir > 10 && Math.abs(p.z) > 9) {
      dribbleTargetX = p.x + dir * 9.5;
      dribbleTargetZ = p.z * 0.3 + p.feintDir * 1.4;
    } else if ((p.assignedRole === 'EI' || p.assignedRole === 'ED') && !isInvertedWinger && p.x * dir > 4) {
      dribbleTargetX = oppGoalX - dir * 6;
      dribbleTargetZ = Math.sign(p.z || 1) * (HALF_W - 6.0) + p.feintDir * 1.8;
    } else {
      dribbleTargetX = oppGoalX - dir * 8;
      dribbleTargetZ = p.z * 0.74 + p.feintDir * (1.6 + dribSkill * 1.5);
    }

    if (nearestOpp && nearestOppDist < 6.8 && p.pausaTimer <= 0) {
      const awayZ = p.z - nearestOpp.z;
      const evadeSide = Math.abs(awayZ) > 1.25 ? Math.sign(awayZ) : p.feintDir;
      const forwardPush = isDefenderOrAnchor && p.x * dir < -10 ? 5.2 : 4.8 + dribSkill * 3.4;
      dribbleTargetX = p.x + dir * forwardPush;
      dribbleTargetZ = p.z + evadeSide * (isDefenderOrAnchor ? 2.8 : 3.8 + dribSkill * 3.0);
    }

    // FM08 ~12-18% dribbling speed penalty, softened for elite dribblers (0.83 - 0.91)
    const carrySpeedFactor = 0.81 + dribSkill * 0.10;
    const carryGait: GaitMode =
      p.pausaTimer > 0
        ? 'trote'
        : !isGK && greenSpaceDist > 6.5 && nearestOppDist > 3.1
        ? 'sprint'
        : isDefenderOrAnchor && nearestOppDist > 5.5
        ? 'carrera'
        : 'apoyo';

    if (p.pausaTimer <= 0) {
      p.intent = 'conduccion';
    }

    this.movePlayerToward(
      p,
      clamp(dribbleTargetX, -HALF_L + 3, HALF_L - 3),
      clamp(dribbleTargetZ, -HALF_W + 3, HALF_W - 3),
      dt,
      carryGait,
      carrySpeedFactor
    );

    // Physical Dribble Touches: ball rides cleanly in stride ahead of carrier, or knocked into open wing!
    const distBall = dist2D(p.x, p.z, this.ball.x, this.ball.z);
    const pSpeed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    const targetAngle = Math.atan2(dribbleTargetZ - p.z, dribbleTargetX - p.x);

    if (p.dribbleTouchTimer <= 0 || distBall > 1.75) {
      const openFlankKnock = nearestOppDist > 5.5 && carryGait === 'sprint' && pSpeed > 5.5;
      if (pSpeed < 1.1 || p.pausaTimer > 0) {
        keepBallAtToe(targetAngle, 0.52);
        p.dribbleTouchTimer = 0.16;
      } else {
        let faceDelta = p.facing - targetAngle;
        while (faceDelta > Math.PI) faceDelta -= Math.PI * 2;
        while (faceDelta < -Math.PI) faceDelta += Math.PI * 2;
        const touchAngle = targetAngle + faceDelta * 0.4;
        const leadGap = openFlankKnock ? 1.55 : 0.85;
        const aheadX = p.x + Math.cos(touchAngle) * leadGap;
        const aheadZ = p.z + Math.sin(touchAngle) * leadGap;
        const extraKick = isGK
          ? 0.9
          : openFlankKnock
          ? 2.25 + (1 - firstTouchSkill) * 0.7
          : 1.15 + (1 - firstTouchSkill) * 0.45;
        this.ball.vx = p.vx + Math.cos(touchAngle) * extraKick + (aheadX - this.ball.x) * 2.2;
        this.ball.vz = p.vz + Math.sin(touchAngle) * extraKick + (aheadZ - this.ball.z) * 2.2;
        p.dribbleTouchTimer = openFlankKnock
          ? 0.34 + (1 - dribSkill) * 0.1
          : 0.18 + (1 - dribSkill) * 0.09;
      }
      this.ball.y = 0.11;
    } else if (distBall > 1.25 && pSpeed > 2.5) {
      // Subtle stride-follow keeping ball from lagging behind fast sprinters
      this.ball.vx += (p.vx - this.ball.vx) * Math.min(1, dt * 4.5);
      this.ball.vz += (p.vz - this.ball.vz) * Math.min(1, dt * 4.5);
    }

    // Discrete Decision Slice
    if (p.actionCooldown > 0) return;

    const fatigueFactor = p.stamina < 60 ? p.stamina / 60 : 1.0;
    const pressurePenalty = nearestOppDist < 3.5 ? 0.15 : 0;
    const decisionQuality = clamp(visionSkill * fatigueFactor - pressurePenalty, 0.35, 0.98);
    const sliceInterval =
      tactics.tempo === 'vertiginoso'
        ? 0.11
        : tactics.tempo === 'alto'
        ? 0.14
        : tactics.tempo === 'pausado'
        ? 0.21
        : 0.17;
    const tempoBonus =
      tactics.tempo === 'vertiginoso'
        ? 0.28
        : tactics.tempo === 'alto'
        ? 0.16
        : tactics.tempo === 'pausado'
        ? -0.18
        : 0.0;

    const noise = () => (Math.random() - 0.5) * (1 - decisionQuality) * 4.5;

    // 1. Score SHOT option (calibrated to realistic pro volume ~21-26 shots/match)
    let shootUtility = -99;
    const shotThresh =
      (tactics.mentality === 'ataque_total' ? 22.0 : tactics.mentality === 'ofensiva' ? 19.8 : 18.0) +
      (shootSkill - 0.72) * 3.8;
    if (!isGK && distToGoal < shotThresh && Math.abs(p.z) < 14.5 && p.x * dir > 27 && (Math.abs(p.z) < 11.5 || p.x * dir > 39)) {
      let shotBlocked = false;
      for (const o of opps) {
        if (o.assignedRole === 'POR') continue;
        if (
          (o.x - p.x) * dir > 0 &&
          this.pointToSegmentDist(o.x, o.z, p.x, p.z, oppGoalX, 0) < 1.35
        ) {
          shotBlocked = true;
          break;
        }
      }
      const { xg } = this.computeShotXg(p);
      const strongFootMatch =
        p.foot === 'A' ||
        (p.foot === 'D' && p.z <= 4) ||
        (p.foot === 'I' && p.z >= -4)
          ? 0.9
          : 0;
      const longShotBonus = distToGoal > 19.5 && shootSkill > 0.82 && !shotBlocked ? 1.2 : 0;
      shootUtility =
        xg * 22.5 +
        shootSkill * 3.7 +
        strongFootMatch +
        longShotBonus +
        (tactics.mentality === 'ataque_total' ? 1.5 : tactics.mentality === 'ofensiva' ? 0.7 : 0) -
        (shotBlocked ? 10.5 : 0) +
        noise();
    }

    // 2. Score CUT-BACK ("Pase de la muerte")
    let cutbackUtility = -99;
    let cutbackTarget: PlayerMatchState | null = null;
    if (!isGK && p.x * dir > 38 && Math.abs(p.z) > 10.5) {
      cutbackTarget =
        mates
          .filter((m) => m.x * dir > 32 && m.x * dir < 46 && Math.abs(m.z) < 11)
          .sort((a, b) => {
            const spA = opps.reduce((minD, o) => Math.min(minD, dist2D(a.x, a.z, o.x, o.z)), 10);
            const spB = opps.reduce((minD, o) => Math.min(minD, dist2D(b.x, b.z, o.x, o.z)), 10);
            return spB - spA;
          })[0] || null;
      if (cutbackTarget) {
        cutbackUtility = 10.5 + (nearestOppDist < 5 ? 2.5 : 0) + noise() * 0.7;
      }
    }

    // 3. Score CROSS option
    let crossUtility = -99;
    let crossTarget: PlayerMatchState | null = null;
    if (!isGK && p.x * dir > 27 && Math.abs(p.z) > 15.5) {
      const boxRunners = mates.filter((m) => m.x * dir > 33 && Math.abs(m.z) < 13);
      crossTarget =
        boxRunners.find((m) => m.assignedRole === 'DC') ||
        boxRunners[Math.floor(Math.random() * boxRunners.length)] ||
        null;
      if (crossTarget) {
        const naturalCrossFlank =
          (p.z > 0 && p.foot === 'D') || (p.z < 0 && p.foot === 'I') || p.foot === 'A';
        crossUtility =
          7.4 +
          (nearestOppDist < 5.5 ? 3.5 : 0) +
          (naturalCrossFlank ? 2.2 : -1.5) +
          noise();
      }
    }

    // 4. Score SWITCH OF PLAY (only under genuine local flank congestion, not every touch)
    let switchUtility = -99;
    let switchTarget: PlayerMatchState | null = null;
    const sameSideOpps = opps.filter((o) => Math.abs(o.z - p.z) < 11.5 && Math.abs(o.x - p.x) < 11.5).length;
    if (!isGK && sameSideOpps >= 3 && nearestOppDist < 8.0 && visionSkill > 0.74) {
      switchTarget =
        mates
          .filter((m) => {
            if (m.assignedRole === 'POR') return false;
            const dSwitch = dist2D(p.x, p.z, m.x, m.z);
            if (dSwitch > 44 || Math.abs(m.z - p.z) < 24 || Math.abs(m.z) > HALF_W - 4.0) return false;
            if ((m.x - p.x) * dir < -4) return false;
            const freeSpace = opps.reduce((minD, o) => Math.min(minD, dist2D(m.x, m.z, o.x, o.z)), 12);
            if (freeSpace < 9.5) return false;
            const closeBlocker = opps.some((o) => this.pointToSegmentDist(o.x, o.z, p.x, p.z, m.x, m.z) < 2.2);
            return !closeBlocker;
          })
          .sort((a, b) => Math.abs(b.z - p.z) - Math.abs(a.z - p.z))[0] || null;
      if (switchTarget) {
        switchUtility = 5.4 + visionSkill * 2.1 + sameSideOpps * 0.42 + noise() * 0.5;
      }
    }

    // 5. Score PASS options (prefer crisp 8-18m combinations & triangles over constant 30m switches)
    let bestMate: PlayerMatchState | null = null;
    let bestPassUtility = -99;
    let bestIsThrough = false;

    const scanMaxDist = 32 + visionSkill * 22;
    const directnessWeight =
      tactics.passing === 'largo'
        ? 1.75
        : tactics.passing === 'directo'
        ? 1.35
        : tactics.passing === 'corto'
        ? 0.58
        : 0.95;
    const counterBoost = tactics.counterAttack && this.transitionTimer > 0 ? 1.48 : 1.0;

    for (const m of mates) {
      if (m.assignedRole === 'POR' && p.x * dir > -4 && nearestOppDist > 3.6) continue;
      if (isGK && !tactics.playOutFromBack && dist2D(p.x, p.z, m.x, m.z) < 16) continue;

      const d = dist2D(p.x, p.z, m.x, m.z);
      if (d < 4 || d > scanMaxDist) continue;

      const oppLine = p.side === 'home' ? this.awayOffsideLineX : this.homeOffsideLineX;
      const isOffsidePos = (m.x - this.ball.x) * dir > 0 && (m.x - oppLine) * dir > 0.55;
      if (isOffsidePos && Math.random() < 0.72 + visionSkill * 0.26) continue;

      let laneBlocked = 0;
      for (const o of opps) {
        const segDist = this.pointToSegmentDist(o.x, o.z, p.x, p.z, m.x, m.z);
        if (segDist < 1.55) laneBlocked += 1;
      }

      const forwardGain = (m.x - p.x) * dir;
      const idealDist =
        tactics.passing === 'corto'
          ? 10.5
          : tactics.passing === 'largo'
          ? 24.5
          : tactics.passing === 'directo'
          ? 17.5
          : 13.5;
      const longPassPenalty =
        d > 23 && tactics.passing !== 'largo'
          ? -(d - 23) * (tactics.passing === 'corto' ? 0.42 : tactics.passing === 'directo' ? 0.16 : 0.28)
          : 0;
      const distScore = -Math.abs(d - idealDist) * 0.27 + longPassPenalty;
      const openSpace = Math.min(
        7.5,
        opps.reduce((minD, o) => Math.min(minD, dist2D(m.x, m.z, o.x, o.z)), 12)
      );

      // Facing-angle constraint: players rarely hit blind 180° passes behind their body without pressure
      const angleToMate = Math.atan2(m.z - p.z, m.x - p.x);
      let facingDiff = Math.abs(angleToMate - p.facing);
      if (facingDiff > Math.PI) facingDiff = Math.PI * 2 - facingDiff;
      const blindBackPenalty = facingDiff > Math.PI * 0.62 && nearestOppDist > 3.6 ? -8.5 : -facingDiff * 1.1;

      const isRunner =
        (m.intent === 'desmarque_ruptura' || m.intent === 'pared') &&
        forwardGain > 6 &&
        d < (isDefenderOrAnchor ? 26 : 34);
      const throughBonus = isRunner ? visionSkill * 7.2 * counterBoost : 0;
      const buildUpBonus =
        tactics.playOutFromBack &&
        p.x * dir < -15 &&
        (m.assignedRole === 'MCD' || m.assignedRole === 'DFC' || m.assignedRole === 'LI' || m.assignedRole === 'LD')
          ? 3.8
          : 0;
      const shortComboBonus =
        d >= 5.5 && d <= 18.5 && laneBlocked === 0 && openSpace > 2.3 && forwardGain > -2.5
          ? tactics.passing === 'corto'
            ? 4.4
            : tactics.passing === 'mixto'
            ? 3.4
            : 2.0
          : d >= 5.5 && d <= 16.0 && laneBlocked === 0 && openSpace > 2.8 && forwardGain > -5 && nearestOppDist < 4.5
          ? 1.6
          : 0;
      const antiBouncePenalty =
        m.id === this.ball.lastPasserId && forwardGain <= 2.5 && nearestOppDist > 3.2
          ? -4.8
          : 0;
      const recycleBonus =
        forwardGain <= 2 && nearestOppDist < 4.4 && openSpace > 4.5 && tactics.passing !== 'largo'
          ? 5.2
          : forwardGain <= 1 && nearestOppDist > 5.5
          ? -1.0
          : 0;
      const cleanLaneBonus = laneBlocked === 0 && openSpace > 3.0 ? 3.2 : 0;

      const score =
        forwardGain * 0.30 * directnessWeight * counterBoost +
        openSpace * 0.92 +
        distScore +
        throughBonus +
        buildUpBonus +
        shortComboBonus +
        antiBouncePenalty +
        recycleBonus +
        cleanLaneBonus +
        blindBackPenalty -
        laneBlocked * (18.5 - visionSkill * 4) +
        (m.assignedRole === 'MCO' || m.assignedRole === 'MC' || m.assignedRole === 'MCD' ? 2.1 : 0) +
        noise() * 0.6;

      if (score > bestPassUtility) {
        bestPassUtility = score;
        bestMate = m;
        bestIsThrough = isRunner;
      }
    }

    // 6. Score CLEARANCE option
    let clearanceUtility = -99;
    if (!isGK && p.x * dir < -24 && nearestOppDist < 3.4) {
      const pressurePanic = (1 - decisionQuality) * 5.0;
      clearanceUtility = 5.0 + pressurePanic + (tactics.playOutFromBack ? -2.0 : 3.0);
    }

    // 7. Score DRIBBLE / CARRY option (FM08 Rule: heavily penalized if clean pass lanes exist; requires 6-8m green runway)
    let aheadBlocked = false;
    for (const o of opps) {
      if ((o.x - p.x) * dir > 0 && (o.x - p.x) * dir < 7.0 && Math.abs(o.z - p.z) < 2.8) {
        aheadBlocked = true;
        break;
      }
    }
    const hasCleanPass = bestPassUtility > 10.2;
    const spaceCarryBonus =
      !isGK && greenSpaceDist > 6.5
        ? Math.min(isDefenderOrAnchor ? 2.2 : 5.4, (greenSpaceDist - 6.5) * (isDefenderOrAnchor ? 0.3 : 0.52))
        : 0;
    const bylineCornerPenalty =
      !isGK && p.x * dir > 32 && Math.abs(p.z) > HALF_W - 7.5 ? 6.5 : 0;
    const roleCarryBonus =
      p.assignedRole === 'EI' || p.assignedRole === 'ED' || p.assignedRole === 'MCO'
        ? 2.2
        : p.assignedRole === 'CAR' || p.assignedRole === 'DC'
        ? 0.8
        : p.assignedRole === 'MC'
        ? -0.6
        : -4.2;
    const passFirstPenalty =
      hasCleanPass && !(p.x * dir > 24 && dribSkill > 0.78 && greenSpaceDist > 7.5) ? 3.2 : 0;
    const dribbleUtility =
      (isGK ? -20 : 1.6) +
      dribSkill * 3.8 +
      spaceCarryBonus +
      roleCarryBonus +
      (p.instruction === 'libertad_creativa' ? 1.8 : 0) -
      bylineCornerPenalty -
      passFirstPenalty -
      (nearestOppDist < 4.2 ? 6.0 : 0) -
      (aheadBlocked ? 4.5 : 0) -
      tempoBonus * 4.2 +
      noise() * 0.55;

    // Short tactical dribble burst: releases immediately once a clean passing option or shot opens!
    if (
      !isGK &&
      !isDefenderOrAnchor &&
      !(nearestOppDist < 4.2 && bestPassUtility > 7.0) &&
      !(bestPassUtility > 11.4) &&
      !(p.x * dir > 34 && Math.abs(p.z) > HALF_W - 6.5) &&
      p.carrierMode === 'driving' &&
      p.carryCommitTimer > 0 &&
      nearestOppDist > 3.0 &&
      shootUtility < 9.8 &&
      cutbackUtility < 9.0
    ) {
      p.intent = 'conduccion';
      p.actionCooldown = sliceInterval;
      return;
    }

    // Pick highest-utility action for this Decision Slice
    const maxNonDribble = Math.max(
      shootUtility,
      cutbackUtility,
      crossUtility,
      switchUtility,
      bestPassUtility,
      clearanceUtility
    );

    if (shootUtility === maxNonDribble && shootUtility > 11.8) {
      p.carrierMode = 'none';
      p.carryCommitTimer = 0;
      p.intent = 'posicional';
      this.executeShot(p);
      return;
    }
    if (cutbackTarget && cutbackUtility === maxNonDribble && cutbackUtility > 7.5) {
      p.carrierMode = 'none';
      p.carryCommitTimer = 0;
      p.intent = 'posicional';
      this.executePass(p, cutbackTarget, false, false, false);
      return;
    }
    if (crossTarget && crossUtility === maxNonDribble && crossUtility > 7.0) {
      p.carrierMode = 'none';
      p.carryCommitTimer = 0;
      p.intent = 'posicional';
      this.executePass(p, crossTarget, true, false, false);
      return;
    }
    if (switchTarget && switchUtility === maxNonDribble && switchUtility > 7.5) {
      p.carrierMode = 'none';
      p.carryCommitTimer = 0;
      p.intent = 'posicional';
      this.executePass(p, switchTarget, true, false, true);
      return;
    }
    if (clearanceUtility === maxNonDribble && clearanceUtility > bestPassUtility && clearanceUtility > 6.5) {
      const outlet =
        mates.find((m) => m.assignedRole === 'DC') ||
        mates.sort((a, b) => (b.x - a.x) * dir - (a.x - b.x) * dir)[0];
      if (outlet) {
        p.carrierMode = 'none';
        p.carryCommitTimer = 0;
        p.intent = 'posicional';
        this.executePass(p, outlet, true, false, true);
        return;
      }
    }
    if (bestMate && (bestPassUtility > dribbleUtility || isGK) && (bestPassUtility > 1.0 || isGK)) {
      p.carrierMode = 'none';
      p.carryCommitTimer = 0;
      p.intent = 'posicional';
      this.executePass(p, bestMate, false, bestIsThrough, false);
      return;
    }

    // Dribble / Hold won: commit to controlled burst into green space
    if (!isGK) {
      p.carrierMode = 'driving';
      const maxHold = isDefenderOrAnchor ? 0.16 : 0.22 + dribSkill * 0.26;
      p.carryCommitTimer = Math.max(p.carryCommitTimer, maxHold);
      p.intent = 'conduccion';
    }
    p.actionCooldown = isGK ? 0.2 : sliceInterval;
  }

  private pointToSegmentDist(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
    const l2 = (x2 - x1) ** 2 + (z2 - z1) ** 2;
    if (l2 === 0) return dist2D(px, pz, x1, z1);
    const t = clamp(((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2, 0, 1);
    return dist2D(px, pz, x1 + t * (x2 - x1), z1 + t * (z2 - z1));
  }

  private executePass(
    passer: PlayerMatchState,
    target: PlayerMatchState,
    isCross: boolean,
    isThroughBall = false,
    isSwitchOrClear = false
  ) {
    const dir = this.getAttackDir(passer.side);
    const oppLine = passer.side === 'home' ? this.awayOffsideLineX : this.homeOffsideLineX;

    // Check offside at moment of pass!
    if (
      target.x * dir > 0 &&
      (target.x - this.ball.x) * dir > 0.5 &&
      (target.x - oppLine) * dir > 0.45 &&
      passer.assignedRole !== 'POR'
    ) {
      const stats = passer.side === 'home' ? this.homeStats : this.awayStats;
      stats.offsides += 1;
      const oppTeam: TeamSide = passer.side === 'home' ? 'away' : 'home';
      this.addEvent(
        'offside',
        'Fuera de juego',
        `Bandera arriba. ${target.shortName} estaba adelantado tras el envío de ${passer.shortName}.`,
        passer.side,
        target.shortName
      );
      soundEngine.playWhistle('short');
      this.triggerFreeKick(oppTeam, clamp(target.x, -HALF_L + 4, HALF_L - 4), clamp(target.z, -HALF_W + 4, HALF_W - 4));
      return;
    }

    // Track progressive carry before pass release
    if ((passer.x - passer.carryStartX) * dir >= 10) {
      passer.progressiveCarries += 1;
      (passer.side === 'home' ? this.homeStats : this.awayStats).progressiveCarries += 1;
    }

    // Trigger Pressing Trap if backward pass under opponent pressure
    if ((target.x - passer.x) * dir < -4) {
      this.pressingTriggerTimer = 2.4;
    }

    const d = dist2D(passer.x, passer.z, target.x, target.z);
    const passSkill = (passer.attributes.passing * 0.65 + passer.attributes.vision * 0.35) / 100;
    const fatiguePenalty = passer.stamina < 55 ? (55 - passer.stamina) * 0.0028 : 0;

    const opps = passer.side === 'home' ? this.activeAway : this.activeHome;
    let closestBlockerDist = 99;
    let nearestPressDist = 99;
    let blockerLateralSide = 0;
    for (let i = 0; i < opps.length; i++) {
      const o = opps[i];
      const pressD = dist2D(o.x, o.z, passer.x, passer.z);
      if (pressD < nearestPressDist) nearestPressDist = pressD;
      const segD = this.pointToSegmentDist(o.x, o.z, passer.x, passer.z, target.x, target.z);
      if (segD < closestBlockerDist) {
        closestBlockerDist = segD;
        blockerLateralSide = Math.sign((o.z - passer.z) * (target.x - passer.x) - (o.x - passer.x) * (target.z - passer.z)) || 1;
      }
    }

    const isShortTouch = !isCross && !isSwitchOrClear && !isThroughBall && d < 15.5;
    const isChipLob =
      !isCross && !isSwitchOrClear && closestBlockerDist < 2.6 && d > 11 && d < 30 && passSkill > 0.72 && Math.random() < 0.55;
    const isTrivelaCurve =
      !isCross && !isSwitchOrClear && !isChipLob && (isThroughBall || (d > 14 && closestBlockerDist < 3.2)) && passSkill > 0.75;

    let speed: number;
    let loft: number;
    let spinZ = 0;
    let spinY = 0;

    if (isSwitchOrClear) {
      speed = clamp(21.5 + d * 0.18 + Math.random() * 1.6, 22.0, 29.0);
      loft = 4.2 + d * 0.04;
      spinZ = (passer.foot === 'I' ? 1 : -1) * (2.6 + passSkill * 2.0);
      spinY = 2.0;
    } else if (isCross) {
      const drivenCross = Math.random() < 0.45;
      speed = drivenCross ? clamp(21.5 + d * 0.2, 21.5, 28.0) : clamp(17.5 + d * 0.18, 17.5, 23.5);
      loft = drivenCross ? 3.0 + d * 0.036 : 4.8 + d * 0.056;
      spinZ = (passer.foot === 'I' ? 1 : -1) * (3.6 + passSkill * 2.6);
      spinY = drivenCross ? -2.0 : 2.5;
    } else if (isChipLob) {
      speed = clamp(14.0 + d * 0.2, 14.2, 19.5);
      loft = 3.6 + d * 0.052;
      spinZ = (Math.random() - 0.5) * 1.2;
      spinY = 4.2;
    } else if (isThroughBall) {
      speed = clamp(15.2 + d * 0.26, 15.5, 23.0);
      loft = d > 26 ? 2.8 + d * 0.035 : 0.12;
      spinZ = isTrivelaCurve ? -blockerLateralSide * (2.4 + passSkill * 1.8) : (Math.random() - 0.5) * 1.4;
      spinY = d > 26 ? 1.8 : -1.2;
    } else if (isShortTouch) {
      speed = clamp(12.6 + d * 0.30, 12.6, 17.2);
      loft = 0.08;
      spinZ = (Math.random() - 0.5) * 0.8;
      spinY = -0.6;
    } else {
      speed = clamp(16.2 + d * 0.28, 16.4, 23.5);
      loft = d > 30 ? 3.2 + d * 0.042 : 0.12;
      spinZ = isTrivelaCurve
        ? -blockerLateralSide * (2.2 + passSkill * 1.6)
        : (Math.random() - 0.5) * (1.2 + passSkill * 1.0);
      spinY = d > 30 ? 1.6 : -1.5;
    }

    // Nonlinear passing quality + opponent pressing pressure error (FM08 Gaussian deviation)
    const passQuality = clamp((passSkill - 0.42) / 0.50, 0, 1);
    const speedJitter = (1 - passQuality) * (Math.random() - 0.58) * 3.2;
    speed = clamp(speed + speedJitter, 10.2, 29.5);

    // FM08 "Pase al Pie" bias on standard passes vs leading into space on through-balls
    const effectiveSpeed = loft < 0.5 ? Math.max(9.4, speed * 0.88) : speed * 0.95;
    const leadTime = clamp(d / Math.max(9.5, effectiveSpeed), 0.1, 1.15);
    const velLeadTime = Math.min(leadTime, isThroughBall ? 0.82 : 0.45);
    const spaceLeadX = isThroughBall && target.x * dir < 36 ? dir * (1.8 + passSkill * 2.2) : 0;
    const velLeadRatio = isThroughBall ? 0.72 : 0.28;
    const zMargin = isCross ? 1.8 : 3.2;
    const xMargin = isCross ? 2.2 : 3.0;
    const aimX = clamp(target.x + target.vx * velLeadTime * velLeadRatio + spaceLeadX, -HALF_L + xMargin, HALF_L - xMargin);
    const aimZ = clamp(target.z + target.vz * velLeadTime * velLeadRatio, -HALF_W + zMargin, HALF_W - zMargin);

    const baseErrFactor = Math.pow(1 - passQuality, 1.45);
    const pressureFactor = nearestPressDist < 4.8 ? (4.8 - nearestPressDist) / 4.8 : 0;
    const pressureErr = pressureFactor * (0.55 + (1 - passQuality) * 4.6) * (isShortTouch ? 0.88 : 1.24);
    const inaccuracy =
      baseErrFactor * (d * 0.30 + (isCross ? 3.4 : 2.15)) +
      pressureErr +
      fatiguePenalty * (d * 0.26 + 0.75);
    const errX = (Math.random() - 0.5) * inaccuracy;
    const errZ = (Math.random() - 0.5) * inaccuracy;

    const rawDx = aimX + errX - this.ball.x;
    const rawDz = aimZ + errZ - this.ball.z;
    const distFinal = Math.max(0.5, Math.sqrt(rawDx * rawDx + rawDz * rawDz));

    const perpX = -rawDz / distFinal;
    const perpZ = rawDx / distFinal;
    const tAir = loft > 0.35 ? Math.min(leadTime, (2 * loft) / 9.81) : 0;
    const curveComp = -(spinZ * speed * 0.044) * tAir * (leadTime - 0.5 * tAir);
    const launchDx = rawDx + perpX * curveComp;
    const launchDz = rawDz + perpZ * curveComp;
    const launchLen = Math.max(0.5, Math.sqrt(launchDx * launchDx + launchDz * launchDz));

    this.ball.vx = (launchDx / launchLen) * speed;
    this.ball.vz = (launchDz / launchLen) * speed;
    this.ball.vy = loft;
    this.ball.spinZ = spinZ;
    this.ball.spinY = spinY;
    this.ball.knuckleSeed = Math.random() * Math.PI * 2;
    this.ball.ownerId = null;
    this.intendedPassTargetId = target.id;
    this.ball.lastTouchTeam = passer.side;
    this.ball.lastTouchPlayerId = passer.id;
    this.ball.lastPasserId = passer.id;
    this.ball.lastPassWasKeyCandidate = isCross || isThroughBall || (target.x * dir > 32 && Math.abs(target.z) < 18);
    this.ball.lastPassWasCross = isCross;
    this.ball.lastPassOriginX = passer.x;
    this.ball.lastPassOriginZ = passer.z;
    this.ball.lastPassTimestamp = this.clockSeconds;
    this.ball.isShotInFlight = false;

    if (
      !isCross &&
      !isSwitchOrClear &&
      (target.x - passer.x) * dir > 6 &&
      (passer.assignedRole === 'MC' ||
        passer.assignedRole === 'MCO' ||
        passer.assignedRole === 'LI' ||
        passer.assignedRole === 'LD' ||
        passer.assignedRole === 'CAR') &&
      Math.random() < 0.42
    ) {
      passer.giveAndGoTimer = 1.9;
    }

    passer.passesAttempted += 1;
    passer.actionCooldown = 0.21;
    passer.kickAnimTimer = 0.26;
    passer.lastKickFoot = passer.foot === 'I' ? 'I' : 'D';
    const stats = passer.side === 'home' ? this.homeStats : this.awayStats;
    stats.passesAttempted += 1;

    if (isCross) {
      passer.crossesAttempted += 1;
      stats.crossesAttempted += 1;
      if (passer.x * dir > 30) {
        this.addEvent(
          'cross',
          `Centro al área (${passer.shortName})`,
          `${passer.shortName} envía un centro con rosca buscando a ${target.shortName}.`,
          passer.side,
          passer.shortName
        );
      }
    }

    // Clearance stat if booted from own penalty third under pressure
    if (isSwitchOrClear && passer.x * dir < -22) {
      passer.clearances += 1;
      stats.clearances += 1;
    }

    soundEngine.playKick(clamp(speed / 30, 0.25, 0.85));
  }

  private computeShotXg(shooter: PlayerMatchState): { xg: number; bigChance: boolean } {
    const dir = this.getAttackDir(shooter.side);
    const goalX = dir * HALF_L;
    const dx = Math.abs(goalX - shooter.x);
    const dz = Math.abs(shooter.z);
    const distance = Math.sqrt(dx * dx + dz * dz);

    const angle = Math.atan2(GOAL_HALF_WIDTH * 2 * dx, dx * dx + dz * dz - GOAL_HALF_WIDTH ** 2);
    const distFactor = Math.exp(-0.095 * distance);
    const angleFactor = clamp(angle / 0.8, 0.08, 1.0);

    const opps = shooter.side === 'home' ? this.activeAway : this.activeHome;
    let nearestBlock = 10;
    for (let i = 0; i < opps.length; i++) {
      const o = opps[i];
      if (o.assignedRole === 'POR') continue;
      if ((o.x - shooter.x) * dir > 0) {
        const d = dist2D(shooter.x, shooter.z, o.x, o.z);
        if (d < nearestBlock) nearestBlock = d;
      }
    }
    const pressureFactor = clamp(0.55 + nearestBlock * 0.09, 0.55, 1.15);
    const skillBoost = 0.82 + (shooter.attributes.shooting / 100) * 0.36;

    const xg = clamp(distFactor * angleFactor * pressureFactor * skillBoost * 0.44, 0.02, 0.72);
    return { xg, bigChance: xg >= 0.24 };
  }

  private computeShotXgot(xg: number, targetZ: number, targetY: number, shotSpeed: number, onTarget: boolean): number {
    if (!onTarget) return 0;
    // Corner placement (closer to posts / upper 90) & velocity elevate xGOT above pre-shot xG
    const edgeZ = clamp(Math.abs(targetZ) / GOAL_HALF_WIDTH, 0, 1);
    const edgeY = clamp(targetY / GOAL_HEIGHT, 0, 1);
    const cornerQuality = 0.72 + edgeZ * 0.45 + (edgeY > 0.68 ? 0.32 : edgeY < 0.22 ? 0.14 : 0.02);
    const speedBoost = clamp(0.85 + (shotSpeed - 20) * 0.02, 0.8, 1.25);
    return clamp(xg * cornerQuality * speedBoost, 0.03, 0.94);
  }

  private executeShot(shooter: PlayerMatchState) {
    const dir = this.getAttackDir(shooter.side);
    const oppGoalX = dir * HALF_L;
    const { xg, bigChance } = this.computeShotXg(shooter);

    // Track progressive carry before shooting
    if ((shooter.x - shooter.carryStartX) * dir >= 10) {
      shooter.progressiveCarries += 1;
      (shooter.side === 'home' ? this.homeStats : this.awayStats).progressiveCarries += 1;
    }

    // Check if shot follows a recent error in own defensive zone -> credit errorLeadingToShot
    if (
      this.lastErrorTimer > 0 &&
      this.lastErrorPlayerId &&
      this.lastErrorSide &&
      this.lastErrorSide !== shooter.side
    ) {
      const errPlayer = this.findPlayerById(this.lastErrorPlayerId);
      if (errPlayer) {
        errPlayer.errorsLeadingToShot += 1;
      }
      this.lastErrorTimer = 0;
    }

    // Credit Key Pass & xA to recent passer on same team
    if (
      this.ball.lastPasserId &&
      this.ball.lastPasserId !== shooter.id &&
      this.clockSeconds - this.ball.lastPassTimestamp < 50
    ) {
      const creator = this.findPlayerById(this.ball.lastPasserId);
      if (creator && creator.side === shooter.side) {
        creator.keyPasses += 1;
        creator.xa += xg;
        const cStats = creator.side === 'home' ? this.homeStats : this.awayStats;
        cStats.keyPasses += 1;
        cStats.xa += xg;
      }
    }

    const shootSkill = shooter.attributes.shooting / 100;
    const oppsAll = shooter.side === 'home' ? this.activeAway : this.activeHome;
    const oppGK = oppsAll.find((o) => o.assignedRole === 'POR');

    let nearestOppDist = 12;
    let blockerInLane = false;
    let blockerLateralSign = 0;
    for (let i = 0; i < oppsAll.length; i++) {
      const o = oppsAll[i];
      if (o.assignedRole === 'POR') continue;
      const od = dist2D(shooter.x, shooter.z, o.x, o.z);
      if (od < nearestOppDist) nearestOppDist = od;
    }

    const preferredCornerSign =
      oppGK && shooter.attributes.vision > 74
        ? oppGK.z > 0.25
          ? -1
          : oppGK.z < -0.25
          ? 1
          : Math.random() < 0.5
          ? -1
          : 1
        : Math.random() < 0.5
        ? -1
        : 1;
    // Realistic shot aim & Gaussian error (pressure, range, fatigue, weak foot -> ~38-46% on target)
    const cornerZ = preferredCornerSign * (1.75 + Math.random() * 1.75);
    const dxRaw = oppGoalX - this.ball.x;
    const dzRaw = cornerZ - this.ball.z;
    const dRaw = Math.sqrt(dxRaw * dxRaw + dzRaw * dzRaw);
    const pressureDispersion = nearestOppDist < 3.4 ? (3.4 - nearestOppDist) * 0.78 : 0;
    const fatigueDispersion = shooter.stamina < 60 ? (60 - shooter.stamina) * 0.036 : 0;
    const weakFootDispersion =
      shooter.foot !== 'A' &&
      ((shooter.foot === 'D' && this.ball.z > 5.5) || (shooter.foot === 'I' && this.ball.z < -5.5))
        ? 0.85
        : 0;
    const gaussZ = Math.random() + Math.random() + Math.random() - 1.5; // [-1.5, +1.5], std ~0.5
    const spread =
      1.92 + (1 - shootSkill) * 5.6 + Math.max(0, dRaw - 11.5) * 0.15 + pressureDispersion + fatigueDispersion + weakFootDispersion;
    const targetZ = cornerZ + gaussZ * spread;

    const dxGoal = oppGoalX - this.ball.x;
    const dzGoal = targetZ - this.ball.z;
    const d = Math.sqrt(dxGoal * dxGoal + dzGoal * dzGoal);

    for (let i = 0; i < oppsAll.length; i++) {
      const o = oppsAll[i];
      if (o.assignedRole === 'POR') continue;
      if ((o.x - this.ball.x) * dir > 0 && (o.x - this.ball.x) * dir < d) {
        const segD = this.pointToSegmentDist(o.x, o.z, this.ball.x, this.ball.z, oppGoalX, targetZ);
        if (segD < 2.2) {
          blockerInLane = true;
          const cross = (o.z - this.ball.z) * dxGoal - (o.x - this.ball.x) * dzGoal;
          blockerLateralSign = Math.sign(cross) || 1;
          break;
        }
      }
    }

    const gkDistFromLine = oppGK ? Math.abs(oppGoalX - oppGK.x) : 1.5;
    const isChip =
      gkDistFromLine > 6.2 &&
      d > 10 &&
      d < 25 &&
      shooter.attributes.vision >= 74 &&
      Math.random() < 0.65;
    const isKnuckle = !isChip && d > 19.5 && shootSkill > 0.72 && Math.random() < 0.34;
    const isTopspinDip =
      !isChip && !isKnuckle && d > 16 && shootSkill > 0.68 && (blockerInLane || Math.random() < 0.35);
    const isTrivela =
      !isChip &&
      !isKnuckle &&
      !isTopspinDip &&
      shootSkill > 0.76 &&
      ((shooter.foot === 'D' && this.ball.z > 1.5) || (shooter.foot === 'I' && this.ball.z < -1.5)) &&
      Math.random() < 0.45;
    const isLowDriven = !isChip && !isKnuckle && !isTopspinDip && !isTrivela && d < 22 && Math.random() < 0.4;

    let shotSpeed: number;
    let targetHeight: number;
    let spinZ: number;
    let spinY: number;

    if (isChip) {
      shotSpeed = clamp(16.5 + d * 0.24, 17.0, 22.5);
      targetHeight = 1.75 + Math.random() * 0.75;
      spinZ = (Math.random() - 0.5) * 1.4;
      spinY = 7.4;
    } else if (isKnuckle) {
      shotSpeed = clamp(32.5 + shootSkill * 8.0 + Math.random() * 2.0, 32.5, 40.5);
      targetHeight = 1.05 + Math.random() * (GOAL_HEIGHT + 0.9);
      spinZ = (Math.random() - 0.5) * 0.75;
      spinY = -3.0;
    } else if (isTopspinDip) {
      shotSpeed = clamp(28.5 + shootSkill * 7.2 + Math.random() * 2.0, 28.0, 36.8);
      targetHeight = 1.0 + Math.random() * (GOAL_HEIGHT + 0.8);
      const footSign = shooter.foot === 'I' ? 1 : -1;
      spinZ = blockerInLane ? -blockerLateralSign * (3.2 + shootSkill * 2.5) : footSign * (2.5 + shootSkill * 2.2);
      spinY = -(6.2 + shootSkill * 2.4);
    } else if (isTrivela) {
      shotSpeed = clamp(26.5 + shootSkill * 6.5 + Math.random() * 1.8, 26.0, 33.8);
      targetHeight = 0.8 + Math.random() * (GOAL_HEIGHT + 0.75);
      const trivelaSign = shooter.foot === 'I' ? -1 : 1;
      spinZ = trivelaSign * (6.4 + shootSkill * 3.6);
      spinY = -3.4;
    } else if (isLowDriven) {
      shotSpeed = clamp(28.0 + shootSkill * 7.2, 27.5, 35.8);
      targetHeight = 0.16 + Math.random() * 0.82;
      const curveSign = blockerInLane ? -blockerLateralSign : shooter.foot === 'I' ? 1 : -1;
      spinZ = curveSign * (3.2 + shootSkill * 2.8);
      spinY = -2.8;
    } else {
      shotSpeed = clamp(25.5 + shootSkill * 6.8 + Math.random() * 2.0, 25.0, 33.2);
      const skyChance = Math.random() < (d > 18 || nearestOppDist < 3.0 ? 0.34 : 0.22) ? 0.7 + Math.random() * 1.05 : 0;
      targetHeight = 0.65 + Math.random() * (GOAL_HEIGHT + 0.35 - shootSkill * 0.25) + skyChance;
      const finesseSign = blockerInLane
        ? -blockerLateralSign
        : shooter.foot === 'A'
        ? -preferredCornerSign * dir
        : shooter.foot === 'I'
        ? 1
        : -1;
      spinZ = finesseSign * (6.8 + shootSkill * 3.9);
      spinY = -3.1;
    }

    if (!isChip && !isLowDriven && Math.random() < (d > 16 ? 0.38 : 0.24)) {
      targetHeight += 0.65 + Math.random() * 1.1;
    }

    const avgShotSpeed = shotSpeed * Math.exp(-DRAG_COEFF_FACTOR * 0.21 * d * 0.5);
    const flightTime = d / Math.max(8, avgShotSpeed);
    const verticalMagnusAccel = spinY * avgShotSpeed * 0.025;
    const netGravity = 9.81 - verticalMagnusAccel;
    const vyNeeded =
      (targetHeight - this.ball.y + 0.5 * netGravity * flightTime * flightTime) / Math.max(0.15, flightTime);

    const perpX = -dzGoal / Math.max(1, d);
    const perpZ = dxGoal / Math.max(1, d);
    const lateralMagnusAccel = spinZ * avgShotSpeed * 0.05;
    const lateralDrift = 0.5 * lateralMagnusAccel * flightTime * flightTime;
    const launchDx = dxGoal - perpX * lateralDrift;
    const launchDz = dzGoal - perpZ * lateralDrift;
    const launchLen = Math.max(0.5, Math.sqrt(launchDx * launchDx + launchDz * launchDz));

    const onFrame = Math.abs(targetZ) < GOAL_HALF_WIDTH - 0.08 && targetHeight < GOAL_HEIGHT - 0.06;
    const xgot = this.computeShotXgot(xg, targetZ, targetHeight, shotSpeed, onFrame);

    this.ball.vx = (launchDx / launchLen) * shotSpeed;
    this.ball.vz = (launchDz / launchLen) * shotSpeed;
    this.ball.vy = clamp(vyNeeded, 0.75, 11.8);
    this.ball.spinZ = spinZ;
    this.ball.spinY = spinY;
    this.ball.knuckleSeed = Math.random() * Math.PI * 2;
    this.ball.ownerId = null;
    this.intendedPassTargetId = null;
    this.ball.lastTouchTeam = shooter.side;
    this.ball.lastTouchPlayerId = shooter.id;
    this.ball.isShotInFlight = true;
    this.shotElapsed = 0;
    this.ball.shotTeam = shooter.side;
    this.ball.shotXgot = xgot;
    this.ball.shotTargetY = targetHeight;
    this.ball.shotTargetZ = targetZ;

    shooter.shots += 1;
    shooter.xgGenerated += xg;
    shooter.xgotGenerated += xgot;
    shooter.actionCooldown = 0.8;
    shooter.kickAnimTimer = 0.34;
    shooter.lastKickFoot = shooter.foot === 'I' ? 'I' : 'D';

    const stats = shooter.side === 'home' ? this.homeStats : this.awayStats;
    stats.shots += 1;
    stats.xg += xg;
    stats.xgot += xgot;
    if (bigChance) stats.bigChances += 1;

    this.pendingRestartPos = { x: shooter.x * dir, z: shooter.z * dir };
    this.shots.push({
      id: `shot-${++this.shotCounter}`,
      minute: this.getDisplayMinute(),
      second: Math.floor(this.clockSeconds % 60),
      side: shooter.side,
      playerId: shooter.id,
      playerName: shooter.shortName,
      x: Number((shooter.x * dir).toFixed(1)),
      z: Number((shooter.z * dir).toFixed(1)),
      xg: Number(xg.toFixed(2)),
      xgot: Number(xgot.toFixed(2)),
      outcome: 'fuera',
    });

    soundEngine.playKick(isChip ? 0.55 : 1.0);
    this.recordTelemetryFrame('SHOT');
  }

  private closestPointOnSegment3D(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number
  ): { x: number; y: number; z: number; dist: number } {
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const lenSq = abx * abx + aby * aby + abz * abz;
    const t =
      lenSq > 0.000001
        ? clamp(((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / lenSq, 0, 1)
        : 0;
    const px = ax + abx * t;
    const py = ay + aby * t;
    const pz = az + abz * t;
    const dx = px - cx;
    const dy = py - cy;
    const dz = pz - cz;
    return { x: px, y: py, z: pz, dist: Math.sqrt(dx * dx + dy * dy + dz * dz) };
  }

  private resolveShotBallCCD() {
    if (!this.ball.isShotInFlight || !this.ball.shotTeam) return;
    const defPlayers = this.ball.shotTeam === 'home' ? this.activeAway : this.activeHome;

    const ax = this.ball.prevX;
    const ay = this.ball.prevY;
    const az = this.ball.prevZ;
    const bx = this.ball.x;
    const by = this.ball.y;
    const bz = this.ball.z;

    // 1. Outfield Defender Physical Block Swept-Sphere CCD
    for (const def of defPlayers) {
      if (def.assignedRole === 'POR' || def.actionCooldown > 0) continue;
      // Check against player vertical torso/shin capsule height [def.y + 0.15 .. def.y + 1.65]
      const capY = clamp((ay + by) * 0.5, def.y + 0.25, def.y + (def.slideTimer > 0 ? 0.55 : 1.65));
      const hit = this.closestPointOnSegment3D(ax, ay, az, bx, by, bz, def.x, capY, def.z);
      const blockRadius = (def.slideTimer > 0 ? 0.62 : 0.42) + BALL_RADIUS;
      if (hit.dist <= blockRadius) {
        this.ball.x = hit.x;
        this.ball.y = hit.y;
        this.ball.z = hit.z;
        const attStats = this.ball.shotTeam === 'home' ? this.homeStats : this.awayStats;
        attStats.shotsBlocked += 1;
        const lastShot = this.shots[this.shots.length - 1];
        if (lastShot) lastShot.outcome = 'bloqueado';
        def.shotsBlocked += 1;
        def.interceptions += 1;

        const nx = hit.x - def.x;
        const nz = hit.z - def.z;
        const nLen = Math.max(0.15, Math.sqrt(nx * nx + nz * nz));
        const ux = nx / nLen;
        const uz = nz / nLen;
        const vDotN = this.ball.vx * ux + this.ball.vz * uz;
        if (vDotN < 0) {
          const corBody = 0.46;
          this.ball.vx -= (1 + corBody) * vDotN * ux;
          this.ball.vz -= (1 + corBody) * vDotN * uz;
          this.ball.vx += (Math.random() - 0.5) * 2.2;
          this.ball.vz += (Math.random() - 0.5) * 2.2;
        } else {
          this.ball.vx *= -0.38;
          this.ball.vz += (Math.random() - 0.5) * 5.5;
        }
        this.ball.vy = clamp(Math.abs(this.ball.vy) * 0.4 + 2.4, 1.8, 5.2);
        this.ball.spinZ = (Math.random() - 0.5) * 7.5;
        this.ball.spinY = 2.2;
        this.reboundTimer = 2.4;
        this.reboundShotSide = this.ball.shotTeam;
        this.ball.isShotInFlight = false;
        this.ball.lastTouchTeam = def.side;
        this.ball.lastTouchPlayerId = def.id;
        this.ball.lastPasserId = null;
        def.actionCooldown = 0.35;
        soundEngine.playKick(0.5);
        return;
      }
    }

    // 2. Goalkeeper Spatial IK Reach Capsule + Swept-Sphere CCD (Zero Random Save Rolls!)
    const gk = defPlayers.find((o) => o.assignedRole === 'POR');
    if (!gk || gk.actionCooldown > 0) return;

    const gkSkill = gk.attributes.gk / 100;
    const gkTier = clamp((gk.attributes.gk - 35) / 60, 0, 1);
    const staminaMod = gk.stamina < 55 ? 0.88 : 1.0;

    // Torso center hit test
    const torsoY = clamp((ay + by) * 0.5, gk.y + 0.30, gk.y + 1.98);
    const hitTorso = this.closestPointOnSegment3D(ax, ay, az, bx, by, bz, gk.x, torsoY, gk.z);

    // Outstretched IK Glove hand coordinate during dive or standing reflex reach
    let hitArmDist = 99;
    let hitPoint = hitTorso;
    if (gk.diveAnimTimer > 0) {
      const diveProg = Math.max(0.38, Math.sin((gk.diveAnimTimer / 0.55) * Math.PI));
      const reachSpan = (1.02 + gkTier * 0.76) * staminaMod * diveProg;
      const handZ = gk.z + gk.diveDir * reachSpan;
      const handY = clamp(gk.diveHeight, 0.25, GOAL_HEIGHT - 0.04);
      const midZ = (gk.z + handZ) * 0.5;
      const midY = (1.15 + handY) * 0.5;
      const hitHand = this.closestPointOnSegment3D(ax, ay, az, bx, by, bz, gk.x, handY, handZ);
      const hitForearm = this.closestPointOnSegment3D(ax, ay, az, bx, by, bz, gk.x, midY, midZ);
      if (hitHand.dist < hitForearm.dist) {
        hitArmDist = hitHand.dist;
        if (hitHand.dist < hitTorso.dist) hitPoint = hitHand;
      } else {
        hitArmDist = hitForearm.dist;
        if (hitForearm.dist < hitTorso.dist) hitPoint = hitForearm;
      }
    } else {
      // Standing reflex arm reach scaled by GK quality
      const standSpan = (0.48 + gkTier * 0.36) * staminaMod;
      const sideDir = Math.sign(((az + bz) * 0.5) - gk.z) || 1;
      const standY = clamp((ay + by) * 0.5, gk.y + 0.25, gk.y + 2.24);
      const hitStandArm = this.closestPointOnSegment3D(ax, ay, az, bx, by, bz, gk.x, standY, gk.z + sideDir * standSpan);
      hitArmDist = hitStandArm.dist;
      if (hitStandArm.dist < hitTorso.dist) hitPoint = hitStandArm;
    }

    const torsoReach = 0.38 + gkTier * 0.16 + BALL_RADIUS;
    const gloveReach = 0.28 + gkTier * 0.18 + BALL_RADIUS;
    const isTorsoSave = hitTorso.dist <= torsoReach;
    const isGloveSave = hitArmDist <= gloveReach;

    if (!isTorsoSave && !isGloveSave) return;

    const ballSpeed = Math.sqrt(this.ball.vx ** 2 + this.ball.vz ** 2 + this.ball.vy ** 2);

    // Fingertip deflection failure on hard corner shots for lower-rated goalkeepers
    if (!isTorsoSave && isGloveSave && ballSpeed > 25.5) {
      const controlEdge = gloveReach * (0.72 + gkTier * 0.26);
      if (hitArmDist > controlEdge) {
        this.ball.vx *= 0.87;
        this.ball.vz *= 0.94;
        this.ball.vy += 0.3;
        this.ball.spinZ += (Math.random() - 0.5) * 4.5;
        gk.actionCooldown = 0.35;
        soundEngine.playKick(0.38);
        return;
      }
    }

    // REAL PHYSICAL SAVE!
    this.ball.x = hitPoint.x;
    this.ball.y = hitPoint.y;
    this.ball.z = hitPoint.z;

    gk.saves += 1;
    gk.xgotFaced += this.ball.shotXgot;
    const defStats = gk.side === 'home' ? this.homeStats : this.awayStats;
    defStats.saves += 1;
    const attStats = this.ball.shotTeam === 'home' ? this.homeStats : this.awayStats;
    attStats.shotsOnTarget += 1;

    const lastShot = this.shots[this.shots.length - 1];
    if (lastShot) lastShot.outcome = 'parada';

    const shooter = this.findPlayerById(this.ball.lastTouchPlayerId);
    if (shooter) shooter.shotsOnTarget += 1;

    this.addEvent(
      'save',
      `¡Paradón de ${gk.shortName}!`,
      `Estirada y respuesta de reflejos ante el remate${shooter ? ` de ${shooter.shortName}` : ''}.`,
      gk.side,
      gk.shortName,
      undefined,
      false
    );

    // Clean catch only when ball strikes near core/torso at moderate speed; fingertip stretches always parry!
    const cleanCatch = isTorsoSave && ballSpeed < 23.5 + gkSkill * 4.5 && !isGloveSave;
    if (cleanCatch) {
      this.ball.ownerId = gk.id;
      this.ball.isShotInFlight = false;
      this.ball.lastTouchTeam = gk.side;
      this.ball.lastTouchPlayerId = gk.id;
      this.ball.lastPasserId = null;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.vz = 0;
      gk.actionCooldown = 0.65;
    } else {
      const dir = this.getAttackDir(gk.side);
      const parrySpeed = clamp(ballSpeed * 0.46 + 4.2, 8.2, 16.2);
      const sideBias = (gk.diveDir !== 0 ? gk.diveDir : Math.sign(hitPoint.z - gk.z) || 1) * (0.65 + Math.random() * 0.35);
      const outX = dir * 0.72;
      const outZ = sideBias;
      const outLen = Math.max(0.3, Math.sqrt(outX * outX + outZ * outZ));
      this.ball.vx = (outX / outLen) * parrySpeed;
      this.ball.vz = (outZ / outLen) * parrySpeed;
      this.ball.vy = clamp(Math.abs(this.ball.vy) * 0.42 + 2.5, 2.0, 5.2);
      this.ball.spinZ = -sideBias * 5.2;
      this.ball.spinY = 2.4;
      this.reboundTimer = 2.6;
      this.reboundShotSide = this.ball.shotTeam;
      this.ball.isShotInFlight = false;
      this.ball.lastTouchTeam = gk.side;
      this.ball.lastTouchPlayerId = gk.id;
      this.ball.lastPasserId = null;
      gk.actionCooldown = 0.55;
    }
    soundEngine.playKick(0.7);
    this.recordTelemetryFrame('SAVE');
  }

  private checkBallInteraction(p: PlayerMatchState, dt: number) {
    if (this.ball.ownerId === p.id || p.actionCooldown > 0) return;

    const d = dist2D(p.x, p.z, this.ball.x, this.ball.z);
    const reach = p.assignedRole === 'POR' ? 1.45 : p.slideTimer > 0 ? 1.35 : 1.05;
    if (d > reach || this.ball.y > p.y + (p.assignedRole === 'POR' ? 2.4 : 1.95)) return;

    // Shot blocking & GK saves are handled via Swept-Sphere CCD in resolveShotBallCCD
    if (this.ball.isShotInFlight && this.ball.shotTeam !== p.side) return;

    // If ball is loose
    if (!this.ball.ownerId) {
      const pDir = this.getAttackDir(p.side);

      // Aerial Duel Resolution when ball is high (> 1.15m) and an opponent is also contesting
      if (this.ball.y > 1.15 && p.assignedRole !== 'POR') {
        const oppList = p.side === 'home' ? this.activeAway : this.activeHome;
        let challenger: PlayerMatchState | null = null;
        for (let i = 0; i < oppList.length; i++) {
          const o = oppList[i];
          if (o.assignedRole !== 'POR' && dist2D(o.x, o.z, this.ball.x, this.ball.z) < 2.2) {
            challenger = o;
            break;
          }
        }
        if (challenger) {
          const scoreP =
            p.y * 1.4 +
            (p.attributes.physical * 0.55 + (p.x * pDir > 25 ? p.attributes.shooting : p.attributes.defending) * 0.45) /
              100 +
            Math.random() * 0.25;
          const scoreC =
            challenger.y * 1.4 +
            (challenger.attributes.physical * 0.55 + challenger.attributes.defending * 0.45) / 100 +
            Math.random() * 0.25;

          const winner = scoreP >= scoreC ? p : challenger;
          const loser = scoreP >= scoreC ? challenger : p;
          winner.aerialDuelsWon += 1;
          loser.aerialDuelsLost += 1;
          (winner.side === 'home' ? this.homeStats : this.awayStats).aerialDuelsWon += 1;
          (loser.side === 'home' ? this.homeStats : this.awayStats).aerialDuelsLost += 1;
          this.recordPlayerHeatmapAndAverage(winner);

          const wDir = this.getAttackDir(winner.side);
          // Attacker in box heads downward toward goal!
          if (winner.x * wDir > 36 && Math.abs(winner.z) < 12) {
            this.ball.lastTouchTeam = winner.side;
            this.ball.lastTouchPlayerId = winner.id;
            this.executeShot(winner);
            return;
          }
          // Defender in own third heads high clearance away from box!
          if (winner.x * wDir < -24) {
            winner.clearances += 1;
            winner.interceptions += 1;
            const wStats = winner.side === 'home' ? this.homeStats : this.awayStats;
            wStats.clearances += 1;
            wStats.interceptions += 1;
            this.ball.vx = wDir * (14 + (winner.attributes.physical / 100) * 8);
            this.ball.vz = (Math.random() - 0.5) * 16;
            this.ball.vy = 5.6;
            this.ball.lastTouchTeam = winner.side;
            this.ball.lastTouchPlayerId = winner.id;
            winner.actionCooldown = 0.4;
            loser.actionCooldown = 0.4;
            soundEngine.playKick(0.55);
            return;
          }
          // Midfield aerial knock-down to nearest teammate
          const mates = (winner.side === 'home' ? this.homePlayers : this.awayPlayers).filter(
            (m) => m.onPitch && !m.redCard && m.id !== winner.id
          );
          const mate = mates.sort(
            (a, b) => dist2D(a.x, a.z, winner.x, winner.z) - dist2D(b.x, b.z, winner.x, winner.z)
          )[0];
          if (mate) {
            this.ball.lastTouchTeam = winner.side;
            this.ball.lastTouchPlayerId = winner.id;
            this.executePass(winner, mate, false);
            loser.actionCooldown = 0.42;
            return;
          }
        }
      }

      // First-time volley / header / rebound strike in opponent box
      const isReboundBall = this.reboundTimer > 0 && p.x * pDir > 32;
      if (
        p.assignedRole !== 'POR' &&
        (isReboundBall ||
          (this.ball.lastTouchTeam === p.side &&
            this.ball.lastPasserId &&
            this.ball.lastPasserId !== p.id)) &&
        p.x * pDir > 34 &&
        Math.abs(p.z) < 14 &&
        (p.assignedRole === 'DC' || p.assignedRole === 'MCO' || p.assignedRole === 'EI' || p.assignedRole === 'ED')
      ) {
        const firstTimeChance = (isReboundBall ? 0.62 : 0.28) + (p.attributes.shooting / 100) * 0.34;
        if (Math.random() < firstTimeChance) {
          if (isReboundBall) {
            this.reboundTimer = 0;
            this.ball.lastPasserId = null;
            (p.side === 'home' ? this.homeStats : this.awayStats).reboundsRecovered += 1;
            this.addEvent(
              'rebound',
              `¡Caza el rebote ${p.shortName}!`,
              `${p.shortName} reacciona al instante al balón suelto en el área y arma el remate.`,
              p.side,
              p.shortName
            );
          } else {
            const passer = this.findPlayerById(this.ball.lastPasserId);
            if (passer && passer.side === p.side) {
              this.completePassAccounting(passer, p);
            } else {
              this.ball.lastPasserId = null;
            }
          }
          this.recordPlayerHeatmapAndAverage(p);
          this.ball.lastTouchPlayerId = p.id;
          this.executeShot(p);
          return;
        }
      } else if (
        this.ball.y > 0.95 &&
        p.assignedRole !== 'POR' &&
        p.x * pDir < -28 &&
        this.ball.lastTouchTeam !== p.side
      ) {
        p.interceptions += 1;
        p.clearances += 1;
        const stats = p.side === 'home' ? this.homeStats : this.awayStats;
        stats.interceptions += 1;
        stats.clearances += 1;
        this.recordPlayerHeatmapAndAverage(p);
        this.ball.vx = pDir * (14 + (p.attributes.physical / 100) * 8);
        this.ball.vz = (Math.random() - 0.5) * 18;
        this.ball.vy = 5.5;
        this.ball.isShotInFlight = false;
        this.ball.lastTouchTeam = p.side;
        this.ball.lastTouchPlayerId = p.id;
        this.ball.lastPasserId = null;
        p.actionCooldown = 0.38;
        soundEngine.playKick(0.55);
        return;
      }

      // Claiming pass or loose ball (First touch & interception realism)
      const incomingSpeed = Math.sqrt(this.ball.vx ** 2 + this.ball.vz ** 2);
      const isSameTeamBall = this.ball.lastTouchTeam === p.side;

      // Moving opponent passes at pace aren't magically vacuumed: defender anticipation & reading scale strongly
      if (!isSameTeamBall && this.ball.lastTouchTeam && incomingSpeed > 6.5 && p.assignedRole !== 'POR') {
        const readSkill = (p.attributes.defending * 0.62 + p.attributes.vision * 0.38) / 100;
        const readTier = clamp((readSkill - 0.42) / 0.48, 0, 1);
        const interceptProb = clamp(
          0.20 + readTier * 0.54 - Math.max(0, incomingSpeed - 10.0) * 0.018 + (p.slideTimer > 0 ? 0.15 : 0),
          0.12,
          0.84
        );
        if (Math.random() > interceptProb) {
          p.actionCooldown = 0.2;
          return;
        }
      }

      const fatigueTouch = p.stamina < 48 ? (48 - p.stamina) * 0.003 : 0;
      const firstTouchSkill =
        (p.attributes.dribbling * 0.58 + p.attributes.passing * 0.27 + p.attributes.physical * 0.15) / 100 -
        fatigueTouch;
      const aerialDifficulty = this.ball.y > 0.95 ? 0.06 : 0;
      const oppsNearTouch = p.side === 'home' ? this.activeAway : this.activeHome;
      let nearestTouchOppDist = 99;
      for (let i = 0; i < oppsNearTouch.length; i++) {
        const od = dist2D(oppsNearTouch[i].x, oppsNearTouch[i].z, p.x, p.z);
        if (od < nearestTouchOppDist) nearestTouchOppDist = od;
      }
      const touchPressure = nearestTouchOppDist < 2.8 ? ((2.8 - nearestTouchOppDist) / 2.8) * Math.pow(clamp(1 - firstTouchSkill, 0.05, 0.75), 1.45) * 0.26 : 0;
      const speedThresh = isSameTeamBall ? 14.5 + firstTouchSkill * 13.5 : 12.5 + firstTouchSkill * 8.0;
      const heavyTouchChance =
        incomingSpeed > speedThresh || aerialDifficulty > 0 || p.stamina < 36 || touchPressure > 0.01
          ? Math.max(
              0,
              (1 - firstTouchSkill) * ((isSameTeamBall ? 0.09 : 0.24) + Math.max(0, incomingSpeed - speedThresh) * 0.016) +
                aerialDifficulty +
                touchPressure
            )
          : 0;

      if (Math.random() < heavyTouchChance) {
        const deflectAng = Math.atan2(this.ball.vz, this.ball.vx) + (Math.random() - 0.5) * 0.72;
        const reboundSpd = clamp(incomingSpeed * (0.32 + Math.random() * 0.14), 3.0, 8.6);
        this.ball.vx = Math.cos(deflectAng) * reboundSpd;
        this.ball.vz = Math.sin(deflectAng) * reboundSpd;
        this.ball.vy = Math.max(0.4, this.ball.vy * 0.25);
        this.ball.spinZ *= 0.35;
        this.ball.lastTouchTeam = p.side;
        this.ball.lastTouchPlayerId = p.id;
        if (!isSameTeamBall) {
          this.ball.lastPasserId = null;
        }
        this.intendedPassTargetId = null;
        p.actionCooldown = 0.24;
        if (p.x * pDir < -16) {
          this.lastErrorPlayerId = p.id;
          this.lastErrorSide = p.side;
          this.lastErrorTimer = 5.0;
        }
        soundEngine.playKick(0.25);
        return;
      }

      if (this.reboundTimer > 0) {
        this.reboundTimer = 0;
        this.ball.lastPasserId = null;
        (p.side === 'home' ? this.homeStats : this.awayStats).reboundsRecovered += 1;
        if (p.x * pDir > 30 || p.x * pDir < -30) {
          this.addEvent(
            'rebound',
            `Segunda jugada (${p.shortName})`,
            `${p.shortName} gana el rechace en zona de peligro.`,
            p.side,
            p.shortName
          );
        }
      }

      const passer = this.findPlayerById(this.ball.lastPasserId);
      if (passer && passer.side === p.side && passer.id !== p.id) {
        this.completePassAccounting(passer, p);
      } else {
        this.ball.lastPasserId = null;
        if (this.ball.lastTouchTeam && this.ball.lastTouchTeam !== p.side) {
          p.interceptions += 1;
          const stats = p.side === 'home' ? this.homeStats : this.awayStats;
          stats.interceptions += 1;
          if (p.x * pDir > -18) {
            (p.side === 'home' ? this.homeStats : this.awayStats).defActionsForPpda += 1;
          }
          if (this.ball.lastTouchPlayerId) {
            const prevHolder = this.findPlayerById(this.ball.lastTouchPlayerId);
            if (prevHolder && prevHolder.x * this.getAttackDir(prevHolder.side) < -16) {
              this.lastErrorPlayerId = prevHolder.id;
              this.lastErrorSide = prevHolder.side;
              this.lastErrorTimer = 5.0;
            }
          }
        }
      }

      this.recordPlayerHeatmapAndAverage(p);
      const dir = this.getAttackDir(p.side);
      const tactics = p.side === 'home' ? this.homeTactics : this.awayTactics;
      const attackAngle = Math.atan2(0 - p.z * 0.35, dir * 18);
      let faceErr = Math.abs(attackAngle - p.facing);
      if (faceErr > Math.PI) faceErr = Math.PI * 2 - faceErr;

      const oneTouchAllowed =
        p.assignedRole !== 'POR' &&
        this.ball.y < 0.38 &&
        incomingSpeed < 22.5 &&
        faceErr < 0.95 &&
        ((tactics.tempo === 'vertiginoso' && Math.random() < 0.35) ||
          ((tactics.passing === 'corto' || tactics.passing === 'mixto') &&
            firstTouchSkill > 0.72 &&
            Math.random() < 0.24) ||
          (firstTouchSkill > 0.8 && Math.random() < 0.18));

      const runnerSpeed = Math.hypot(p.vx, p.vz);
      const inStrideCatch =
        p.assignedRole !== 'POR' &&
        runnerSpeed > 4.6 &&
        this.ball.y < 0.7 &&
        faceErr < 0.95 &&
        firstTouchSkill > 0.65;

      this.ball.ownerId = p.id;
      this.intendedPassTargetId = null;
      this.ball.isShotInFlight = false;
      this.ball.spinZ = 0;
      this.ball.spinY = 0;
      this.ball.vx = this.ball.vx * 0.22 + p.vx * 0.88;
      this.ball.vz = this.ball.vz * 0.22 + p.vz * 0.88;
      this.ball.vy = Math.min(this.ball.vy, 0.15);
      this.ball.lastTouchTeam = p.side;
      this.ball.lastTouchPlayerId = p.id;
      p.dribbleTouchTimer = inStrideCatch ? 0.02 : 0.05;
      p.carryStartX = p.x;
      p.carryStartZ = p.z;

      if (oneTouchAllowed) {
        p.carrierMode = 'none';
        p.carrierModeTimer = 0;
        p.actionCooldown = 0.08;
      } else if (inStrideCatch) {
        const isDefOrAnchor =
          p.assignedRole === 'POR' || p.assignedRole === 'DFC' || p.assignedRole === 'MCD';
        p.carrierMode = 'driving';
        p.carrierModeTimer = 0;
        p.carryCommitTimer = isDefOrAnchor ? 0.14 : 0.16 + firstTouchSkill * 0.18;
        p.actionCooldown = 0.13;
        p.intent = 'conduccion';
      } else {
        const trapDuration = 0.08 + (1 - firstTouchSkill) * 0.09;
        p.carrierMode = 'trapping';
        p.carrierModeTimer = trapDuration;
        p.scanTurnTarget = attackAngle;
        p.actionCooldown = trapDuration + 0.03;
        p.intent = 'controlando';
      }
      return;
    }

    // Contesting ball from opponent owner (standing 1v1 tackle or sliding tackle!)
    const owner = this.findPlayerById(this.ball.ownerId);
    if (owner && owner.side !== p.side && owner.assignedRole !== 'POR') {
      const ownerDist = dist2D(owner.x, owner.z, this.ball.x, this.ball.z);
      const looseTouchBonus = ownerDist > 1.45 ? 0.14 : 0;
      const slideBonus = p.slideTimer > 0 ? 0.24 : 0;
      const defScore = (p.attributes.defending * 0.56 + p.attributes.physical * 0.24 + p.attributes.vision * 0.20) / 100;
      const dribScore = (owner.attributes.dribbling * 0.60 + owner.attributes.physical * 0.22 + owner.attributes.pace * 0.18) / 100;
      const tightBonus = p.instruction === 'marcaje_ferreo' ? 0.06 : 0;
      const tackleRate =
        clamp(0.12 + tightBonus + looseTouchBonus + slideBonus + (defScore - dribScore) * 0.68, 0.04, 0.68) *
        Math.min(1.6, dt * 26);

      const attTeamStats = owner.side === 'home' ? this.homeStats : this.awayStats;
      const defTeamStats = p.side === 'home' ? this.homeStats : this.awayStats;

      if (Math.random() < tackleRate) {
        const foulProb =
          looseTouchBonus > 0
            ? 0.04
            : (p.slideTimer > 0 ? 0.24 : p.instruction === 'marcaje_ferreo' ? 0.2 : 0.12) *
              (1.25 - defScore * 0.45);
        if (Math.random() < foulProb) {
          p.groundDuelsLost += 1;
          owner.groundDuelsWon += 1;
          owner.foulsWon += 1;
          defTeamStats.groundDuelsLost += 1;
          attTeamStats.groundDuelsWon += 1;
          this.handleFoul(p, owner);
          return;
        }

        // Clean tackle won!
        p.tacklesWon += 1;
        p.groundDuelsWon += 1;
        owner.groundDuelsLost += 1;
        defTeamStats.tacklesWon += 1;
        defTeamStats.groundDuelsWon += 1;
        attTeamStats.groundDuelsLost += 1;
        if (p.x * this.getAttackDir(p.side) > -18) {
          defTeamStats.defActionsForPpda += 1;
        }
        if (owner.x * this.getAttackDir(owner.side) < -16) {
          this.lastErrorPlayerId = owner.id;
          this.lastErrorSide = owner.side;
          this.lastErrorTimer = 5.0;
        }

        owner.dribblesAttempted += 1;
        attTeamStats.dribblesAttempted += 1;
        owner.carrierMode = 'none';
        owner.carrierModeTimer = 0;
        owner.carryCommitTimer = 0;
        owner.actionCooldown = 0.6;
        p.slideTimer = 0;

        this.recordPlayerHeatmapAndAverage(p);
        this.ball.ownerId = p.id;
        this.ball.lastTouchTeam = p.side;
        this.ball.lastTouchPlayerId = p.id;
        this.ball.lastPasserId = null;
        this.ball.vx *= 0.25;
        this.ball.vz *= 0.25;
        const tackleTouchSkill = (p.attributes.dribbling * 0.6 + p.attributes.passing * 0.4) / 100;
        p.dribbleTouchTimer = 0.06;
        p.carryStartX = p.x;
        p.carryStartZ = p.z;
        p.carrierMode = 'scanning';
        p.carrierModeTimer = 0.28 + (1 - tackleTouchSkill) * 0.14;
        p.scanTurnTarget = Math.atan2(0 - p.z * 0.3, this.getAttackDir(p.side) * 18);
        p.actionCooldown = p.carrierModeTimer + 0.06;
        p.intent = 'escaneando';
        soundEngine.playKick(0.45);
      } else if (
        owner.carrierMode === 'driving' &&
        owner.actionCooldown <= 0.15 &&
        dribScore > defScore - 0.06 &&
        Math.random() < clamp(0.028 + (dribScore - defScore) * 0.10, 0.008, 0.075)
      ) {
        // Carrier successfully dribbles past defender in 1v1!
        owner.dribblesAttempted += 1;
        owner.dribblesCompleted += 1;
        owner.groundDuelsWon += 1;
        p.groundDuelsLost += 1;
        attTeamStats.dribblesAttempted += 1;
        attTeamStats.dribblesCompleted += 1;
        attTeamStats.groundDuelsWon += 1;
        defTeamStats.groundDuelsLost += 1;
        p.actionCooldown = 0.48;
        p.stumbleTimer = 0.24;
        if (owner.x * this.getAttackDir(owner.side) > 20 && Math.random() < 0.35) {
          this.addEvent(
            'dribble',
            `Desborde de ${owner.shortName}`,
            `${owner.shortName} supera en el 1v1 a ${p.shortName} en tres cuartos.`,
            owner.side,
            owner.shortName
          );
        }
      }
    }
  }

  private completePassAccounting(passer: PlayerMatchState, receiver: PlayerMatchState) {
    const dir = this.getAttackDir(passer.side);
    passer.passesCompleted += 1;
    const stats = passer.side === 'home' ? this.homeStats : this.awayStats;
    const oppStats = passer.side === 'home' ? this.awayStats : this.homeStats;
    stats.passesCompleted += 1;
    if (this.ball.lastPassWasCross) {
      passer.crossesCompleted += 1;
      stats.crossesCompleted += 1;
      this.ball.lastPassWasCross = false;
    }
    this.recordPassLink(passer.id, receiver.id, passer.side);

    const originX = this.ball.lastPassOriginX;
    const gainX = (receiver.x - originX) * dir;
    const receiverNormX = (receiver.x * dir + HALF_L) / PITCH_LENGTH;

    // Progressive Pass: advances ball >= 10m toward opponent goal OR enters opponent box
    const inOppBox = receiver.x * dir > HALF_L - 16.5 && Math.abs(receiver.z) < 20.16;
    if (gainX >= 10 || (inOppBox && originX * dir < HALF_L - 16.5)) {
      passer.progressivePasses += 1;
      stats.progressivePasses += 1;
    }
    if (inOppBox) {
      stats.passesIntoBox += 1;
    }
    if (receiverNormX >= 0.67) {
      stats.finalThirdPasses += 1;
    }
    // Opponent build-up passes in their defensive + middle thirds count toward defending team's PPDA
    if (receiverNormX < 0.67) {
      oppStats.oppBuildPassesForPpda += 1;
    }
  }

  private recordPassLink(fromId: string, toId: string, side: TeamSide) {
    const key = fromId < toId ? `${fromId}:${toId}` : `${toId}:${fromId}`;
    const existing = this.passMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      this.passMap.set(key, { fromId, toId, side, count: 1 });
    }
  }

  private handleFoul(fouler: PlayerMatchState, victim: PlayerMatchState) {
    const stats = fouler.side === 'home' ? this.homeStats : this.awayStats;
    stats.fouls += 1;
    fouler.foulsCommitted += 1;
    const wasSliding = fouler.slideTimer > 0;
    fouler.slideTimer = 0;
    if (fouler.x * this.getAttackDir(fouler.side) > -18) {
      stats.defActionsForPpda += 1;
    }
    fouler.rating = clamp(fouler.rating - 0.15, 5, 10);

    const oppSide = victim.side;
    const oppDir = this.getAttackDir(oppSide);
    const inPenaltyBox = victim.x * oppDir > HALF_L - 16.5 && Math.abs(victim.z) < 20.16;

    // DOGSO check: last outfield defender stops clear scoring chance inside/at edge of final 24m
    const defendingActive = (fouler.side === 'home' ? this.homePlayers : this.awayPlayers).filter(
      (d) => d.onPitch && !d.redCard && d.assignedRole !== 'POR' && d.id !== fouler.id
    );
    const defendersGoalSide = defendingActive.filter((d) => (d.x - victim.x) * oppDir > 1.2).length;
    const isDogso = victim.x * oppDir > 28 && defendersGoalSide === 0 && Math.abs(victim.z) < 11.5;

    // Card check
    const cardRoll = Math.random();
    if (isDogso && ((wasSliding && cardRoll < 0.28) || cardRoll < 0.12)) {
      fouler.redCard = true;
      fouler.onPitch = false;
      stats.redCards += 1;
      this.addEvent(
        'red_card',
        `¡Roja Directa para ${fouler.shortName}!`,
        `Expulsado por derribar a ${victim.shortName} siendo el último hombre en ocasión manifiesta de gol.`,
        fouler.side,
        fouler.shortName,
        undefined,
        true
      );
    } else if (cardRoll < 0.115 || (inPenaltyBox && cardRoll < 0.20)) {
      fouler.yellowCards += 1;
      stats.yellowCards += 1;
      if (fouler.yellowCards >= 2) {
        fouler.redCard = true;
        fouler.onPitch = false;
        stats.redCards += 1;
        this.addEvent(
          'red_card',
          `¡Tarjeta Roja para ${fouler.shortName}!`,
          `Segunda amarilla tras derribar a ${victim.shortName}. Su equipo queda con diez jugadores.`,
          fouler.side,
          fouler.shortName,
          undefined,
          true
        );
      } else {
        this.addEvent(
          'yellow_card',
          `Tarjeta Amarilla (${fouler.shortName})`,
          `Amonestado por entrada a destiempo sobre ${victim.shortName}.`,
          fouler.side,
          fouler.shortName,
          undefined,
          true
        );
      }
    } else {
      this.addEvent(
        'foul',
        `Falta de ${fouler.shortName}`,
        `El árbitro señala infracción sobre ${victim.shortName}.`,
        fouler.side,
        fouler.shortName
      );
    }

    // Physical knock / injury from heavy foul (FM08 PKM realism)
    const injuryProb = wasSliding ? 0.055 : 0.018;
    if (victim.assignedRole !== 'POR' && victim.knockSeverity < 2 && Math.random() < injuryProb) {
      const severe = Math.random() < 0.35 || victim.stamina < 45;
      victim.knockSeverity = severe ? 2 : 1;
      victim.injured = severe;
      victim.stamina = Math.max(12, victim.stamina - (severe ? 28 : 14));
      this.addEvent(
        'injury',
        severe ? `¡Lesión de ${victim.shortName}!` : `${victim.shortName} queda tocado`,
        severe
          ? `Dura entrada sobre ${victim.shortName}, que no puede correr con normalidad y pide el cambio.`
          : `${victim.shortName} sufre un fuerte golpe tras la acción y continúa con molestias.`,
        victim.side,
        victim.shortName,
        undefined,
        severe
      );
    }

    soundEngine.playWhistle('short');

    if (inPenaltyBox) {
      this.triggerPenalty(oppSide);
    } else {
      this.triggerFreeKick(oppSide, victim.x, victim.z);
    }
  }

  private triggerPenalty(team: TeamSide) {
    const dir = this.getAttackDir(team);
    this.ball.ownerId = null;
    this.intendedPassTargetId = null;
    this.ball.lastPasserId = null;
    this.ball.isShotInFlight = false;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.vz = 0;
    this.ball.x = dir * (HALF_L - 11);
    this.ball.y = 0.11;
    this.ball.z = 0;
    this.ball.prevX = this.ball.x;
    this.ball.prevY = this.ball.y;
    this.ball.prevZ = this.ball.z;
    this.ball.setPiece = 'penalty';
    this.ball.setPieceTeam = team;
    this.ball.setPieceTimer = 1.6;

    const club = team === 'home' ? this.homeClub : this.awayClub;
    this.addEvent(
      'penalty',
      `¡PENALTI a favor de ${club.shortCode}!`,
      `Falta dentro del área. Máxima tensión desde los once metros.`,
      team,
      undefined,
      undefined,
      true
    );
  }

  private triggerFreeKick(team: TeamSide, x: number, z: number) {
    this.ball.ownerId = null;
    this.intendedPassTargetId = null;
    this.ball.lastPasserId = null;
    this.ball.isShotInFlight = false;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.vz = 0;
    this.ball.x = clamp(x, -HALF_L + 3, HALF_L - 3);
    this.ball.y = 0.11;
    this.ball.z = clamp(z, -HALF_W + 2, HALF_W - 2);
    this.ball.prevX = this.ball.x;
    this.ball.prevY = this.ball.y;
    this.ball.prevZ = this.ball.z;
    this.ball.setPiece = 'free_kick';
    this.ball.setPieceTeam = team;
    this.ball.setPieceTimer = 0.9;
  }

  private getTurfSurfaceProps(x: number, z: number): TurfSurfaceProps {
    const absX = Math.abs(x);
    const absZ = Math.abs(z);

    // Chalk / painted lines (touchlines, goal lines, penalty box borders, halfway line) — harder & slicker
    const onLine =
      Math.abs(absX - HALF_L) < 0.18 ||
      Math.abs(absZ - HALF_W) < 0.18 ||
      Math.abs(x) < 0.18 ||
      (absX > HALF_L - 16.7 && absX < HALF_L - 16.3 && absZ < 20.3);
    if (onLine) {
      return {
        restitution: 0.60,
        rollingDecay: 0.32,
        coulombFriction: 0.50,
        spinGrip: 0.1,
        microJitter: 0.015,
      };
    }

    // Worn / trampled goalmouth & penalty box turf — firmer bounce & slightly heavier rolling friction
    if (absX > HALF_L - 16.5 && absZ < 15.5) {
      return {
        restitution: 0.52,
        rollingDecay: 0.48,
        coulombFriction: 0.85,
        spinGrip: 0.16,
        microJitter: 0.045,
      };
    }

    // Watered fast wings — higher restitution & slicker wet-turf glide
    if (absZ > HALF_W - 10) {
      return {
        restitution: 0.58,
        rollingDecay: 0.32,
        coulombFriction: 0.54,
        spinGrip: 0.11,
        microJitter: 0.015,
      };
    }

    // Standard well-manicured central grass (~2.5 m/s² total rolling decel at 5 m/s roll speed, crisp long-pass braking)
    return {
      restitution: 0.55,
      rollingDecay: 0.38,
      coulombFriction: 0.65,
      spinGrip: 0.13,
      microJitter: 0.022,
    };
  }

  private collideCylinderPost(
    cx: number,
    cz: number,
    cy: number | null,
    scoringSide: TeamSide
  ): boolean {
    if (this.postBounceCooldown > 0) return false;
    const dx = this.ball.x - cx;
    const dz = this.ball.z - cz;
    const dy = cy !== null ? this.ball.y - cy : 0;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const minDist = BALL_RADIUS + POST_RADIUS;
    if (dist >= minDist || dist < 0.0001) return false;

    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;
    const vDotN = this.ball.vx * nx + this.ball.vy * ny + this.ball.vz * nz;
    if (vDotN >= 0) return false;

    // Push ball cleanly outside cylindrical metalwork
    this.ball.x = cx + nx * (minDist + 0.01);
    if (cy !== null) this.ball.y = Math.max(BALL_RADIUS, cy + ny * (minDist + 0.01));
    this.ball.z = cz + nz * (minDist + 0.01);

    // FM08 Pure Elastic Woodwork Reflection (crisp long-range post rebounds into midfield)
    const corMetal = 0.87;
    const prevVx = this.ball.vx;
    const prevVy = this.ball.vy;
    const prevVz = this.ball.vz;

    this.ball.vx = prevVx - (1 + corMetal) * vDotN * nx;
    this.ball.vy = prevVy - (1 + corMetal) * vDotN * ny;
    this.ball.vz = prevVz - (1 + corMetal) * vDotN * nz;

    const tangX = prevVx - vDotN * nx;
    const tangY = prevVy - vDotN * ny;
    const tangZ = prevVz - vDotN * nz;
    this.ball.vx -= tangX * 0.08;
    this.ball.vy -= tangY * 0.08;
    this.ball.vz -= tangZ * 0.08;

    this.ball.spinZ = clamp(this.ball.spinZ * 0.5 + (nx * prevVz - nz * prevVx) * 0.45, -14, 14);
    this.ball.spinY = clamp(this.ball.spinY * 0.5 + ny * 3.5, -10, 10);
    this.ball.ownerId = null;
    this.reboundTimer = 2.6;
    this.reboundShotSide = this.ball.shotTeam || scoringSide;
    this.ball.isShotInFlight = false;
    this.postBounceCooldown = 0.14;

    const lastShot = this.shots[this.shots.length - 1];
    if (lastShot) lastShot.outcome = 'poste';
    soundEngine.playPostHit();
    this.addEvent(
      'post',
      cy !== null ? '¡Al larguero!' : '¡Al poste!',
      cy !== null
        ? 'El balón se estrella violentamente contra el travesaño.'
        : 'El balón rebota en la madera del poste.',
      scoringSide
    );
    this.recordTelemetryFrame('POST');
    return true;
  }

  private updateBall(dt: number) {
    // Check if carrier overran or lost physical control of a heavy knock-on touch
    if (this.ball.ownerId) {
      const owner = this.findPlayerById(this.ball.ownerId);
      const tetherLimit = owner?.carrierMode === 'driving' ? 3.1 : 2.55;
      if (!owner || !owner.onPitch || dist2D(owner.x, owner.z, this.ball.x, this.ball.z) > tetherLimit) {
        this.ball.ownerId = null;
      }
    }

    // 1. Gravity + Full 3D Aerodynamics (Air Drag with Drag Crisis, Wind Shear, 3D Magnus, Knuckleball)
    const gravity = 9.81;
    this.ball.vy -= gravity * dt;

    const windFactor = this.ball.y > 0.35 ? clamp((this.ball.y - 0.35) / 7.5, 0, 1) : 0;
    const localWindX = this.windX * windFactor;
    const localWindZ = this.windZ * windFactor;

    const vRelX = this.ball.vx - localWindX;
    const vRelY = this.ball.vy;
    const vRelZ = this.ball.vz - localWindZ;
    const relHoriz = Math.sqrt(vRelX * vRelX + vRelZ * vRelZ);
    const relSpeed = Math.sqrt(relHoriz * relHoriz + vRelY * vRelY);

    if (relHoriz > 1.5 && this.ball.y > BALL_RADIUS + 0.02) {
      const nx = -vRelZ / relHoriz;
      const nz = vRelX / relHoriz;

      // 3D Magnus Force (ω × v_rel): lateral curve (spinZ) + vertical lift/dip (spinY)
      if (Math.abs(this.ball.spinZ) > 0.08) {
        const spinSat = clamp(Math.abs(this.ball.spinZ) / 11, 0, 1);
        const magnusLat = this.ball.spinZ * relHoriz * (0.044 + 0.012 * spinSat) * dt;
        this.ball.vx += nx * magnusLat;
        this.ball.vz += nz * magnusLat;
      }

      if (Math.abs(this.ball.spinY) > 0.1) {
        // +backspin floats, -topspin (folha seca) drives ball sharply downward!
        const magnusVert = this.ball.spinY * relHoriz * 0.026 * dt;
        this.ball.vy += magnusVert;
      }

      // Karman Vortex Knuckleball Shedding when struck hard with near-zero sidespin
      if (this.ball.y > 0.35 && Math.abs(this.ball.spinZ) < 1.25 && relSpeed > 20.0) {
        const t = this.clockSeconds * 0.92 + this.ball.knuckleSeed;
        const flutterLat = (Math.sin(t * 17.3) + 0.62 * Math.cos(t * 29.1)) * 5.2 * dt;
        const flutterVert = (Math.sin(t * 21.7 + 1.1) + 0.45 * Math.cos(t * 31.4)) * 3.8 * dt;
        this.ball.vx += nx * flutterLat;
        this.ball.vz += nz * flutterLat;
        this.ball.vy += flutterVert;
      }
    }

    const horizSpeed = Math.sqrt(this.ball.vx ** 2 + this.ball.vz ** 2);
    const surface = this.getTurfSurfaceProps(this.ball.x, this.ball.z);

    if (this.ball.y > BALL_RADIUS + 0.03) {
      // Full 3D Quadratic Air Drag with Reynolds Drag Crisis (smooth transition 12 -> 23 m/s) + spin roughness
      let cd: number;
      if (relSpeed < 12) {
        cd = 0.46;
      } else if (relSpeed < 23) {
        const s = (relSpeed - 12) / 11;
        const smooth = s * s * (3 - 2 * s);
        cd = 0.46 - smooth * 0.28; // 0.46 -> 0.18
      } else {
        cd = 0.18 + Math.min(0.06, (relSpeed - 23) * 0.003);
      }
      cd += Math.min(0.08, (Math.abs(this.ball.spinZ) + Math.abs(this.ball.spinY)) * 0.0045);

      const dragRatio = Math.exp(-DRAG_COEFF_FACTOR * cd * relSpeed * dt);
      this.ball.vx = localWindX + (this.ball.vx - localWindX) * dragRatio;
      this.ball.vy *= dragRatio;
      this.ball.vz = localWindZ + (this.ball.vz - localWindZ) * dragRatio;

      // Subtle spin decay from air shear
      const spinAirDecay = Math.exp(-0.38 * dt);
      this.ball.spinZ *= spinAirDecay;
      this.ball.spinY *= spinAirDecay;
    } else if (horizSpeed > 0.05) {
      // Surface-aware exponential ball_decay + Coulomb rolling friction
      const nextSpeed = Math.max(
        0,
        horizSpeed * Math.exp(-dt * surface.rollingDecay) - surface.coulombFriction * dt
      );
      const ratio = nextSpeed / horizSpeed;
      this.ball.vx *= ratio;
      this.ball.vz *= ratio;

      if (horizSpeed > 3.0 && !this.ball.ownerId) {
        const nx = -this.ball.vz / horizSpeed;
        const nz = this.ball.vx / horizSpeed;
        const turfWave =
          Math.sin(this.ball.x * 1.35 + this.ball.z * 1.15 + this.ball.knuckleSeed) *
          (0.35 + surface.microJitter * 6.5) *
          dt;
        this.ball.vx += nx * turfWave;
        this.ball.vz += nz * turfWave;
      }

      const grassSpinDecay = Math.exp(-2.8 * dt);
      this.ball.spinZ *= grassSpinDecay;
      this.ball.spinY *= grassSpinDecay;
    } else {
      this.ball.vx = 0;
      this.ball.vz = 0;
      this.ball.spinZ = 0;
      this.ball.spinY = 0;
    }

    const prevX = this.ball.x;
    this.ball.prevX = this.ball.x;
    this.ball.prevY = this.ball.y;
    this.ball.prevZ = this.ball.z;
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
    this.ball.z += this.ball.vz * dt;

    this.ball.spinX = (this.ball.spinX + horizSpeed * dt * 4.1) % (Math.PI * 2);

    // Clear stale intended pass target once pass stops moving or times out so loose balls are contested
    if (
      !this.ball.ownerId &&
      this.intendedPassTargetId &&
      ((horizSpeed < 0.9 && this.ball.y <= BALL_RADIUS + 0.05) ||
        this.clockSeconds - this.ball.lastPassTimestamp > 45)
    ) {
      this.intendedPassTargetId = null;
    }

    // Swept-Sphere Continuous Collision Detection against defenders & GK IK reach envelope!
    this.resolveShotBallCCD();

    // 2. Surface-Based Dynamic Turf Bounce (grazing angle + spin-bite + local turf zone)
    if (this.ball.y <= BALL_RADIUS) {
      this.ball.y = BALL_RADIUS;
      if (this.ball.vy < -1.05) {
        const spinY = this.ball.spinY;
        const grazing = clamp(horizSpeed / Math.max(0.5, Math.abs(this.ball.vy)), 0, 8);
        const grazingAdjust = grazing > 2.4 ? -0.045 : grazing < 1.3 ? 0.035 : 0;
        const spinRestitution = spinY < -1.2 ? -0.04 : spinY > 1.5 ? 0.05 : 0;
        const cor = clamp(surface.restitution + grazingAdjust + spinRestitution, 0.52, 0.64);
        const impactVy = Math.abs(this.ball.vy);
        this.ball.vy = impactVy * cor;

        if (horizSpeed > 0.8) {
          // FM08 Turf Restitution: ~80% horizontal retention on grass bounce (modulated by topspin/backspin)
          const tangMult =
            spinY < 0
              ? clamp(0.82 + clamp(-spinY * 0.012, 0, 0.08), 0.78, 0.90)
              : clamp(0.80 - clamp(spinY * 0.022, 0, 0.14), 0.66, 0.82);
          this.ball.vx *= tangMult;
          this.ball.vz *= tangMult;

          // Sidespin bites laterally into grass according to surface spinGrip
          const nx = -this.ball.vz / horizSpeed;
          const nz = this.ball.vx / horizSpeed;
          const sideKick = this.ball.spinZ * surface.spinGrip;
          this.ball.vx += nx * sideKick;
          this.ball.vz += nz * sideKick;

          // Worn-turf divot micro-deflection on energetic bounces
          if (impactVy > 2.2) {
            const jitter = (Math.random() - 0.5) * surface.microJitter * impactVy;
            this.ball.vx += nx * jitter;
            this.ball.vz += nz * jitter;
          }
        }
        this.ball.spinY *= 0.42;
        this.ball.spinZ *= 0.68;
      } else {
        this.ball.vy = 0;
      }
    }

    // 3. Viscoelastic Goal-Net Mesh Physics during post-goal net celebration
    if (this.goalNetDelayTimer > 0 || this.goalScoredLock) {
      const gxSign = Math.sign(this.ball.x) || 1;
      const absX = Math.abs(this.ball.x);
      if (absX >= HALF_L + GOAL_DEPTH - BALL_RADIUS) {
        this.ball.x = gxSign * (HALF_L + GOAL_DEPTH - BALL_RADIUS);
        this.ball.vx = -this.ball.vx * 0.22;
        this.ball.vz *= 0.42;
        this.ball.vy *= 0.45;
        if (gxSign > 0) this.ball.netRippleRight = Math.max(this.ball.netRippleRight, 0.85);
        else this.ball.netRippleLeft = Math.max(this.ball.netRippleLeft, 0.85);
      }
      if (Math.abs(this.ball.z) >= GOAL_HALF_WIDTH - BALL_RADIUS) {
        this.ball.z = Math.sign(this.ball.z) * (GOAL_HALF_WIDTH - BALL_RADIUS);
        this.ball.vz = -this.ball.vz * 0.24;
        this.ball.vx *= 0.48;
      }
      if (this.ball.y >= GOAL_HEIGHT - BALL_RADIUS) {
        this.ball.y = GOAL_HEIGHT - BALL_RADIUS;
        this.ball.vy = -this.ball.vy * 0.22;
        this.ball.vx *= 0.5;
        this.ball.vz *= 0.5;
      }
      if (absX < HALF_L + 0.15) {
        this.ball.x = gxSign * (HALF_L + 0.15);
        this.ball.vx = Math.abs(this.ball.vx) * gxSign * 0.2;
      }
      return;
    }

    // 4. 3D Cylindrical Goalpost & Crossbar Collisions (both goals)
    if (Math.abs(this.ball.x) >= HALF_L - 0.5 && Math.abs(this.ball.x) <= HALF_L + 0.5) {
      const postX = Math.sign(this.ball.x) * HALF_L;
      const goalSide: TeamSide = this.getAttackDir('home') === Math.sign(postX) ? 'home' : 'away';

      // Left & Right vertical goalposts
      if (this.ball.y <= GOAL_HEIGHT + BALL_RADIUS) {
        if (this.collideCylinderPost(postX, -GOAL_HALF_WIDTH, null, goalSide)) return;
        if (this.collideCylinderPost(postX, GOAL_HALF_WIDTH, null, goalSide)) return;
      }
      // Horizontal crossbar (spanning -GOAL_HALF_WIDTH .. +GOAL_HALF_WIDTH at y = GOAL_HEIGHT)
      if (Math.abs(this.ball.z) <= GOAL_HALF_WIDTH + BALL_RADIUS) {
        if (this.collideCylinderPost(postX, this.ball.z, GOAL_HEIGHT, goalSide)) return;
      }
    }

    // 5. Goal line crossings (Goals, Goal Kicks, Corners)
    if (Math.abs(this.ball.x) >= HALF_L) {
      const crossedRight = this.ball.x >= HALF_L;
      const scoringSide: TeamSide =
        this.getAttackDir('home') === (crossedRight ? 1 : -1) ? 'home' : 'away';

      // Check GOAL! (strictly locked so a ball resting inside the net can never double-score)
      if (
        !this.goalScoredLock &&
        this.goalNetDelayTimer <= 0 &&
        Math.abs(this.ball.z) < GOAL_HALF_WIDTH - 0.08 &&
        this.ball.y < GOAL_HEIGHT - 0.06 &&
        Math.abs(prevX) <= HALF_L + 0.45
      ) {
        this.handleGoal(scoringSide, crossedRight);
        return;
      }

      // Otherwise out over byline (Goal kick or Corner!)
      const attackingSide = scoringSide;
      const defendingSide: TeamSide = attackingSide === 'home' ? 'away' : 'home';

      if (this.ball.lastTouchTeam === attackingSide) {
        this.ball.setPiece = 'goal_kick';
        this.ball.setPieceTeam = defendingSide;
        this.ball.setPieceTimer = 0.9;
        this.ball.x = Math.sign(this.ball.x) * (HALF_L - 5.5);
        this.ball.z = Math.sign(this.ball.z || 1) * 4.5;
      } else {
        const attStats = attackingSide === 'home' ? this.homeStats : this.awayStats;
        attStats.corners += 1;
        this.ball.setPiece = 'corner';
        this.ball.setPieceTeam = attackingSide;
        this.ball.setPieceTimer = 1.0;
        this.ball.x = Math.sign(this.ball.x) * (HALF_L - 0.6);
        this.ball.z = Math.sign(this.ball.z || 1) * (HALF_W - 0.6);
        this.addEvent(
          'corner',
          `Córner (${attackingSide === 'home' ? this.homeClub.shortCode : this.awayClub.shortCode})`,
          `Saque de esquina desde el banderín.`,
          attackingSide
        );
      }
      this.ball.ownerId = null;
      this.intendedPassTargetId = null;
      this.ball.lastPasserId = null;
      this.ball.y = BALL_RADIUS;
      this.ball.prevX = this.ball.x;
      this.ball.prevY = this.ball.y;
      this.ball.prevZ = this.ball.z;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.vz = 0;
      this.ball.spinZ = 0;
      this.ball.spinY = 0;
      this.ball.isShotInFlight = false;
      return;
    }

    // Touchline out (Throw-in)
    if (Math.abs(this.ball.z) > HALF_W) {
      const throwTeam: TeamSide = this.ball.lastTouchTeam === 'home' ? 'away' : 'home';
      this.ball.ownerId = null;
      this.intendedPassTargetId = null;
      this.ball.lastPasserId = null;
      this.ball.setPiece = 'throw_in';
      this.ball.setPieceTeam = throwTeam;
      this.ball.setPieceTimer = 0.75;
      this.ball.x = clamp(this.ball.x, -HALF_L + 2, HALF_L - 2);
      this.ball.z = Math.sign(this.ball.z) * (HALF_W - 0.25);
      this.ball.y = BALL_RADIUS;
      this.ball.prevX = this.ball.x;
      this.ball.prevY = this.ball.y;
      this.ball.prevZ = this.ball.z;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.vz = 0;
      this.ball.spinZ = 0;
      this.ball.spinY = 0;
      this.ball.isShotInFlight = false;
    }
  }

  private handleGoal(scoringSide: TeamSide, atRightGoal: boolean) {
    if (this.goalScoredLock || this.goalNetDelayTimer > 0) return;
    this.goalScoredLock = true;
    this.ball.ownerId = null;
    this.ball.setPiece = 'open_play';
    const signX = atRightGoal ? 1 : -1;
    if (Math.abs(this.ball.x) < HALF_L + 0.16) {
      this.ball.x = signX * (HALF_L + 0.16);
    }

    if (this.clockSeconds - this.lastGoalClock < 3.0) {
      this.recordTelemetryFrame(
        'ANOMALY',
        `Gol consecutivo en ${(this.clockSeconds - this.lastGoalClock).toFixed(2)}s`
      );
    }
    this.lastGoalClock = this.clockSeconds;

    if (atRightGoal) this.ball.netRippleRight = 1.0;
    else this.ball.netRippleLeft = 1.0;

    // Slow slightly through goal mouth, letting viscoelastic net collisions catch the ball inside the cage
    this.ball.vx *= 0.65;
    this.ball.vz *= 0.65;
    this.ball.vy *= 0.65;
    this.ball.isShotInFlight = false;

    if (scoringSide === 'home') this.homeScore += 1;
    else this.awayScore += 1;

    const rawScorer = this.findPlayerById(this.ball.lastTouchPlayerId);
    const scorer = rawScorer && rawScorer.side === scoringSide ? rawScorer : undefined;
    const rawAssister =
      this.ball.lastPasserId && this.ball.lastPasserId !== this.ball.lastTouchPlayerId
        ? this.findPlayerById(this.ball.lastPasserId)
        : undefined;
    const assister = rawAssister && rawAssister.side === scoringSide ? rawAssister : undefined;
    this.ball.lastPasserId = null;

    if (scorer) {
      scorer.goals += 1;
      scorer.shotsOnTarget += 1;
      scorer.rating = clamp(scorer.rating + 1.1, 5, 10);
    }
    if (assister) {
      assister.assists += 1;
      assister.rating = clamp(assister.rating + 0.65, 5, 10);
    }

    const attStats = scoringSide === 'home' ? this.homeStats : this.awayStats;
    attStats.shotsOnTarget += 1;

    // Track xGOT Faced & Goals Conceded on defending goalkeeper for Goals Prevented metric
    const defPlayers = scoringSide === 'home' ? this.awayPlayers : this.homePlayers;
    const defGK = defPlayers.find((o) => o.onPitch && o.assignedRole === 'POR');
    if (defGK) {
      defGK.xgotFaced += this.ball.shotXgot;
      defGK.goalsConceded += 1;
    }

    const lastShot = this.shots[this.shots.length - 1];
    if (lastShot && lastShot.side === scoringSide) {
      lastShot.outcome = 'gol';
    }

    const club = scoringSide === 'home' ? this.homeClub : this.awayClub;
    this.addEvent(
      'goal',
      `¡GOOOOL de ${club.shortCode}! (${scorer ? scorer.shortName : club.shortCode})`,
      `${scorer ? `${scorer.shortName} (#${scorer.number})` : club.name} manda el balón al fondo de la red${
        assister ? ` tras asistencia de ${assister.shortName}` : ''
      }. ${this.homeClub.shortCode} ${this.homeScore} - ${this.awayScore} ${this.awayClub.shortCode}.`,
      scoringSide,
      scorer?.shortName,
      assister?.shortName,
      true
    );

    soundEngine.playWhistle('short');
    soundEngine.playCrowdRoar(1.0);

    const concedingSide: TeamSide = scoringSide === 'home' ? 'away' : 'home';
    this.pendingKickoffTeam = concedingSide;
    this.goalNetDelayTimer = 0.65;
    this.recordTelemetryFrame('GOAL');
  }

  private updateSetPiecePositioning(dt: number) {
    const takerTeam = this.ball.setPieceTeam;
    const players = takerTeam === 'home' ? this.homePlayers : this.awayPlayers;
    const taker = this.getSetPieceTaker(players);

    if (taker) {
      taker.intent = taker.assignedRole === 'POR' ? 'portero' : 'apoyo_corto';
      this.movePlayerToward(taker, this.ball.x, this.ball.z, dt, true);
    }

    const dir = this.getAttackDir(takerTeam);
    const kind = this.ball.setPiece;

    const all = this.activeAll;

    for (const p of all) {
      if (p === taker) continue;

      if (kind === 'corner') {
        const isAttacker = p.side === takerTeam;
        const cornerSignZ = Math.sign(this.ball.z || 1);
        if (isAttacker) {
          if (p.assignedRole === 'POR') {
            p.intent = 'portero';
            this.movePlayerToward(p, -dir * (HALF_L - 4), 0, dt, false);
          } else if (p.assignedRole === 'LI' || p.assignedRole === 'LD') {
            // Stay back as rest-defense against counters
            p.intent = 'cobertura';
            this.movePlayerToward(p, dir * 10, (p.assignedRole === 'LI' ? -1 : 1) * 10, dt, false);
          } else {
            // Crowd the penalty box (near post, penalty spot, far post, edge of D)
            p.intent = 'llegada_area';
            const boxZ =
              p.assignedRole === 'DC'
                ? 0
                : p.assignedRole === 'DFC'
                ? (p.slotIndex % 2 === 0 ? -3.2 : 3.2)
                : cornerSignZ * -4.8;
            const boxX =
              p.assignedRole === 'MCO' || p.assignedRole === 'MCD'
                ? dir * (HALF_L - 18)
                : dir * (HALF_L - 7.5);
            this.movePlayerToward(p, boxX, boxZ, dt, true);
          }
          continue;
        } else {
          // Defending team packs own box zonally & near posts
          if (p.assignedRole === 'POR') {
            p.intent = 'portero';
            this.movePlayerToward(p, dir * (HALF_L - 1.5), cornerSignZ * 1.2, dt, false);
          } else if (p.assignedRole === 'DC') {
            // Outlet player stays near halfway line
            p.intent = 'posicional';
            this.movePlayerToward(p, -dir * 4, 0, dt, false);
          } else {
            p.intent = 'marcaje';
            const zZone = ((p.slotIndex % 5) - 2) * 3.1;
            const xZone = dir * (HALF_L - 5.5 - (p.slotIndex % 2) * 4.5);
            this.movePlayerToward(p, xZone, zZone, dt, true);
          }
          continue;
        }
      }

      p.intent = p.assignedRole === 'POR' ? 'portero' : 'posicional';
      const anchor = this.getTacticalAnchor(p, p.side === takerTeam);
      this.movePlayerToward(p, anchor.x, anchor.z, dt, false);
    }
  }

  private getSetPieceTaker(players: PlayerMatchState[]): PlayerMatchState | undefined {
    const active = players.filter((p) => p.onPitch && !p.redCard);
    if (this.ball.setPiece === 'goal_kick') {
      return active.find((p) => p.assignedRole === 'POR') || active[0];
    }
    if (this.ball.setPiece === 'penalty') {
      return [...active].sort((a, b) => b.attributes.shooting - a.attributes.shooting)[0];
    }
    return [...active]
      .filter((p) => p.assignedRole !== 'POR')
      .sort((a, b) => dist2D(a.x, a.z, this.ball.x, this.ball.z) - dist2D(b.x, b.z, this.ball.x, this.ball.z))[0];
  }

  private executeSetPiece() {
    const team = this.ball.setPieceTeam;
    const players = team === 'home' ? this.homePlayers : this.awayPlayers;
    const taker = this.getSetPieceTaker(players);
    const kind = this.ball.setPiece;
    this.ball.setPiece = 'open_play';
    this.offBallPlan.clear();

    if (!taker) return;
    taker.x = this.ball.x;
    taker.z = this.ball.z;

    if (kind === 'penalty') {
      this.executeShot(taker);
      soundEngine.playWhistle('short');
      this.recordTelemetryFrame('SET_PIECE');
      return;
    }

    const mates = players.filter((m) => m.onPitch && !m.redCard && m.id !== taker.id);
    const dir = this.getAttackDir(team);

    if (kind === 'corner') {
      const routineRoll = Math.random();
      if (routineRoll < 0.18) {
        // Short corner routine to edge-of-box creator
        const shortOption =
          mates.find((m) => m.assignedRole === 'MCO' || m.assignedRole === 'MC') || mates[0];
        if (shortOption) {
          this.executePass(taker, shortOption, false);
          this.recordTelemetryFrame('SET_PIECE');
          return;
        }
      }
      const boxCandidates = mates
        .filter((m) => m.assignedRole === 'DC' || m.assignedRole === 'DFC' || m.assignedRole === 'MCO')
        .sort((a, b) => (b.x - a.x) * dir);
      const target =
        boxCandidates[Math.floor(Math.random() * Math.max(1, boxCandidates.length))] || mates[0];
      if (target) {
        this.executePass(taker, target, true);
      }
      this.recordTelemetryFrame('SET_PIECE');
      return;
    }

    if (kind === 'kickoff') {
      const mid =
        mates.find((m) => m.assignedRole === 'MCD' || m.assignedRole === 'MC') || mates[0];
      if (mid) this.executePass(taker, mid, false);
      this.recordTelemetryFrame('SET_PIECE');
      return;
    }

    if (kind === 'free_kick') {
      const distGoal = dist2D(taker.x, taker.z, dir * HALF_L, 0);
      if (distGoal < 30 && Math.abs(taker.z) < 20) {
        // Direct free kick attempt by team's top shooter!
        const specialist = [...mates, taker]
          .filter((m) => m.assignedRole !== 'POR')
          .sort((a, b) => b.attributes.shooting - a.attributes.shooting)[0];
        if (specialist && specialist.attributes.shooting >= 74) {
          specialist.x = this.ball.x;
          specialist.z = this.ball.z;
          this.executeShot(specialist);
          this.recordTelemetryFrame('SET_PIECE');
          return;
        }
      } else if (distGoal < 46) {
        // Lofted free kick delivery into the penalty box
        const boxTarget =
          mates.find((m) => m.assignedRole === 'DC') ||
          mates.find((m) => m.assignedRole === 'DFC') ||
          mates[0];
        if (boxTarget) {
          this.executePass(taker, boxTarget, true);
          this.recordTelemetryFrame('SET_PIECE');
          return;
        }
      }
    }

    // Throw-in, goal kick, or deep free kick
    const sorted = [...mates].sort(
      (a, b) => dist2D(a.x, a.z, taker.x, taker.z) - dist2D(b.x, b.z, taker.x, taker.z)
    );
    const tactics = team === 'home' ? this.homeTactics : this.awayTactics;
    let target = sorted[0];
    if (kind === 'goal_kick') {
      target =
        tactics.playOutFromBack
          ? sorted[Math.floor(Math.random() * Math.min(3, sorted.length))]
          : mates.find((m) => m.assignedRole === 'DC') || sorted[sorted.length - 1];
    } else if (kind === 'throw_in' && sorted.length > 2) {
      target = sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
    }
    if (target) {
      const isLongGoalKick = kind === 'goal_kick' && !tactics.playOutFromBack;
      this.executePass(taker, target, false, false, isLongGoalKick);
    } else {
      this.ball.ownerId = taker.id;
    }
    this.recordTelemetryFrame('SET_PIECE');
  }

  private runAwayManagerAI(minute: number) {
    // Immediate emergency check for injured away players even between tactical cooldowns
    if (this.awaySubsUsed < 5) {
      const injuredOut = this.awayPlayers.find(
        (p) => p.onPitch && !p.redCard && p.assignedRole !== 'POR' && p.knockSeverity === 2
      );
      if (injuredOut) {
        const sub = this.awayPlayers.find(
          (b) => !b.onPitch && !b.subbedOff && b.naturalRole !== 'POR'
        );
        if (sub) {
          this.makeSubstitution('away', injuredOut.id, sub.id);
        }
      }
    }

    if (minute < this.awayAiCooldown) return;

    const diff = this.awayScore - this.homeScore;
    const awayDominated = this.awayStats.fieldTiltPct < 36 || this.homeStats.xg - this.awayStats.xg > 0.65;

    if (minute >= 55 && diff < 0 && this.awayTactics.mentality !== 'ofensiva') {
      this.awayTactics.mentality = 'ofensiva';
      this.awayTactics.pressing = 'gegenpress';
      this.awayTactics.tempo = 'alto';
      this.awayTactics.width = 'amplio';
      if (this.awayTactics.formation !== '4-3-3') {
        this.awayTactics.formation = '4-3-3';
        const slots = FORMATIONS['4-3-3'];
        this.awayPlayers
          .filter((p) => p.onPitch && !p.redCard)
          .forEach((p) => {
            if (slots[p.slotIndex]) p.assignedRole = slots[p.slotIndex].role;
          });
      }
      this.addEvent(
        'tactical_change',
        `Ajuste táctico (${this.awayClub.shortCode})`,
        `${this.awayClub.shortCode} adelanta líneas al 4-3-3 con presión alta buscando el empate.`,
        'away'
      );
      this.awayAiCooldown = minute + 10;
    } else if (minute >= 72 && diff > 0 && this.awayTactics.mentality !== 'defensiva') {
      this.awayTactics.mentality = 'defensiva';
      this.awayTactics.pressing = 'bloque_bajo';
      this.awayTactics.tempo = 'pausado';
      this.awayTactics.width = 'estrecho';
      this.awayTactics.counterAttack = true;
      this.addEvent(
        'tactical_change',
        `Cierre defensivo (${this.awayClub.shortCode})`,
        `${this.awayClub.shortCode} compacta el bloque y busca sentenciar al contraataque.`,
        'away'
      );
      this.awayAiCooldown = minute + 10;
    } else if (minute >= 35 && minute < 70 && awayDominated && this.awayTactics.pressing === 'bloque_medio') {
      this.awayTactics.pressing = 'presion_alta';
      this.awayTactics.counterAttack = true;
      this.awayAiCooldown = minute + 12;
    }

    // Away smart substitutions after 56' (prioritize knocks & exhausted players)
    if (minute >= 56 && this.awaySubsUsed < 5) {
      const tiredOut = [...this.awayPlayers]
        .filter(
          (p) =>
            p.onPitch &&
            !p.redCard &&
            p.assignedRole !== 'POR' &&
            (p.knockSeverity > 0 || p.stamina < 68)
        )
        .sort((a, b) => b.knockSeverity - a.knockSeverity || a.stamina - b.stamina)[0];

      if (tiredOut) {
        const benchCandidate = this.awayPlayers.find(
          (b) => !b.onPitch && !b.subbedOff && b.naturalRole !== 'POR'
        );
        if (benchCandidate) {
          this.makeSubstitution('away', tiredOut.id, benchCandidate.id);
          this.awayAiCooldown = minute + 8;
        }
      }
    }
  }

  public getSnapshot(): MatchSnapshot {
    return {
      phase: this.phase,
      clockSeconds: this.clockSeconds,
      displayMinute: this.getDisplayMinute(),
      addedTime: this.addedTime,
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      homeClub: this.homeClub,
      awayClub: this.awayClub,
      homeTactics: { ...this.homeTactics },
      awayTactics: { ...this.awayTactics },
      homePlayers: this.homePlayers.map((p) => ({ ...p, heatmap: [...p.heatmap] })),
      awayPlayers: this.awayPlayers.map((p) => ({ ...p, heatmap: [...p.heatmap] })),
      homeStats: {
        ...this.homeStats,
        territorialThirds: [...this.homeStats.territorialThirds] as [number, number, number],
        attackChannels: [...this.homeStats.attackChannels] as [number, number, number],
        zoneActivity: [...this.homeStats.zoneActivity],
        heatmap: [...this.homeStats.heatmap],
      },
      awayStats: {
        ...this.awayStats,
        territorialThirds: [...this.awayStats.territorialThirds] as [number, number, number],
        attackChannels: [...this.awayStats.attackChannels] as [number, number, number],
        zoneActivity: [...this.awayStats.zoneActivity],
        heatmap: [...this.awayStats.heatmap],
      },
      homeSubsUsed: this.homeSubsUsed,
      awaySubsUsed: this.awaySubsUsed,
      homeShoutCooldown: Math.ceil(this.homeShoutCooldown / 60),
      lastBannerEvent: this.lastBannerEvent,
      events: [...this.events],
      shots: [...this.shots],
      xgTimeline: [...this.xgTimeline],
      passLinks: Array.from(this.passMap.values()),
      ball: { ...this.ball },
      homeOffsideLineX: this.homeOffsideLineX,
      awayOffsideLineX: this.awayOffsideLineX,
      momentum: this.momentum,
    };
  }

  private checkTelemetryAnomalies(): string | null {
    const b = this.ball;
    if (
      Number.isNaN(b.x) ||
      Number.isNaN(b.y) ||
      Number.isNaN(b.z) ||
      Number.isNaN(b.vx) ||
      Number.isNaN(b.vy) ||
      Number.isNaN(b.vz)
    ) {
      return `NaN en balón pos=(${b.x},${b.y},${b.z}) vel=(${b.vx},${b.vy},${b.vz})`;
    }
    if (
      b.setPiece === 'open_play' &&
      !this.goalScoredLock &&
      this.goalNetDelayTimer <= 0 &&
      (Math.abs(b.x) > HALF_L + 0.6 || Math.abs(b.z) > HALF_W + 0.6)
    ) {
      return `Balón fuera de límites en open_play pos=(${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)})`;
    }
    for (let i = 0; i < this.homePlayers.length; i++) {
      const p = this.homePlayers[i];
      if (!p.onPitch) continue;
      if (Number.isNaN(p.x) || Number.isNaN(p.z) || Number.isNaN(p.vx) || Number.isNaN(p.vz)) {
        return `NaN en jugador ${p.side}#${p.number} ${p.shortName}`;
      }
      if (Math.abs(p.x) > HALF_L + 2.2 || Math.abs(p.z) > HALF_W + 2.2) {
        return `Jugador fuera de campo ${p.side}#${p.number} ${p.shortName} pos=(${p.x.toFixed(2)},${p.z.toFixed(2)})`;
      }
    }
    for (let i = 0; i < this.awayPlayers.length; i++) {
      const p = this.awayPlayers[i];
      if (!p.onPitch) continue;
      if (Number.isNaN(p.x) || Number.isNaN(p.z) || Number.isNaN(p.vx) || Number.isNaN(p.vz)) {
        return `NaN en jugador ${p.side}#${p.number} ${p.shortName}`;
      }
      if (Math.abs(p.x) > HALF_L + 2.2 || Math.abs(p.z) > HALF_W + 2.2) {
        return `Jugador fuera de campo ${p.side}#${p.number} ${p.shortName} pos=(${p.x.toFixed(2)},${p.z.toFixed(2)})`;
      }
    }
    return null;
  }

  private recordTelemetryFrame(tag = 'TICK', explicitAnomaly?: string) {
    const detected = explicitAnomaly || this.checkTelemetryAnomalies();
    if (detected) {
      this.telemetryAnomalies += 1;
      if (this.telemetryAnomalyList.length < 20) {
        this.telemetryAnomalyList.push(
          `[min=${this.getDisplayMinute()}' t=${this.clockSeconds.toFixed(2)}s] ${detected}`
        );
      }
    }

    const MAX_RAW_FRAMES = 220;
    const b = this.ball;
    const writeIdx = this.rawFrameHead;
    let slot = this.rawFrames[writeIdx];
    if (!slot) {
      slot = {
        clockSeconds: 0,
        minute: 0,
        homeScore: 0,
        awayScore: 0,
        phase: 'first_half',
        tag: 'TICK',
        detected: null,
        bx: 0,
        by: 0,
        bz: 0,
        bpx: 0,
        bpy: 0,
        bpz: 0,
        bvx: 0,
        bvy: 0,
        bvz: 0,
        bsx: 0,
        bsy: 0,
        bsz: 0,
        ownerId: null,
        setPiece: 'open_play',
        setPieceTeam: 'home',
        setPieceTimer: 0,
        isShotInFlight: false,
        netDelay: 0,
        lock: false,
        home: [],
        away: [],
      };
      this.rawFrames[writeIdx] = slot;
    }

    slot.clockSeconds = this.clockSeconds;
    slot.minute = this.getDisplayMinute();
    slot.homeScore = this.homeScore;
    slot.awayScore = this.awayScore;
    slot.phase = this.phase;
    slot.tag = tag;
    slot.detected = detected;
    slot.bx = b.x;
    slot.by = b.y;
    slot.bz = b.z;
    slot.bpx = b.prevX;
    slot.bpy = b.prevY;
    slot.bpz = b.prevZ;
    slot.bvx = b.vx;
    slot.bvy = b.vy;
    slot.bvz = b.vz;
    slot.bsx = b.spinX;
    slot.bsy = b.spinY;
    slot.bsz = b.spinZ;
    slot.ownerId = b.ownerId;
    slot.setPiece = b.setPiece;
    slot.setPieceTeam = b.setPieceTeam;
    slot.setPieceTimer = b.setPieceTimer;
    slot.isShotInFlight = b.isShotInFlight;
    slot.netDelay = this.goalNetDelayTimer;
    slot.lock = this.goalScoredLock;

    const captureSide = (
      src: PlayerMatchState[],
      dst: typeof slot.home
    ) => {
      let count = 0;
      for (let i = 0; i < src.length; i++) {
        const p = src[i];
        if (!p.onPitch || p.redCard) continue;
        let entry = dst[count];
        if (!entry) {
          entry = {
            number: p.number,
            shortName: p.shortName,
            role: p.assignedRole,
            x: p.x,
            y: p.y,
            z: p.z,
            vx: p.vx,
            vz: p.vz,
            gait: p.gaitMode,
            mode: p.carrierMode,
            intent: p.intent,
          };
          dst[count] = entry;
        } else {
          entry.number = p.number;
          entry.shortName = p.shortName;
          entry.role = p.assignedRole;
          entry.x = p.x;
          entry.y = p.y;
          entry.z = p.z;
          entry.vx = p.vx;
          entry.vz = p.vz;
          entry.gait = p.gaitMode;
          entry.mode = p.carrierMode;
          entry.intent = p.intent;
        }
        count++;
      }
      dst.length = count;
    };

    captureSide(this.homePlayers, slot.home);
    captureSide(this.awayPlayers, slot.away);

    this.rawFrameHead = (writeIdx + 1) % MAX_RAW_FRAMES;
    if (this.rawFrameCount < MAX_RAW_FRAMES) this.rawFrameCount++;
    this.telemetryCacheDirty = true;
  }

  private rebuildTelemetryFrameStrings() {
    const MAX_RAW_FRAMES = 220;
    const out: string[] = [];
    const startIdx = this.rawFrameCount < MAX_RAW_FRAMES ? 0 : this.rawFrameHead;
    const homeCode = this.homeClub.shortCode;
    const awayCode = this.awayClub.shortCode;

    const fmtSide = (list: typeof this.rawFrames[number]['home']) =>
      list
        .map(
          (p) =>
            `#${p.number}${p.shortName}[${p.role}](${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)})` +
            `v(${p.vx.toFixed(1)},${p.vz.toFixed(1)})[${p.gait}/${p.mode}/${p.intent}]`
        )
        .join(' ');

    for (let k = 0; k < this.rawFrameCount; k++) {
      const f = this.rawFrames[(startIdx + k) % MAX_RAW_FRAMES];
      if (!f) continue;
      const bs = Math.hypot(f.bvx, f.bvy, f.bvz);
      const header =
        `[t=${f.clockSeconds.toFixed(2)}s ${f.minute}' ${homeCode} ${f.homeScore}-${f.awayScore} ${awayCode} ${f.phase} tag=${f.detected ? `ANOMALY:${f.tag}` : f.tag}]` +
        (f.detected ? ` !! ${f.detected}` : '');
      const ballLine =
        `BALL pos=(${f.bx.toFixed(2)},${f.by.toFixed(2)},${f.bz.toFixed(2)}) ` +
        `prev=(${f.bpx.toFixed(2)},${f.bpy.toFixed(2)},${f.bpz.toFixed(2)}) ` +
        `vel=(${f.bvx.toFixed(2)},${f.bvy.toFixed(2)},${f.bvz.toFixed(2)})|${bs.toFixed(2)}m/s ` +
        `spin=(${f.bsx.toFixed(1)},${f.bsy.toFixed(1)},${f.bsz.toFixed(1)}) ` +
        `owner=${f.ownerId || 'libre'} sp=${f.setPiece}(${f.setPieceTeam}:${f.setPieceTimer.toFixed(2)}) ` +
        `shot=${f.isShotInFlight} netDelay=${f.netDelay.toFixed(2)} lock=${f.lock}`;
      const homeLine = `H: ${fmtSide(f.home)}`;
      const awayLine = `A: ${fmtSide(f.away)}`;
      out.push(`${header}\n${ballLine}\n${homeLine}\n${awayLine}`);
    }

    this.cachedTelemetryFrames = out;
    this.telemetryCacheDirty = false;
  }

  public getTelemetryReport(): string {
    if (this.telemetryCacheDirty) {
      this.rebuildTelemetryFrameStrings();
    }
    const b = this.ball;
    const bs = Math.hypot(b.vx, b.vy, b.vz);
    const fmtDetail = (p: PlayerMatchState) => {
      const spd = Math.hypot(p.vx, p.vz);
      const isOwner = b.ownerId === p.id ? ' *BALL*' : '';
      return (
        `  ${p.side === 'home' ? 'H' : 'A'} #${String(p.number).padStart(2, '0')} ${p.shortName.padEnd(12)} [${p.assignedRole}] ` +
        `pos=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) ` +
        `vel=(${p.vx.toFixed(2)},${p.vz.toFixed(2)})|${spd.toFixed(2)}m/s ` +
        `tgt=(${p.targetX.toFixed(1)},${p.targetZ.toFixed(1)}) ` +
        `dir=${p.facing.toFixed(2)} gait=${p.gaitMode} mode=${p.carrierMode} intent=${p.intent} ` +
        `stam=${Math.round(p.stamina)}% cd=${p.actionCooldown.toFixed(2)}${isOwner}`
      );
    };

    const homeExpelled = this.homePlayers.filter((p) => p.redCard).map((p) => `#${p.number}${p.shortName}`);
    const awayExpelled = this.awayPlayers.filter((p) => p.redCard).map((p) => `#${p.number}${p.shortName}`);
    const frames = this.cachedTelemetryFrames;

    const lines: string[] = [
      `=== TELEMETRIA MATCH ENGINE FM-SIM ===`,
      `Partido: ${this.homeClub.name} (${this.homeClub.shortCode}) ${this.homeScore} - ${this.awayScore} ${this.awayClub.name} (${this.awayClub.shortCode})`,
      `Tiempo: ${this.getDisplayMinute()}' (+${this.addedTime}) | clockSeconds=${this.clockSeconds.toFixed(2)}s | phase=${this.phase}`,
      `Estado Interno: goalNetDelayTimer=${this.goalNetDelayTimer.toFixed(3)} | goalScoredLock=${this.goalScoredLock} | pendingKickoff=${this.pendingKickoffTeam || 'none'} | reboundTimer=${this.reboundTimer.toFixed(2)}`,
      `Lineas Offside: home=${this.homeOffsideLineX.toFixed(2)} | away=${this.awayOffsideLineX.toFixed(2)} | wind=(${this.windX.toFixed(2)}, ${this.windZ.toFixed(2)}) | momentum=${this.momentum.toFixed(2)}`,
      `Expulsados: ${this.homeClub.shortCode}=[${homeExpelled.join(',') || '0'}] | ${this.awayClub.shortCode}=[${awayExpelled.join(',') || '0'}]`,
      `Anomalias Detectadas: ${this.telemetryAnomalies}`,
      ...(this.telemetryAnomalyList.length > 0 ? [`  Detalle anomalias:\n  - ${this.telemetryAnomalyList.join('\n  - ')}`] : []),
      ``,
      `--- BALON INSTANTANEO ---`,
      `  pos=(${b.x.toFixed(3)}, ${b.y.toFixed(3)}, ${b.z.toFixed(3)}) prev=(${b.prevX.toFixed(3)}, ${b.prevY.toFixed(3)}, ${b.prevZ.toFixed(3)})`,
      `  vel=(${b.vx.toFixed(3)}, ${b.vy.toFixed(3)}, ${b.vz.toFixed(3)}) speed=${bs.toFixed(2)} m/s`,
      `  spin=(x:${b.spinX.toFixed(2)}, y:${b.spinY.toFixed(2)}, z:${b.spinZ.toFixed(2)})`,
      `  ownerId=${b.ownerId || 'libre'} | lastTouch=${b.lastTouchTeam || 'none'}/${b.lastTouchPlayerId || 'none'} | lastPasser=${b.lastPasserId || 'none'}`,
      `  setPiece=${b.setPiece} (team=${b.setPieceTeam}, timer=${b.setPieceTimer.toFixed(2)}) | isShotInFlight=${b.isShotInFlight} (team=${b.shotTeam || 'none'}, xGOT=${b.shotXgot.toFixed(2)})`,
      ``,
      `--- JUGADORES EN CAMPO (${this.homePlayers.filter((p) => p.onPitch).length} ${this.homeClub.shortCode} vs ${this.awayPlayers.filter((p) => p.onPitch).length} ${this.awayClub.shortCode}) ---`,
      ...this.homePlayers.filter((p) => p.onPitch).map(fmtDetail),
      ...this.awayPlayers.filter((p) => p.onPitch).map(fmtDetail),
      ``,
      `--- ESTADISTICAS RESUMEN ---`,
      `  Posesion: ${this.homeStats.possessionPct}% - ${this.awayStats.possessionPct}% | Tiros: ${this.homeStats.shots} (${this.homeStats.shotsOnTarget}) - ${this.awayStats.shots} (${this.awayStats.shotsOnTarget})`,
      `  xG: ${this.homeStats.xg.toFixed(2)} - ${this.awayStats.xg.toFixed(2)} | Pases: ${this.homeStats.passesCompleted}/${this.homeStats.passesAttempted} - ${this.awayStats.passesCompleted}/${this.awayStats.passesAttempted}`,
      `  Regates: ${this.homeStats.dribblesCompleted}/${this.homeStats.dribblesAttempted} - ${this.awayStats.dribblesCompleted}/${this.awayStats.dribblesAttempted} | Cond.Prog: ${this.homeStats.progressiveCarries} - ${this.awayStats.progressiveCarries}`,
      ``,
      `--- EVENTOS RECIENTES (${Math.min(25, this.events.length)}) ---`,
      ...this.events.slice(0, 25).map((e) => `  [${e.minute}+${e.addedTime}'] (${e.type}) ${e.title}: ${e.description}`),
      ``,
      `--- HISTORIAL DE TRAMAS (${frames.length} frames, muestreo 0.25s + eventos) ---`,
      ...frames.slice(-120),
    ];
    return lines.join('\n');
  }
}
