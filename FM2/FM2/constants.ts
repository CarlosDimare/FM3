
import { Position } from "./types";

export const POSITIONS = [Position.GK, Position.DC, Position.MC, Position.ST];

export const SCOUTING_ZONE_COSTS: Record<string, number> = {
  LOCAL: 150,
  REGIONAL: 300,
  NATIONAL: 500,
  CONTINENTAL: 1500,
  GLOBAL: 3000,
};

export const SCOUTING_ZONE_LABELS: Record<string, string> = {
  LOCAL: 'Barrio / Zona',
  REGIONAL: 'Región',
  NATIONAL: 'País',
  CONTINENTAL: 'Continente',
  GLOBAL: 'Mundo',
};

export const SCOUTING_ZONE_DESC: Record<string, string> = {
  LOCAL: 'Clubes de barrio y de la zona de influencia del club.',
  REGIONAL: 'Clubes de la región y países vecinos.',
  NATIONAL: 'Todos los clubes del país.',
  CONTINENTAL: 'Clubes de todo el continente.',
  GLOBAL: 'Clubes de cualquier parte del mundo.',
};

export const NATIONS = [
  "Argentina", "Brasil", "Uruguay", "Chile", "Colombia", "Perú", "Ecuador", "Paraguay", "Bolivia", "Venezuela",
  "España", "Inglaterra", "Francia", "Alemania", "Italia", "Portugal", "Países Bajos", "Bélgica",
  "México", "USA", "Japón", "Croacia", "Suiza", "Dinamarca", "Suecia", "Noruega", "Polonia", "Austria",
  "Turquía", "Rusia", "Ucrania", "Grecia", "Arabia Saudita",
  "Egipto", "Marruecos", "Sudáfrica", "Nigeria", "Ghana",
  "Corea del Sur", "China", "Australia"
];

export const GAME_SPEED_MS = 200; // ms per match minute simulation

export const ATTRIBUTE_COLORS = {
  LOW: "text-slate-600",    // 1-9 Deep Gray
  AVG: "text-blue-800",     // 10-15 Navy Blue
  HIGH: "text-orange-700",  // 16-20 Burnt Orange/Amber for better light visibility
};

export const getAttributeColor = (value: number) => {
  if (value >= 16) return ATTRIBUTE_COLORS.HIGH;
  if (value >= 10) return ATTRIBUTE_COLORS.AVG;
  return ATTRIBUTE_COLORS.LOW;
};
