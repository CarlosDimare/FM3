import { FormationId, PlayerRole } from '../types/match';

export interface FormationSlot {
  role: PlayerRole;
  // Normalized coordinates when attacking +X (right):
  // xNorm: 0.0 (own goal line -52.5) to 1.0 (opponent goal line +52.5)
  // zNorm: -0.5 (left wing -34) to +0.5 (right wing +34)
  xNorm: number;
  zNorm: number;
}

export const FORMATIONS: Record<FormationId, FormationSlot[]> = {
  '4-3-3': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'LI', xNorm: 0.23, zNorm: -0.37 },
    { role: 'DFC', xNorm: 0.19, zNorm: -0.14 },
    { role: 'DFC', xNorm: 0.19, zNorm: 0.14 },
    { role: 'LD', xNorm: 0.23, zNorm: 0.37 },
    { role: 'MCD', xNorm: 0.38, zNorm: 0 },
    { role: 'MC', xNorm: 0.48, zNorm: -0.2 },
    { role: 'MC', xNorm: 0.48, zNorm: 0.2 },
    { role: 'EI', xNorm: 0.69, zNorm: -0.35 },
    { role: 'DC', xNorm: 0.75, zNorm: 0 },
    { role: 'ED', xNorm: 0.69, zNorm: 0.35 },
  ],
  '4-2-3-1': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'LI', xNorm: 0.22, zNorm: -0.37 },
    { role: 'DFC', xNorm: 0.18, zNorm: -0.14 },
    { role: 'DFC', xNorm: 0.18, zNorm: 0.14 },
    { role: 'LD', xNorm: 0.22, zNorm: 0.37 },
    { role: 'MCD', xNorm: 0.36, zNorm: -0.15 },
    { role: 'MCD', xNorm: 0.36, zNorm: 0.15 },
    { role: 'EI', xNorm: 0.59, zNorm: -0.34 },
    { role: 'MCO', xNorm: 0.58, zNorm: 0 },
    { role: 'ED', xNorm: 0.59, zNorm: 0.34 },
    { role: 'DC', xNorm: 0.76, zNorm: 0 },
  ],
  '3-5-2': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'DFC', xNorm: 0.19, zNorm: -0.24 },
    { role: 'DFC', xNorm: 0.17, zNorm: 0 },
    { role: 'DFC', xNorm: 0.19, zNorm: 0.24 },
    { role: 'CAR', xNorm: 0.42, zNorm: -0.41 },
    { role: 'MCD', xNorm: 0.36, zNorm: 0 },
    { role: 'MC', xNorm: 0.5, zNorm: -0.18 },
    { role: 'MC', xNorm: 0.5, zNorm: 0.18 },
    { role: 'CAR', xNorm: 0.42, zNorm: 0.41 },
    { role: 'DC', xNorm: 0.73, zNorm: -0.14 },
    { role: 'DC', xNorm: 0.73, zNorm: 0.14 },
  ],
  '4-4-2': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'LI', xNorm: 0.21, zNorm: -0.36 },
    { role: 'DFC', xNorm: 0.18, zNorm: -0.14 },
    { role: 'DFC', xNorm: 0.18, zNorm: 0.14 },
    { role: 'LD', xNorm: 0.21, zNorm: 0.36 },
    { role: 'EI', xNorm: 0.47, zNorm: -0.38 },
    { role: 'MC', xNorm: 0.44, zNorm: -0.14 },
    { role: 'MC', xNorm: 0.44, zNorm: 0.14 },
    { role: 'ED', xNorm: 0.47, zNorm: 0.38 },
    { role: 'DC', xNorm: 0.74, zNorm: -0.14 },
    { role: 'DC', xNorm: 0.74, zNorm: 0.14 },
  ],
  '5-3-2': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'CAR', xNorm: 0.27, zNorm: -0.4 },
    { role: 'DFC', xNorm: 0.17, zNorm: -0.22 },
    { role: 'DFC', xNorm: 0.16, zNorm: 0 },
    { role: 'DFC', xNorm: 0.17, zNorm: 0.22 },
    { role: 'CAR', xNorm: 0.27, zNorm: 0.4 },
    { role: 'MCD', xNorm: 0.38, zNorm: 0 },
    { role: 'MC', xNorm: 0.48, zNorm: -0.2 },
    { role: 'MC', xNorm: 0.48, zNorm: 0.2 },
    { role: 'DC', xNorm: 0.73, zNorm: -0.14 },
    { role: 'DC', xNorm: 0.73, zNorm: 0.14 },
  ],
  '4-1-4-1': [
    { role: 'POR', xNorm: 0.04, zNorm: 0 },
    { role: 'LI', xNorm: 0.21, zNorm: -0.36 },
    { role: 'DFC', xNorm: 0.18, zNorm: -0.14 },
    { role: 'DFC', xNorm: 0.18, zNorm: 0.14 },
    { role: 'LD', xNorm: 0.21, zNorm: 0.36 },
    { role: 'MCD', xNorm: 0.33, zNorm: 0 },
    { role: 'EI', xNorm: 0.54, zNorm: -0.37 },
    { role: 'MC', xNorm: 0.5, zNorm: -0.15 },
    { role: 'MC', xNorm: 0.5, zNorm: 0.15 },
    { role: 'ED', xNorm: 0.54, zNorm: 0.37 },
    { role: 'DC', xNorm: 0.75, zNorm: 0 },
  ],
};

export const FORMATION_LIST: FormationId[] = [
  '4-3-3',
  '4-2-3-1',
  '3-5-2',
  '4-4-2',
  '5-3-2',
  '4-1-4-1',
];

export const ROLE_LABELS: Record<PlayerRole, string> = {
  POR: 'Portero',
  DFC: 'Central',
  LI: 'Lateral Izq.',
  LD: 'Lateral Der.',
  CAR: 'Carrilero',
  MCD: 'Pivote',
  MC: 'Mediocentro',
  MCO: 'Mediapunta',
  EI: 'Extremo Izq.',
  ED: 'Extremo Der.',
  DC: 'Delantero',
};
