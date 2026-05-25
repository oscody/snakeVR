import { signal, type Signal } from "@preact/signals-core";
import type { World } from "@iwsdk/core";

import type { Difficulty } from "./snake-constants.js";

export type SnakeStatus = "ready" | "playing" | "gameOver";

export interface SnakeState {
  /** Live stats — the HUD panel subscribes to these. */
  score: Signal<number>;
  length: Signal<number>;
  /** 0–100, how far the tick interval has accelerated from base toward min. */
  speedPct: Signal<number>;
  status: Signal<SnakeStatus>;
  /** Selected difficulty — read at the start of each game. */
  difficulty: Signal<Difficulty>;
  /** Bumped by panel button or keyboard to ask the game system to restart. */
  newGameRequest: Signal<number>;
}

export function installSnakeState(world: World): SnakeState {
  const state: SnakeState = {
    score: signal(0),
    length: signal(1),
    speedPct: signal(0),
    status: signal<SnakeStatus>("ready"),
    difficulty: signal<Difficulty>("normal"),
    newGameRequest: signal(0),
  };
  (world.globals as Record<string, unknown>).snake = state;
  return state;
}

export function getSnakeState(world: World): SnakeState {
  return (world.globals as Record<string, unknown>).snake as SnakeState;
}
