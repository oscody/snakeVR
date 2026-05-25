/**
 * Shared launcher state.
 *
 * `GameMenuSystem` is always registered and watches `gameHub.requested`;
 * when it changes it unregisters the running game's system and registers
 * the next one. A game asks to return to the launcher by setting
 * `gameHub.requested = "menu"`.
 *
 * A plain mutable object is enough — `GameMenuSystem` polls it once per frame.
 */

export type GameId = "menu" | "snake";

export const gameHub: { requested: GameId } = { requested: "menu" };
