export const GRID = 30;
export const TILE = 0.08;
export const SPAN = GRID * TILE;
export const HALF = SPAN / 2;
export const SEG_Y = TILE * 0.5;

export const BOARD = { x: 0, y: 1.0, z: -1.6 };

export const START_LEN = 1;
export const PLAYER_Y = 0.7;

export type Difficulty = "easy" | "normal" | "hard";

export interface DifficultyParams {
  tickBase: number;
  minTick: number;
  tickStep: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  easy: { tickBase: 0.6, minTick: 0.18, tickStep: 0.015 },
  normal: { tickBase: 0.34, minTick: 0.12, tickStep: 0.025 },
  hard: { tickBase: 0.2, minTick: 0.08, tickStep: 0.036 },
};

export const CORRUPTION_SHRINK = 1;
export const CORRUPTION_LIFETIME = 999.0;
export const CORRUPTION_MIN_LENGTH = 2;
export const CORRUPTION_PER_ORB = 2;
export const CORRUPTION_SPAWN_RADIUS = 3;

// Power-ups (shield / multiplier / growth) — see src/snake/<kind>-powerup.ts.
export const POWERUP_SPAWN_MIN = 5.0;
export const POWERUP_SPAWN_MAX = 10.0;
export const POWERUP_LIFETIME = 10.0;
export const POWERUP_MIN_LENGTH = 2;
export const SHIELD_CHARGES_PER_PICKUP = 1;
export const MULTIPLIER_ORBS_PER_PICKUP = 3;
export const MULTIPLIER_FACTOR = 2;
export const GROWTH_ORBS_PER_PICKUP = 3;
export const GROWTH_EXTRA_SEGMENTS = 1;
