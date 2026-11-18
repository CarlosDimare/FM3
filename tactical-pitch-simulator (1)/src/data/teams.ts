import { ClubPreset, PlayerAttributes, PlayerProfile, PlayerRole } from '../types/match';

function p(
  id: string,
  name: string,
  shortName: string,
  number: number,
  naturalRole: PlayerRole,
  foot: 'D' | 'I' | 'A',
  skinTone: string,
  hairColor: string,
  attributes: PlayerAttributes
): PlayerProfile {
  return {
    id,
    name,
    shortName,
    number,
    naturalRole,
    foot,
    skinTone,
    hairColor,
    attributes,
  };
}

export const CLUB_PRESETS: ClubPreset[] = [
  {
    id: 'atletico_madrid',
    name: 'Atlético de Madrid',
    shortCode: 'ATM',
    city: 'Madrid',
    stadiumName: 'Estadio Metropolitano',
    colors: {
      primary: '#c81e2b',
      secondary: '#f8fafc',
      shorts: '#1e3a8a',
      socks: '#c81e2b',
      gkPrimary: '#eab308',
      accent: '#f59e0b',
    },
    defaultTactics: {
      formation: '4-3-3',
      mentality: 'equilibrada',
      pressing: 'presion_alta',
      passing: 'mixto',
      tempo: 'alto',
      width: 'equilibrado',
      defensiveLine: 'adelantada',
      counterAttack: true,
      playOutFromBack: true,
    },
    squad: [
      p('atm1', 'Jan Oblak', 'Oblak', 13, 'POR', 'D', '#f1c27d', '#3b2f2f', {
        pace: 62, passing: 76, shooting: 40, dribbling: 60, defending: 50, physical: 82, vision: 78, gk: 90,
      }),
      p('atm2', 'Javi Galán', 'Galán', 21, 'LI', 'I', '#e0ac69', '#2b1d14', {
        pace: 85, passing: 80, shooting: 64, dribbling: 81, defending: 79, physical: 78, vision: 77, gk: 15,
      }),
      p('atm3', 'José María Giménez', 'Giménez', 2, 'DFC', 'D', '#d89b66', '#1f1b18', {
        pace: 76, passing: 74, shooting: 52, dribbling: 67, defending: 88, physical: 89, vision: 73, gk: 15,
      }),
      p('atm4', 'Clément Lenglet', 'Lenglet', 15, 'DFC', 'I', '#f1c27d', '#4a3728', {
        pace: 76, passing: 82, shooting: 54, dribbling: 74, defending: 84, physical: 81, vision: 80, gk: 15,
      }),
      p('atm5', 'Marcos Llorente', 'Llorente', 14, 'LD', 'D', '#f4cba4', '#5c4033', {
        pace: 90, passing: 81, shooting: 75, dribbling: 82, defending: 78, physical: 88, vision: 79, gk: 15,
      }),
      p('atm6', 'Pablo Barrios', 'Barrios', 8, 'MCD', 'D', '#e8be94', '#261c15', {
        pace: 78, passing: 86, shooting: 71, dribbling: 83, defending: 83, physical: 82, vision: 87, gk: 15,
      }),
      p('atm7', 'Koke Resurrección', 'Koke', 6, 'MC', 'D', '#f1c27d', '#3a2a1d', {
        pace: 72, passing: 89, shooting: 73, dribbling: 83, defending: 77, physical: 80, vision: 90, gk: 15,
      }),
      p('atm8', 'Rodrigo De Paul', 'De Paul', 5, 'MC', 'D', '#f4cba4', '#2c221b', {
        pace: 81, passing: 87, shooting: 79, dribbling: 85, defending: 75, physical: 84, vision: 88, gk: 15,
      }),
      p('atm9', 'Samuel Lino', 'Lino', 12, 'EI', 'D', '#8d5524', '#181414', {
        pace: 89, passing: 79, shooting: 78, dribbling: 88, defending: 58, physical: 75, vision: 80, gk: 15,
      }),
      p('atm10', 'Julián Álvarez', 'Álvarez', 19, 'DC', 'D', '#f1c27d', '#2b1e16', {
        pace: 87, passing: 82, shooting: 88, dribbling: 87, defending: 56, physical: 81, vision: 85, gk: 15,
      }),
      p('atm11', 'Antoine Griezmann', 'Griezmann', 7, 'ED', 'I', '#f5d0b5', '#6b4e35', {
        pace: 81, passing: 88, shooting: 87, dribbling: 88, defending: 62, physical: 76, vision: 91, gk: 15,
      }),
      // Bench (11-17)
      p('atm12', 'Juan Musso', 'Musso', 1, 'POR', 'D', '#e0ac69', '#231b15', {
        pace: 58, passing: 72, shooting: 38, dribbling: 56, defending: 45, physical: 80, vision: 74, gk: 83,
      }),
      p('atm13', 'Robin Le Normand', 'Le Normand', 24, 'DFC', 'D', '#f1c27d', '#4b382a', {
        pace: 75, passing: 76, shooting: 48, dribbling: 68, defending: 86, physical: 85, vision: 75, gk: 15,
      }),
      p('atm14', 'Reinildo Mandava', 'Reinildo', 23, 'LI', 'I', '#6f4222', '#141212', {
        pace: 84, passing: 74, shooting: 54, dribbling: 75, defending: 84, physical: 85, vision: 72, gk: 15,
      }),
      p('atm15', 'Conor Gallagher', 'Gallagher', 4, 'MC', 'D', '#f5d0b5', '#8b6d46', {
        pace: 81, passing: 81, shooting: 76, dribbling: 80, defending: 80, physical: 89, vision: 80, gk: 15,
      }),
      p('atm16', 'Ángel Correa', 'Correa', 10, 'MCO', 'D', '#d89b66', '#1c1715', {
        pace: 84, passing: 82, shooting: 81, dribbling: 87, defending: 52, physical: 74, vision: 83, gk: 15,
      }),
      p('atm17', 'Giuliano Simeone', 'Giuliano', 22, 'ED', 'D', '#e8be94', '#2a1f18', {
        pace: 90, passing: 76, shooting: 77, dribbling: 83, defending: 60, physical: 82, vision: 76, gk: 15,
      }),
      p('atm18', 'Alexander Sørloth', 'Sørloth', 9, 'DC', 'I', '#f6d5bc', '#9d7c52', {
        pace: 82, passing: 75, shooting: 86, dribbling: 78, defending: 45, physical: 91, vision: 77, gk: 15,
      }),
    ],
  },
  {
    id: 'fc_barcelona',
    name: 'FC Barcelona',
    shortCode: 'BAR',
    city: 'Barcelona',
    stadiumName: 'Camp Nou',
    colors: {
      primary: '#004d98',
      secondary: '#a50044',
      shorts: '#004d98',
      socks: '#a50044',
      gkPrimary: '#10b981',
      accent: '#fbbf24',
    },
    defaultTactics: {
      formation: '4-2-3-1',
      mentality: 'ofensiva',
      pressing: 'gegenpress',
      passing: 'corto',
      tempo: 'normal',
      width: 'amplio',
      defensiveLine: 'adelantada',
      counterAttack: false,
      playOutFromBack: true,
    },
    squad: [
      p('bar1', 'Marc-André ter Stegen', 'Ter Stegen', 1, 'POR', 'D', '#f4cba4', '#5c4632', {
        pace: 60, passing: 87, shooting: 42, dribbling: 68, defending: 52, physical: 80, vision: 85, gk: 89,
      }),
      p('bar2', 'Alejandro Balde', 'Balde', 3, 'LI', 'I', '#7b4b2a', '#161313', {
        pace: 92, passing: 79, shooting: 62, dribbling: 84, defending: 78, physical: 80, vision: 77, gk: 15,
      }),
      p('bar3', 'Pau Cubarsí', 'Cubarsí', 2, 'DFC', 'D', '#f1c27d', '#3e2d20', {
        pace: 77, passing: 87, shooting: 48, dribbling: 79, defending: 86, physical: 79, vision: 86, gk: 15,
      }),
      p('bar4', 'Ronald Araújo', 'Araújo', 4, 'DFC', 'D', '#c68642', '#1c1816', {
        pace: 86, passing: 75, shooting: 55, dribbling: 71, defending: 88, physical: 91, vision: 74, gk: 15,
      }),
      p('bar5', 'Jules Koundé', 'Koundé', 23, 'LD', 'D', '#8d5524', '#181414', {
        pace: 85, passing: 81, shooting: 63, dribbling: 80, defending: 86, physical: 84, vision: 79, gk: 15,
      }),
      p('bar6', 'Frenkie de Jong', 'De Jong', 21, 'MCD', 'D', '#f5d0b5', '#b38b59', {
        pace: 82, passing: 89, shooting: 72, dribbling: 89, defending: 79, physical: 81, vision: 89, gk: 15,
      }),
      p('bar7', 'Pedri González', 'Pedri', 8, 'MCD', 'D', '#f1c27d', '#2b1e16', {
        pace: 80, passing: 91, shooting: 74, dribbling: 91, defending: 72, physical: 76, vision: 93, gk: 15,
      }),
      p('bar8', 'Raphinha Dias', 'Raphinha', 11, 'EI', 'I', '#c68642', '#1c1614', {
        pace: 90, passing: 83, shooting: 84, dribbling: 87, defending: 58, physical: 82, vision: 84, gk: 15,
      }),
      p('bar9', 'Dani Olmo', 'Olmo', 20, 'MCO', 'D', '#f1c27d', '#3b2b1f', {
        pace: 81, passing: 87, shooting: 83, dribbling: 88, defending: 58, physical: 74, vision: 89, gk: 15,
      }),
      p('bar10', 'Lamine Yamal', 'Yamal', 19, 'ED', 'I', '#c68642', '#181515', {
        pace: 90, passing: 86, shooting: 82, dribbling: 92, defending: 48, physical: 72, vision: 89, gk: 15,
      }),
      p('bar11', 'Robert Lewandowski', 'Lewandowski', 9, 'DC', 'D', '#f4cba4', '#4b3828', {
        pace: 78, passing: 81, shooting: 92, dribbling: 85, defending: 46, physical: 86, vision: 85, gk: 15,
      }),
      // Bench
      p('bar12', 'Iñaki Peña', 'Peña', 13, 'POR', 'D', '#f1c27d', '#33251b', {
        pace: 59, passing: 78, shooting: 38, dribbling: 60, defending: 45, physical: 77, vision: 76, gk: 81,
      }),
      p('bar13', 'Iñigo Martínez', 'Iñigo', 5, 'DFC', 'I', '#f1c27d', '#3d2f24', {
        pace: 74, passing: 83, shooting: 56, dribbling: 74, defending: 85, physical: 83, vision: 81, gk: 15,
      }),
      p('bar14', 'Marc Casadó', 'Casadó', 17, 'MCD', 'D', '#f4cba4', '#463325', {
        pace: 77, passing: 84, shooting: 66, dribbling: 82, defending: 82, physical: 83, vision: 84, gk: 15,
      }),
      p('bar15', 'Pablo Gavi', 'Gavi', 6, 'MC', 'D', '#f4cba4', '#3d2a1e', {
        pace: 81, passing: 85, shooting: 72, dribbling: 86, defending: 79, physical: 86, vision: 85, gk: 15,
      }),
      p('bar16', 'Fermín López', 'Fermín', 16, 'MCO', 'D', '#f1c27d', '#2d2018', {
        pace: 82, passing: 82, shooting: 83, dribbling: 84, defending: 62, physical: 78, vision: 83, gk: 15,
      }),
      p('bar17', 'Ferran Torres', 'Ferran', 7, 'EI', 'D', '#f1c27d', '#36271c', {
        pace: 86, passing: 79, shooting: 82, dribbling: 83, defending: 50, physical: 76, vision: 80, gk: 15,
      }),
      p('bar18', 'Pau Víctor', 'Pau Víctor', 18, 'DC', 'D', '#f4cba4', '#483424', {
        pace: 83, passing: 74, shooting: 81, dribbling: 79, defending: 44, physical: 79, vision: 76, gk: 15,
      }),
    ],
  },
  {
    id: 'athletic_club',
    name: 'Athletic Club',
    shortCode: 'ATH',
    city: 'Bilbao',
    stadiumName: 'San Mamés',
    colors: {
      primary: '#dc2626',
      secondary: '#f8fafc',
      shorts: '#111827',
      socks: '#111827',
      gkPrimary: '#f97316',
      accent: '#f87171',
    },
    defaultTactics: {
      formation: '4-4-2',
      mentality: 'equilibrada',
      pressing: 'presion_alta',
      passing: 'directo',
      tempo: 'alto',
      width: 'amplio',
      defensiveLine: 'normal',
      counterAttack: true,
      playOutFromBack: false,
    },
    squad: [
      p('ath1', 'Unai Simón', 'Simón', 1, 'POR', 'D', '#f4cba4', '#3b2b1e', {
        pace: 61, passing: 76, shooting: 40, dribbling: 60, defending: 49, physical: 83, vision: 77, gk: 88,
      }),
      p('ath2', 'Yuri Berchiche', 'Yuri', 17, 'LI', 'I', '#e8be94', '#241b15', {
        pace: 82, passing: 78, shooting: 71, dribbling: 78, defending: 81, physical: 85, vision: 75, gk: 15,
      }),
      p('ath3', 'Daniel Vivian', 'Vivian', 3, 'DFC', 'D', '#f1c27d', '#3b2a1e', {
        pace: 80, passing: 76, shooting: 50, dribbling: 70, defending: 86, physical: 86, vision: 75, gk: 15,
      }),
      p('ath4', 'Aitor Paredes', 'Paredes', 4, 'DFC', 'D', '#f4cba4', '#4e3b2a', {
        pace: 79, passing: 77, shooting: 49, dribbling: 71, defending: 84, physical: 84, vision: 76, gk: 15,
      }),
      p('ath5', 'Óscar de Marcos', 'De Marcos', 18, 'LD', 'D', '#f1c27d', '#3e2d21', {
        pace: 81, passing: 79, shooting: 67, dribbling: 78, defending: 80, physical: 82, vision: 79, gk: 15,
      }),
      p('ath6', 'Nico Williams', 'N. Williams', 10, 'EI', 'A', '#6f4222', '#141212', {
        pace: 94, passing: 81, shooting: 80, dribbling: 91, defending: 48, physical: 77, vision: 82, gk: 15,
      }),
      p('ath7', 'Íñigo Ruiz de Galarreta', 'Galarreta', 16, 'MC', 'D', '#f1c27d', '#34251a', {
        pace: 74, passing: 86, shooting: 68, dribbling: 84, defending: 78, physical: 77, vision: 86, gk: 15,
      }),
      p('ath8', 'Mikel Jauregizar', 'Jauregizar', 23, 'MC', 'D', '#f4cba4', '#4d3a2a', {
        pace: 78, passing: 82, shooting: 72, dribbling: 81, defending: 81, physical: 84, vision: 81, gk: 15,
      }),
      p('ath9', 'Iñaki Williams', 'I. Williams', 9, 'ED', 'D', '#6f4222', '#171413', {
        pace: 93, passing: 77, shooting: 82, dribbling: 83, defending: 55, physical: 86, vision: 78, gk: 15,
      }),
      p('ath10', 'Oihan Sancet', 'Sancet', 8, 'DC', 'D', '#f1c27d', '#36271d', {
        pace: 83, passing: 83, shooting: 84, dribbling: 85, defending: 56, physical: 83, vision: 85, gk: 15,
      }),
      p('ath11', 'Gorka Guruzeta', 'Guruzeta', 12, 'DC', 'D', '#f4cba4', '#473628', {
        pace: 79, passing: 76, shooting: 84, dribbling: 79, defending: 46, physical: 81, vision: 79, gk: 15,
      }),
      // Bench
      p('ath12', 'Julen Agirrezabala', 'Agirrezabala', 13, 'POR', 'I', '#f1c27d', '#38291e', {
        pace: 58, passing: 75, shooting: 38, dribbling: 58, defending: 45, physical: 79, vision: 74, gk: 82,
      }),
      p('ath13', 'Yeray Álvarez', 'Yeray', 5, 'DFC', 'D', '#e8be94', '#2a1e17', {
        pace: 76, passing: 77, shooting: 47, dribbling: 69, defending: 83, physical: 82, vision: 76, gk: 15,
      }),
      p('ath14', 'Andoni Gorosabel', 'Gorosabel', 2, 'LD', 'D', '#f1c27d', '#3c2c20', {
        pace: 83, passing: 78, shooting: 62, dribbling: 78, defending: 79, physical: 79, vision: 77, gk: 15,
      }),
      p('ath15', 'Beñat Prados', 'Prados', 24, 'MCD', 'D', '#f4cba4', '#443225', {
        pace: 77, passing: 81, shooting: 68, dribbling: 79, defending: 82, physical: 84, vision: 80, gk: 15,
      }),
      p('ath16', 'Unai Gómez', 'U. Gómez', 20, 'MCO', 'I', '#f1c27d', '#33251a', {
        pace: 80, passing: 79, shooting: 76, dribbling: 81, defending: 68, physical: 85, vision: 79, gk: 15,
      }),
      p('ath17', 'Álex Berenguer', 'Berenguer', 7, 'EI', 'D', '#e8be94', '#2b1e16', {
        pace: 85, passing: 79, shooting: 80, dribbling: 84, defending: 55, physical: 76, vision: 80, gk: 15,
      }),
      p('ath18', 'Álvaro Djaló', 'Djaló', 11, 'DC', 'D', '#7b4b2a', '#161313', {
        pace: 88, passing: 75, shooting: 80, dribbling: 84, defending: 46, physical: 79, vision: 76, gk: 15,
      }),
    ],
  },
  {
    id: 'real_betis',
    name: 'Real Betis',
    shortCode: 'BET',
    city: 'Sevilla',
    stadiumName: 'Estadio Benito Villamarín',
    colors: {
      primary: '#059669',
      secondary: '#f8fafc',
      shorts: '#f8fafc',
      socks: '#059669',
      gkPrimary: '#6366f1',
      accent: '#34d399',
    },
    defaultTactics: {
      formation: '3-5-2',
      mentality: 'ofensiva',
      pressing: 'bloque_medio',
      passing: 'corto',
      tempo: 'alto',
      width: 'amplio',
      defensiveLine: 'normal',
      counterAttack: true,
      playOutFromBack: true,
    },
    squad: [
      p('bet1', 'Álvaro Valles', 'Valles', 1, 'POR', 'D', '#e8be94', '#2d2118', {
        pace: 62, passing: 81, shooting: 40, dribbling: 64, defending: 49, physical: 79, vision: 79, gk: 85,
      }),
      p('bet2', 'Diego Llorente', 'D. Llorente', 3, 'DFC', 'D', '#f1c27d', '#3e2e22', {
        pace: 76, passing: 81, shooting: 54, dribbling: 73, defending: 84, physical: 83, vision: 79, gk: 15,
      }),
      p('bet3', 'Marc Bartra', 'Bartra', 5, 'DFC', 'D', '#f4cba4', '#38291f', {
        pace: 75, passing: 83, shooting: 55, dribbling: 76, defending: 83, physical: 79, vision: 82, gk: 15,
      }),
      p('bet4', 'Natan Bernardo', 'Natan', 6, 'DFC', 'I', '#c68642', '#1c1715', {
        pace: 80, passing: 77, shooting: 52, dribbling: 72, defending: 84, physical: 86, vision: 76, gk: 15,
      }),
      p('bet5', 'Romain Perraud', 'Perraud', 15, 'CAR', 'I', '#f5d0b5', '#523d2b', {
        pace: 84, passing: 79, shooting: 71, dribbling: 80, defending: 77, physical: 83, vision: 77, gk: 15,
      }),
      p('bet6', 'Johnny Cardoso', 'Cardoso', 4, 'MCD', 'D', '#e0ac69', '#251c16', {
        pace: 76, passing: 83, shooting: 71, dribbling: 80, defending: 84, physical: 85, vision: 82, gk: 15,
      }),
      p('bet7', 'Giovani Lo Celso', 'Lo Celso', 20, 'MC', 'I', '#e8be94', '#2b1e16', {
        pace: 79, passing: 88, shooting: 82, dribbling: 88, defending: 67, physical: 75, vision: 90, gk: 15,
      }),
      p('bet8', 'Isco Alarcón', 'Isco', 22, 'MC', 'D', '#e0ac69', '#231a14', {
        pace: 74, passing: 90, shooting: 81, dribbling: 92, defending: 62, physical: 74, vision: 92, gk: 15,
      }),
      p('bet9', 'Héctor Bellerín', 'Bellerín', 2, 'CAR', 'D', '#f1c27d', '#3a2b1f', {
        pace: 86, passing: 80, shooting: 64, dribbling: 82, defending: 77, physical: 78, vision: 78, gk: 15,
      }),
      p('bet10', 'Abde Ezzalzouli', 'Abde', 10, 'DC', 'D', '#c68642', '#1a1513', {
        pace: 91, passing: 76, shooting: 79, dribbling: 89, defending: 45, physical: 76, vision: 78, gk: 15,
      }),
      p('bet11', 'Cucho Hernández', 'Cucho', 19, 'DC', 'D', '#d89b66', '#221914', {
        pace: 86, passing: 78, shooting: 85, dribbling: 84, defending: 48, physical: 82, vision: 80, gk: 15,
      }),
      // Bench
      p('bet12', 'Fran Vieites', 'Vieites', 13, 'POR', 'D', '#f4cba4', '#4b3829', {
        pace: 57, passing: 74, shooting: 38, dribbling: 57, defending: 45, physical: 78, vision: 74, gk: 80,
      }),
      p('bet13', 'Youssouf Sabaly', 'Sabaly', 23, 'LD', 'D', '#7b4b2a', '#151312', {
        pace: 84, passing: 77, shooting: 63, dribbling: 79, defending: 79, physical: 78, vision: 76, gk: 15,
      }),
      p('bet14', 'Marc Roca', 'M. Roca', 21, 'MCD', 'I', '#f1c27d', '#3d2c1f', {
        pace: 72, passing: 84, shooting: 71, dribbling: 79, defending: 80, physical: 80, vision: 83, gk: 15,
      }),
      p('bet15', 'Pablo Fornals', 'Fornals', 18, 'MCO', 'D', '#e8be94', '#2e2219', {
        pace: 77, passing: 84, shooting: 77, dribbling: 83, defending: 66, physical: 79, vision: 85, gk: 15,
      }),
      p('bet16', 'Sergi Altimira', 'Altimira', 16, 'MC', 'D', '#f4cba4', '#453224', {
        pace: 76, passing: 82, shooting: 69, dribbling: 80, defending: 78, physical: 82, vision: 81, gk: 15,
      }),
      p('bet17', 'Chimy Ávila', 'Chimy', 9, 'DC', 'D', '#c68642', '#1d1614', {
        pace: 83, passing: 74, shooting: 82, dribbling: 79, defending: 56, physical: 87, vision: 75, gk: 15,
      }),
      p('bet18', 'Vitor Roque', 'Roque', 8, 'DC', 'D', '#c68642', '#191413', {
        pace: 88, passing: 73, shooting: 82, dribbling: 82, defending: 46, physical: 81, vision: 75, gk: 15,
      }),
    ],
  },
  {
    id: 'ca_banfield',
    name: 'CA Banfield',
    shortCode: 'BAN',
    city: 'Banfield, Argentina',
    stadiumName: 'Estadio Florencio Sola',
    colors: {
      primary: '#15803d',
      secondary: '#f8fafc',
      shorts: '#f8fafc',
      socks: '#15803d',
      gkPrimary: '#f59e0b',
      accent: '#4ade80',
    },
    defaultTactics: {
      formation: '4-4-2',
      mentality: 'defensiva',
      pressing: 'bloque_medio',
      passing: 'directo',
      tempo: 'normal',
      width: 'equilibrado',
      defensiveLine: 'normal',
      counterAttack: true,
      playOutFromBack: false,
    },
    squad: [
      p('ban1', 'Facundo Sanguinetti', 'Sanguinetti', 1, 'POR', 'D', '#e8be94', '#2a1e16', {
        pace: 51, passing: 58, shooting: 32, dribbling: 48, defending: 40, physical: 66, vision: 58, gk: 66,
      }),
      p('ban2', 'Mathías De Ritis', 'De Ritis', 3, 'LI', 'I', '#e0ac69', '#231a14', {
        pace: 67, passing: 60, shooting: 46, dribbling: 61, defending: 63, physical: 64, vision: 59, gk: 15,
      }),
      p('ban3', 'Alexis Maldonado', 'Maldonado', 2, 'DFC', 'D', '#d89b66', '#1c1714', {
        pace: 60, passing: 57, shooting: 38, dribbling: 52, defending: 68, physical: 71, vision: 58, gk: 15,
      }),
      p('ban4', 'Joaquín Pombo', 'Pombo', 6, 'DFC', 'I', '#e8be94', '#2f2219', {
        pace: 62, passing: 58, shooting: 40, dribbling: 53, defending: 66, physical: 69, vision: 57, gk: 15,
      }),
      p('ban5', 'Ramiro Di Luciano', 'Di Luciano', 24, 'LD', 'D', '#f1c27d', '#382a1f', {
        pace: 70, passing: 61, shooting: 48, dribbling: 63, defending: 62, physical: 65, vision: 60, gk: 15,
      }),
      p('ban6', 'Agustín Alaniz', 'Alaniz', 11, 'EI', 'I', '#e0ac69', '#251c15', {
        pace: 73, passing: 62, shooting: 61, dribbling: 67, defending: 42, physical: 61, vision: 63, gk: 15,
      }),
      p('ban7', 'Martín Río', 'M. Río', 5, 'MC', 'D', '#d89b66', '#211914', {
        pace: 62, passing: 64, shooting: 54, dribbling: 61, defending: 67, physical: 70, vision: 63, gk: 15,
      }),
      p('ban8', 'Lautaro Ríos', 'L. Ríos', 8, 'MC', 'D', '#e8be94', '#2c2018', {
        pace: 64, passing: 65, shooting: 56, dribbling: 63, defending: 64, physical: 67, vision: 65, gk: 15,
      }),
      p('ban9', 'Tomás Adoryán', 'Adoryán', 7, 'ED', 'D', '#f1c27d', '#33251b', {
        pace: 74, passing: 62, shooting: 60, dribbling: 68, defending: 44, physical: 60, vision: 63, gk: 15,
      }),
      p('ban10', 'Juan Bisanz', 'Bisanz', 19, 'DC', 'D', '#f1c27d', '#3a2b1e', {
        pace: 73, passing: 62, shooting: 67, dribbling: 67, defending: 40, physical: 64, vision: 64, gk: 15,
      }),
      p('ban11', 'Marcos Arturia', 'Arturia', 9, 'DC', 'D', '#e0ac69', '#241b15', {
        pace: 67, passing: 58, shooting: 68, dribbling: 61, defending: 38, physical: 70, vision: 60, gk: 15,
      }),
      // Bench
      p('ban12', 'Diego Romero', 'Romero', 13, 'POR', 'D', '#d89b66', '#1f1814', {
        pace: 49, passing: 55, shooting: 30, dribbling: 45, defending: 38, physical: 64, vision: 55, gk: 63,
      }),
      p('ban13', 'Nicolás Hernández', 'Hernández', 4, 'DFC', 'I', '#c68642', '#1a1513', {
        pace: 59, passing: 56, shooting: 37, dribbling: 51, defending: 65, physical: 68, vision: 56, gk: 15,
      }),
      p('ban14', 'Brandon Oviedo', 'Oviedo', 14, 'LD', 'D', '#e0ac69', '#281e16', {
        pace: 68, passing: 58, shooting: 45, dribbling: 60, defending: 61, physical: 63, vision: 57, gk: 15,
      }),
      p('ban15', 'Gabriel Vega', 'G. Vega', 16, 'MCD', 'D', '#e8be94', '#2b1f17', {
        pace: 61, passing: 64, shooting: 52, dribbling: 62, defending: 64, physical: 65, vision: 64, gk: 15,
      }),
      p('ban16', 'Gonzalo Ríos', 'G. Ríos', 20, 'MCO', 'D', '#d89b66', '#211814', {
        pace: 68, passing: 65, shooting: 62, dribbling: 66, defending: 45, physical: 62, vision: 66, gk: 15,
      }),
      p('ban17', 'Damián Díaz', 'Kitu Díaz', 10, 'MCO', 'D', '#e8be94', '#2e2219', {
        pace: 55, passing: 72, shooting: 66, dribbling: 71, defending: 38, physical: 58, vision: 74, gk: 15,
      }),
      p('ban18', 'Bruno Sepúlveda', 'Sepúlveda', 22, 'DC', 'D', '#e0ac69', '#261d16', {
        pace: 64, passing: 56, shooting: 66, dribbling: 60, defending: 38, physical: 69, vision: 58, gk: 15,
      }),
    ],
  },
  {
    id: 'sacachispas_fc',
    name: 'Sacachispas FC',
    shortCode: 'SAC',
    city: 'Buenos Aires, Argentina',
    stadiumName: 'Estadio Roberto Larrosa',
    colors: {
      primary: '#7c3aed',
      secondary: '#f8fafc',
      shorts: '#1e1b4b',
      socks: '#7c3aed',
      gkPrimary: '#ec4899',
      accent: '#c084fc',
    },
    defaultTactics: {
      formation: '4-4-2',
      mentality: 'muy_defensiva',
      pressing: 'bloque_bajo',
      passing: 'largo',
      tempo: 'pausado',
      width: 'estrecho',
      defensiveLine: 'muy_atras',
      counterAttack: true,
      playOutFromBack: false,
    },
    squad: [
      p('sac1', 'Facundo Troncoso', 'Troncoso', 1, 'POR', 'D', '#e0ac69', '#231a14', {
        pace: 40, passing: 42, shooting: 22, dribbling: 36, defending: 30, physical: 52, vision: 43, gk: 46,
      }),
      p('sac2', 'Lucas Molina', 'Molina', 3, 'LI', 'I', '#d89b66', '#1f1814', {
        pace: 51, passing: 44, shooting: 34, dribbling: 45, defending: 47, physical: 50, vision: 43, gk: 15,
      }),
      p('sac3', 'Gonzalo Paredes', 'G. Paredes', 2, 'DFC', 'D', '#e8be94', '#2a1f18', {
        pace: 45, passing: 42, shooting: 28, dribbling: 39, defending: 50, physical: 54, vision: 42, gk: 15,
      }),
      p('sac4', 'Ezequiel Morales', 'Morales', 6, 'DFC', 'I', '#c68642', '#1a1513', {
        pace: 46, passing: 41, shooting: 29, dribbling: 38, defending: 49, physical: 53, vision: 41, gk: 15,
      }),
      p('sac5', 'Franco Cáceres', 'Cáceres', 4, 'LD', 'D', '#e0ac69', '#251c16', {
        pace: 53, passing: 44, shooting: 35, dribbling: 46, defending: 46, physical: 49, vision: 43, gk: 15,
      }),
      p('sac6', 'Matías Acosta', 'Acosta', 11, 'EI', 'I', '#d89b66', '#201814', {
        pace: 56, passing: 45, shooting: 44, dribbling: 49, defending: 32, physical: 47, vision: 45, gk: 15,
      }),
      p('sac7', 'Rodrigo Benítez', 'Benítez', 5, 'MC', 'D', '#e8be94', '#2c2119', {
        pace: 48, passing: 48, shooting: 40, dribbling: 45, defending: 49, physical: 52, vision: 47, gk: 15,
      }),
      p('sac8', 'Diego Sosa', 'Sosa', 8, 'MC', 'D', '#e0ac69', '#241b15', {
        pace: 49, passing: 47, shooting: 41, dribbling: 46, defending: 47, physical: 51, vision: 46, gk: 15,
      }),
      p('sac9', 'Leandro Gómez', 'L. Gómez', 7, 'ED', 'D', '#f1c27d', '#34261c', {
        pace: 55, passing: 45, shooting: 43, dribbling: 48, defending: 34, physical: 47, vision: 44, gk: 15,
      }),
      p('sac10', 'Ignacio Navarro', 'Navarro', 10, 'DC', 'D', '#d89b66', '#1e1714', {
        pace: 54, passing: 46, shooting: 49, dribbling: 48, defending: 30, physical: 49, vision: 46, gk: 15,
      }),
      p('sac11', 'Cristian Vera', 'Vera', 9, 'DC', 'D', '#c68642', '#181412', {
        pace: 50, passing: 42, shooting: 50, dribbling: 44, defending: 28, physical: 53, vision: 43, gk: 15,
      }),
      // Bench
      p('sac12', 'Nahuel Díaz', 'N. Díaz', 12, 'POR', 'D', '#e8be94', '#291f18', {
        pace: 38, passing: 40, shooting: 20, dribbling: 34, defending: 28, physical: 50, vision: 40, gk: 44,
      }),
      p('sac13', 'Alan Quiroga', 'Quiroga', 13, 'DFC', 'D', '#d89b66', '#211915', {
        pace: 44, passing: 40, shooting: 27, dribbling: 37, defending: 48, physical: 52, vision: 40, gk: 15,
      }),
      p('sac14', 'Kevin Pereyra', 'Pereyra', 14, 'LI', 'I', '#e0ac69', '#241c16', {
        pace: 52, passing: 43, shooting: 33, dribbling: 44, defending: 45, physical: 48, vision: 42, gk: 15,
      }),
      p('sac15', 'Braian Romero', 'B. Romero', 15, 'MCD', 'D', '#c68642', '#1b1614', {
        pace: 46, passing: 45, shooting: 38, dribbling: 43, defending: 48, physical: 51, vision: 44, gk: 15,
      }),
      p('sac16', 'Tomás Ibarra', 'Ibarra', 16, 'MCO', 'D', '#f1c27d', '#31241b', {
        pace: 51, passing: 47, shooting: 44, dribbling: 48, defending: 34, physical: 46, vision: 47, gk: 15,
      }),
      p('sac17', 'Sebastián Paz', 'Paz', 17, 'EI', 'D', '#e0ac69', '#251d17', {
        pace: 55, passing: 44, shooting: 43, dribbling: 47, defending: 31, physical: 46, vision: 43, gk: 15,
      }),
      p('sac18', 'Maximiliano Ríos', 'M. Ríos', 18, 'DC', 'D', '#d89b66', '#1e1815', {
        pace: 49, passing: 41, shooting: 48, dribbling: 43, defending: 28, physical: 52, vision: 42, gk: 15,
      }),
    ],
  },
];
