import { signal, type Signal } from "@preact/signals-core";
import type { Entity, World } from "@iwsdk/core";

export type GameId = "menu" | "snake";
export type Difficulty = "easy" | "normal" | "hard";

/** Reactive game selection — subscribe or set `.value` to switch games. */
export const requestedGame = signal<GameId>("menu");

export interface SnakeGlobals {
  difficulty: Signal<Difficulty>;
}

export function installSnakeGlobals(world: World): SnakeGlobals {
  const state: SnakeGlobals = { difficulty: signal<Difficulty>("normal") };
  (world.globals as Record<string, unknown>).snake = state;
  return state;
}

export function getSnakeGlobals(world: World): SnakeGlobals {
  return (world.globals as Record<string, unknown>).snake as SnakeGlobals;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeRemove(entity: Entity, component: any): void {
  if (!entity.active) return;
  if (entity.hasComponent(component)) entity.removeComponent(component);
}
