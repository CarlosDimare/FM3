export type TeamSide = 'home' | 'away';

export type FormationId =
  | '4-3-3'
  | '4-2-3-1'
  | '3-5-2'
  | '4-4-2'
  | '5-3-2'
  | '4-1-4-1';

export type MentalityLevel =
  | 'muy_defensiva'
  | 'defensiva'
  | 'equilibrada'
  | 'ofensiva'
  | 'ataque_total';

export type PressingIntensity =
  | 'bloque_bajo'
  | 'bloque_medio'
  | 'presion_alta'
  | 'gegenpress';

export type PassingStyle =
  | 'corto'
  | 'mixto'
  | 'directo'
  | 'largo';

export type TempoLevel =
  | 'pausado'
  | 'normal'
  | 'alto'
  | 'vertiginoso';

export type WidthLevel = 'estrecho' | 'equilibrado' | 'amplio';

export type DefensiveLineLevel =
  | 'muy_atras'
  | 'normal'
  | 'adelantada'
  | 'fuera_de_juego';

export type PlayerRole =
  | 'POR'
  | 'DFC'
  | 'LI'
  | 'LD'
  | 'CAR'
  | 'MCD'
  | 'MC'
  | 'MCO'
  | 'EI'
  | 'ED'
  | 'DC';

export type PlayerInstruction =
  | 'equilibrado'
  | 'subir_mas'
  | 'mantener_posicion'
  | 'entrar_al_area'
  | 'libertad_creativa'
  | 'marcaje_ferreo';

export interface PlayerAttributes {
  pace: number;       // Velocidad (50-99)
  passing: number;    // Pase (50-99)
  shooting: number;   // Tiro / Remate (40-99)
  dribbling: number;  // Regate / Control (45-99)
  defending: number;  // Defensa / Entrada (35-99)
  physical: number;   // Físico / Resistencia (50-99)
  vision: number;     // Visión táctica (50-99)
  gk: number;         // Portería (10-99)
}

export interface PlayerProfile {
  id: string;
  name: string;
  shortName: string;
  number: number;
  naturalRole: PlayerRole;
  foot: 'D' | 'I' | 'A';
  skinTone: string;
  hairColor: string;
  attributes: PlayerAttributes;
}

export type PlayerIntent =
  | 'posicional'
  | 'apoyo_corto'
  | 'desmarque_ruptura'
  | 'amplitud'
  | 'pared'
  | 'llegada_area'
  | 'arrastre'
  | 'controlando'
  | 'escaneando'
  | 'conduccion'
  | 'temporizacion_ofensiva'
  | 'temporizando'
  | 'presion'
  | 'cobertura'
  | 'marcaje'
  | 'repliegue'
  | 'salto_aereo'
  | 'entrada'
  | 'desequilibrio'
  | 'portero'
  | 'portero_libero';

export type GaitMode = 'trote' | 'carrera' | 'apoyo' | 'sprint';

export type CarrierMode = 'none' | 'trapping' | 'scanning' | 'driving' | 'shielding' | 'evading';

export const HEATMAP_COLS = 12;
export const HEATMAP_ROWS = 8;
export const HEATMAP_SIZE = HEATMAP_COLS * HEATMAP_ROWS;

export interface PlayerMatchState extends PlayerProfile {
  side: TeamSide;
  slotIndex: number; // 0-10 starters, 11-17 bench
  assignedRole: PlayerRole;
  instruction: PlayerInstruction;
  onPitch: boolean;
  subbedOff: boolean;
  // 3D world coordinates (pitch: x in [-52.5, 52.5], y vertical, z in [-34, 34])
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  facing: number; // radians
  headYaw: number; // relative neck yaw for scanning
  stridePhase: number;
  kickAnimTimer: number;
  lastKickFoot: 'D' | 'I';
  diveAnimTimer: number;
  diveDir: number;
  diveHeight: number;
  isJumping: boolean;
  slideTimer: number;
  slideCooldown: number;
  slideDirX: number;
  slideDirZ: number;
  stumbleTimer: number;
  // Live condition & stats
  stamina: number; // 0-100
  morale: number;  // 0-100
  rating: number;  // 5.0-10.0
  minutesPlayed: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passesAttempted: number;
  passesCompleted: number;
  keyPasses: number;
  progressivePasses: number;
  progressiveCarries: number;
  dribblesAttempted: number;
  dribblesCompleted: number;
  tacklesWon: number;
  interceptions: number;
  clearances: number;
  shotsBlocked: number;
  groundDuelsWon: number;
  groundDuelsLost: number;
  aerialDuelsWon: number;
  aerialDuelsLost: number;
  saves: number;
  xgotFaced: number;
  goalsConceded: number;
  foulsCommitted: number;
  foulsWon: number;
  yellowCards: number;
  redCard: boolean;
  injured: boolean;
  knockSeverity: 0 | 1 | 2;
  crossesAttempted: number;
  crossesCompleted: number;
  xgGenerated: number;
  xgotGenerated: number;
  xa: number;
  errorsLeadingToShot: number;
  distanceMeters: number;
  sprints: number;
  // Spatial averages & 12x8 heatmap (normalized attacking +X)
  touches: number;
  avgX: number;
  avgZ: number;
  heatmap: number[];
  // AI intent, dwell & curved biomechanics timers
  intent: PlayerIntent;
  intentTimer: number;
  gaitMode: GaitMode;
  carrierMode: CarrierMode;
  carrierModeTimer: number;
  carryCommitTimer: number;
  carryStartX: number;
  carryStartZ: number;
  scanTurnTarget: number;
  curveBias: number; // -1 or +1 for J-runs & overlap arcs
  feintTimer: number;
  feintDir: number;
  pausaTimer: number;
  dribbleTouchTimer: number;
  giveAndGoTimer: number;
  reactionTimer: number;
  actionCooldown: number;
  targetX: number;
  targetZ: number;
}

export interface TeamTactics {
  formation: FormationId;
  mentality: MentalityLevel;
  pressing: PressingIntensity;
  passing: PassingStyle;
  tempo: TempoLevel;
  width: WidthLevel;
  defensiveLine: DefensiveLineLevel;
  counterAttack: boolean;
  playOutFromBack: boolean;
}

export interface TeamColors {
  primary: string;
  secondary: string;
  shorts: string;
  socks: string;
  gkPrimary: string;
  accent: string;
}

export interface ClubPreset {
  id: string;
  name: string;
  shortCode: string;
  city: string;
  stadiumName: string;
  colors: TeamColors;
  defaultTactics: TeamTactics;
  squad: PlayerProfile[]; // 18 players (11 starters + 7 bench)
}

export interface TeamStats {
  possessionSeconds: number;
  possessionPct: number;
  shots: number;
  shotsOnTarget: number;
  shotsBlocked: number;
  xg: number;
  xgot: number;
  xa: number;
  bigChances: number;
  corners: number;
  fouls: number;
  offsides: number;
  yellowCards: number;
  redCards: number;
  passesAttempted: number;
  passesCompleted: number;
  keyPasses: number;
  progressivePasses: number;
  passesIntoBox: number;
  finalThirdPasses: number;
  crossesAttempted: number;
  crossesCompleted: number;
  reboundsRecovered: number;
  progressiveCarries: number;
  dribblesAttempted: number;
  dribblesCompleted: number;
  tacklesWon: number;
  interceptions: number;
  clearances: number;
  groundDuelsWon: number;
  groundDuelsLost: number;
  aerialDuelsWon: number;
  aerialDuelsLost: number;
  saves: number;
  ppda: number;
  oppBuildPassesForPpda: number;
  defActionsForPpda: number;
  fieldTiltPct: number;
  territorialThirds: [number, number, number]; // [defensive, middle, attacking] ticks
  attackChannels: [number, number, number]; // [left, center, right] ticks
  zoneActivity: number[]; // FM08 3x3 tactical matrix (9 zones, normalized attacking +X)
  heatmap: number[]; // 12x8 normalized attacking +X
}

export interface ShotRecord {
  id: string;
  minute: number;
  second: number;
  side: TeamSide;
  playerId: string;
  playerName: string;
  x: number; // normalized attacking coordinates (always attacking +52.5 goal for shot map)
  z: number;
  xg: number;
  xgot: number;
  outcome: 'gol' | 'parada' | 'bloqueado' | 'fuera' | 'poste';
}

export interface XgTimelinePoint {
  minute: number;
  homeXg: number;
  awayXg: number;
}

export type MatchEventType =
  | 'kickoff'
  | 'goal'
  | 'save'
  | 'shot_miss'
  | 'post'
  | 'rebound'
  | 'cross'
  | 'dribble'
  | 'clearance'
  | 'foul'
  | 'yellow_card'
  | 'red_card'
  | 'injury'
  | 'penalty'
  | 'corner'
  | 'offside'
  | 'substitution'
  | 'tactical_change'
  | 'shout'
  | 'halftime'
  | 'fulltime';

export interface MatchEvent {
  id: string;
  minute: number;
  addedTime: number;
  type: MatchEventType;
  side?: TeamSide;
  playerName?: string;
  assistName?: string;
  title: string;
  description: string;
}

export type MatchPhase =
  | 'pre_kickoff'
  | 'first_half'
  | 'half_time'
  | 'second_half'
  | 'full_time';

export type SetPieceType =
  | 'open_play'
  | 'kickoff'
  | 'throw_in'
  | 'corner'
  | 'goal_kick'
  | 'free_kick'
  | 'penalty';

export interface BallState {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinY: number; // + backspin (lift), - topspin (dip)
  spinZ: number; // sidespin (lateral Magnus swerve)
  knuckleSeed: number;
  ownerId: string | null;
  lastTouchTeam: TeamSide | null;
  lastTouchPlayerId: string | null;
  lastPasserId: string | null;
  lastPassWasKeyCandidate: boolean;
  lastPassWasCross: boolean;
  lastPassOriginX: number;
  lastPassOriginZ: number;
  lastPassTimestamp: number;
  isShotInFlight: boolean;
  shotTeam: TeamSide | null;
  shotXgot: number;
  shotTargetY: number;
  shotTargetZ: number;
  setPiece: SetPieceType;
  setPieceTeam: TeamSide;
  setPieceTimer: number;
  netRippleLeft: number;
  netRippleRight: number;
}

export interface PassLink {
  fromId: string;
  toId: string;
  side: TeamSide;
  count: number;
}

export interface VisualLayers {
  offsideLine: boolean;
  passNetwork: boolean;
  tacticalZones: boolean;
  playerNames: boolean;
}

export type LightingMood = 'night' | 'dusk';

export type ShoutType =
  | 'animar'
  | 'concentracion'
  | 'presionar'
  | 'calma'
  | 'atacar';

export interface MatchSnapshot {
  phase: MatchPhase;
  clockSeconds: number;
  displayMinute: number;
  addedTime: number;
  homeScore: number;
  awayScore: number;
  homeClub: ClubPreset;
  awayClub: ClubPreset;
  homeTactics: TeamTactics;
  awayTactics: TeamTactics;
  homePlayers: PlayerMatchState[];
  awayPlayers: PlayerMatchState[];
  homeStats: TeamStats;
  awayStats: TeamStats;
  homeSubsUsed: number;
  awaySubsUsed: number;
  homeShoutCooldown: number;
  lastBannerEvent: MatchEvent | null;
  events: MatchEvent[];
  shots: ShotRecord[];
  xgTimeline: XgTimelinePoint[];
  passLinks: PassLink[];
  ball: BallState;
  homeOffsideLineX: number;
  awayOffsideLineX: number;
  momentum: number; // -1 (away) to +1 (home)
}
