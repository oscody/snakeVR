---
name: project-snakevr
description: snakeVR project origin, architecture, boot flow, and improvement history
metadata:
  type: project
---

## Origin
Code was copied from `/Users/bogle/Dev/VR/playground` into `/Users/bogle/Dev/VR/snakeVR`. The playground is a multi-game hub (Snake + Strata block game); snakeVR is snake-only.

**Why:** User wanted a standalone snake VR app without the Strata block game.

## Source structure vs snakeVR structure
Playground uses subdirectories (`src/shared/`, `src/serpent-grid/`, `src/strata/`). snakeVR uses a **flat `src/`** — all files at the same level.

**How to apply:** Any import path copied from playground that starts with `../shared/` or `../serpent-grid/` must be rewritten to `./` in snakeVR.

## Boot flow
1. `index.ts`: calls `installSnakeGlobals(world)`, then registers `GameMenuSystem { priority: -10 }` + `PlayerTunerSystem { priority: 0 }`
2. `GameMenuSystem.init()`: builds launcher menu, subscribes to `requestedGame` signal
3. Player clicks card or presses `1` → `requestedGame.value = "snake"`
4. Signal subscription fires → microtask schedules `applyTransition()`
5. `applyTransition()`: registers `SnakeGameSystem { priority: -5 }` + `EatPulseSystem { priority: 0 }`
6. Escape in-game → `requestedGame.value = "menu"` → unregisters both systems

## State management (signals)
`gameHub.ts` exports:
- `requestedGame = signal<GameId>("menu")` — reactive game selection
- `installSnakeGlobals(world)` / `getSnakeGlobals(world)` — snake-specific globals on `world.globals.snake`
- `SnakeGlobals.difficulty: Signal<Difficulty>` — "easy" | "normal" | "hard"
- `safeRemove(entity, component)` — guards removal with `entity.active` check

## Difficulty system
`DIFFICULTY` table in `snakeGame.ts`:
```typescript
const DIFFICULTY = {
  easy:   { tickBase: 0.60, minTick: 0.18, tickStep: 0.015 },
  normal: { tickBase: 0.34, minTick: 0.12, tickStep: 0.025 },
  hard:   { tickBase: 0.20, minTick: 0.08, tickStep: 0.036 },
} as const;
```
Three buttons below the snake card in the launcher (EASY/NORMAL/HARD). Active glows cyan. Difficulty is read in `startGame()` via `getSnakeGlobals(this.world).difficulty.peek()`.

## Eat pulse ring
`eatPulse.ts` (new file) — `EatPulseSystem` + `spawnEatPulse(world, parent, position)`.
- Green `RingGeometry` with additive blending, expands 1×→2.8× and fades over 0.4s, self-disposes
- Called in `SnakeGameSystem.tick()` when orb is eaten, parented to `boardEntity`
- Registered/unregistered alongside `SnakeGameSystem` in `applyTransition()`

## Key files
| File | Role |
|------|------|
| `src/index.ts` | Entry — installs globals, registers systems with priorities |
| `src/gameHub.ts` | `requestedGame` signal, `SnakeGlobals`, `safeRemove` |
| `src/gameMenu.ts` | Launcher UI, signal subscription, difficulty buttons |
| `src/snakeGame.ts` | Snake game system, DIFFICULTY table |
| `src/eatPulse.ts` | Orb-eat pulse ring system (new) |
| `src/snakeHud.ts` | HUD score/length/speed display |
| `src/holoUi.ts` | Canvas drawing helpers (panels, text, glow) |
| `src/layoutState.ts` | Shared layout coordinates signal |
| `src/playerTuner.ts` | Player height/IPD tuning panel (dev tool) |
