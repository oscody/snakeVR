import { signal } from "@preact/signals-core";

export type GameId = "menu" | "snake";

/** Reactive game selection — subscribe or set `.value` to switch games. */
export const requestedGame = signal<GameId>("menu");
