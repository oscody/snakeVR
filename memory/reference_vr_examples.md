---
name: reference-vr-examples
description: Patterns from /Users/bogle/Dev/VR/vr_examples (Chess, Pong, Foosball) applicable to IWSDK projects
metadata:
  type: reference
---

## Location
`/Users/bogle/Dev/VR/vr_examples` — three production-quality IWSDK examples: Chess, Pong, Foosball.

## Key patterns worth reusing

### Signal-based state (Chess + Pong)
```typescript
// chess/src/chess/chess-state.ts
import { signal, type Signal } from "@preact/signals-core";
export function installChessGlobals(world: World): ChessGlobals { ... }
export function getChess(world: World): ChessGlobals { ... }
// Store on world.globals:
(world.globals as Record<string, unknown>).chess = state;
```
Use `signal<T>()` for game state. Install globals in `index.ts` before registering systems. Subscribe in systems with `this.cleanupFuncs.push(sig.subscribe(...))`.

### safeRemove (Chess)
```typescript
// chess/src/chess/chess-state.ts
export function safeRemove(entity: Entity, component: any): void {
  if (!entity.active) return;
  if (entity.hasComponent(component)) entity.removeComponent(component);
}
```
Always use this instead of bare `entity.removeComponent()` — prevents "entity destroyed" errors during system teardown.

### Bounce/eat pulse ring (Pong)
```typescript
// pong/src/pulse.ts
export const BouncePulse = createComponent("BouncePulse", { age, maxAge });
export function spawnPulse(world, parent, position, normal, tint): Entity { ... }
export class BouncePulseSystem extends createSystem({ pulses: { required: [BouncePulse] } }) { ... }
```
Spawns a `RingGeometry` with `ShaderMaterial` (additive blending). Ages it, scales 1×→2.6×, fades alpha, self-disposes at maxAge. Orient with `setFromUnitVectors(FORWARD, normal)`.

### Difficulty profiles (Pong)
```typescript
// pong/src/paddle.ts
const DIFFICULTY_PARAMS = {
  easy:   { tau: 0.3, maxSpeed: 1.2, lookahead: "none", ... },
  medium: { tau: 0.12, maxSpeed: 2.0, lookahead: "straight", ... },
  hard:   { tau: 0.04, maxSpeed: 3.5, lookahead: "reflected", ... },
};
```
Store difficulty as a `signal<string>`, read via `.peek()` in `update()`. Use a table lookup — avoids if/else chains.

### System priority ordering (all examples)
```typescript
world
  .registerSystem(InputSystem, { priority: -20 })
  .registerSystem(AISystem, { priority: -15 })
  .registerSystem(AnimationSystem, { priority: -10 })
  .registerSystem(FeedbackSystem, { priority: -5 });
```
Lower numbers run first. Input → game logic → visual feedback.

### Global state registry (Chess)
```typescript
(world.globals as Record<string, unknown>).myGame = state;
// Later in any system:
const g = (this.world.globals as Record<string, unknown>).myGame as MyGlobals;
```
Avoids prop-drilling; any system can access shared state without imports coupling.

### Visibility state gating (all examples)
```typescript
this.cleanupFuncs.push(
  this.world.visibilityState.subscribe((state) => {
    if (state === VisibilityState.VisibleBlurred) { /* pause */ }
    else if (state === VisibilityState.Visible) { /* resume */ }
  })
);
```

## Example file locations
- Chess state: `chess/src/chess/chess-state.ts`
- Pong pulse: `pong/src/pulse.ts`
- Pong difficulty: `pong/src/paddle.ts`
- Foosball AI FSM: `foosball/src/ai.ts`
- Foosball rod grab: `foosball/src/rod-grab.ts`
