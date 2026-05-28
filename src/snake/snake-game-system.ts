import {
  AudioUtils,
  createSystem,
  Entity,
  InputComponent,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  VisibilityState,
} from "@iwsdk/core";

import { CorruptionBlock, spawnCorruptionBlock } from "./corruption-block.js";
import { spawnEatPulse } from "./eat-pulse-system.js";
import { GrowthPowerup, spawnGrowthPowerup } from "./growth-powerup.js";
import {
  MultiplierPowerup,
  spawnMultiplierPowerup,
} from "./multiplier-powerup.js";
import { ShieldPowerup, spawnShieldPowerup } from "./shield-powerup.js";
import {
  BOARD,
  CORRUPTION_LIFETIME,
  CORRUPTION_MIN_LENGTH,
  CORRUPTION_PER_ORB,
  CORRUPTION_SHRINK,
  CORRUPTION_SPAWN_RADIUS,
  DIFFICULTY,
  GRID,
  GROWTH_EXTRA_SEGMENTS,
  GROWTH_ORBS_PER_PICKUP,
  MULTIPLIER_FACTOR,
  MULTIPLIER_ORBS_PER_PICKUP,
  PLAYER_Y,
  POWERUP_LIFETIME,
  POWERUP_MIN_LENGTH,
  POWERUP_SPAWN_MAX,
  POWERUP_SPAWN_MIN,
  SEG_Y,
  SHIELD_CHARGES_PER_PICKUP,
  START_LEN,
  TILE,
} from "./snake-constants.js";
import {
  buildSnakeBoard,
  disposeSnakeScene,
  type SnakeBoardRefs,
} from "./snake-board.js";
import { getSnakeState } from "./snake-state.js";

type PowerupKind = "shield" | "multiplier" | "growth";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Cell {
  x: number;
  z: number;
}

/**
 * Owns the snake game loop: scene setup, input handling, tick advancement,
 * collision, and rendering. Stats (score/length/speed/status) are pushed
 * into shared signals on `world.globals.snake` so the HUD panel system can
 * subscribe to them — keeps gameplay logic and UI rendering decoupled.
 */
export class SnakeGameSystem extends createSystem({}) {
  private refs!: SnakeBoardRefs;
  private prevPlayerY = 0;

  private segMeshes: Mesh[] = [];

  private body: Cell[] = [];
  private prevBody: Cell[] = [];
  private dir: Cell = { x: 0, z: -1 };
  private nextDir: Cell = { x: 0, z: -1 };
  private orb: Cell = { x: 0, z: 0 };

  private tickTimer = 0;
  private tickInterval: number = DIFFICULTY.normal.tickBase;
  private tickBase: number = DIFFICULTY.normal.tickBase;
  private minTick: number = DIFFICULTY.normal.minTick;
  private tickStepSize: number = DIFFICULTY.normal.tickStep;
  private gameOver = false;
  private started = false;
  private elapsed = 0;
  private newGameSeen = 0;
  private tmpDir = new Vector3();

  // --- corruption-block state ---
  private corruptionEntities: Entity[] = [];

  // --- power-up state (one at a time) ---
  private powerupEntity: Entity | null = null;
  private powerupKind: PowerupKind | null = null;
  private powerupTimer = 0;
  private powerupNextSpawn = 0;

  init() {
    this.prevPlayerY = this.world.player.position.y;
    this.world.player.position.y = PLAYER_Y;

    // Non-immersive (browser) framing: look forward and down at the board.
    this.world.camera.position.set(0, 1.6, 0.4);
    this.world.camera.lookAt(BOARD.x, BOARD.y, BOARD.z);

    this.refs = buildSnakeBoard(this.world);
    this.startGame();

    // Listen for NEW GAME requests from the HUD panel (or keyboard).
    const state = getSnakeState(this.world);
    this.newGameSeen = state.newGameRequest.peek();
    this.cleanupFuncs.push(
      state.newGameRequest.subscribe((v) => {
        if (v !== this.newGameSeen) {
          this.newGameSeen = v;
          this.onActionButton();
        }
      }),
    );

    this.cleanupFuncs.push(() => {
      this.world.player.position.y = this.prevPlayerY;
      this.disposeAllCorruption();
      this.disposePowerup();
      disposeSnakeScene(this.refs);
    });

    console.log(
      "[Serpent Grid XR] Steer to begin — Arrows/WASD, controller thumbstick, " +
        "or point-and-pinch with a tracked hand. NEW GAME button restarts.",
    );
  }

  update(delta: number) {
    this.elapsed += delta;
    if (this.world.visibilityState.peek() === VisibilityState.VisibleBlurred) {
      return;
    }

    this.handleInput();

    if (this.started && !this.gameOver) {
      this.tickTimer += delta;
      while (this.tickTimer >= this.tickInterval && !this.gameOver) {
        this.tickTimer -= this.tickInterval;
        this.tick();
      }
      this.updatePowerup(delta);
    }

    this.renderSnake();
    this.animateOrb(delta);
  }

  /**
   * Drive the multi-layer orb's animation each frame — scale pulse on the
   * root group, slow yaw + tilt sway, emissive-intensity breathing on the
   * shell, additive-halo opacity breathing, and contra-rotation on the two
   * torus rings. Sub-meshes come directly off `OrbRefs`; no `getObjectByName`.
   */
  private animateOrb(delta: number) {
    const orb = this.refs.orb;
    orb.group.scale.setScalar(1 + Math.sin(this.elapsed * 4) * 0.16);
    orb.group.rotation.y += delta * 0.6;
    orb.group.rotation.x = Math.sin(this.elapsed * 0.9) * 0.08;

    (orb.shell.material as MeshStandardMaterial).emissiveIntensity =
      1.35 + Math.sin(this.elapsed * 4.2) * 0.28;
    (orb.halo.material as MeshBasicMaterial).opacity =
      0.16 + Math.sin(this.elapsed * 3.6) * 0.045;
    orb.ringEquator.rotation.z += delta * 0.6;
    orb.ringTilted.rotation.z -= delta * 0.78;
  }

  // --- game loop ---------------------------------------------------------

  private startGame() {
    const state = getSnakeState(this.world);
    const diff = DIFFICULTY[state.difficulty.peek()];
    this.tickBase = diff.tickBase;
    this.minTick = diff.minTick;
    this.tickStepSize = diff.tickStep;

    const c = Math.floor(GRID / 2);
    this.body = [];
    for (let i = 0; i < START_LEN; i++) this.body.push({ x: c, z: c + i });
    this.prevBody = this.body.map((cell) => ({ ...cell }));
    this.dir = { x: 0, z: -1 };
    this.nextDir = { x: 0, z: -1 };
    this.tickInterval = this.tickBase;
    this.tickTimer = 0;
    this.gameOver = false;
    this.started = false;

    this.disposeAllCorruption();
    this.disposePowerup();
    this.powerupTimer = 0;
    this.powerupNextSpawn = this.rollPowerupSpawnDelay();

    state.score.value = 0;
    state.length.value = this.body.length;
    state.speedPct.value = 0;
    state.status.value = "ready";
    state.shieldCharges.value = 0;
    state.multiplierOrbsLeft.value = 0;
    state.growthOrbsLeft.value = 0;

    this.spawnOrb();
    this.ensureSegmentMeshes();
    this.renderSnake();
  }

  /** Advance the serpent one tile. */
  private tick() {
    this.dir = { ...this.nextDir };
    const head = this.body[0];
    const nx = head.x + this.dir.x;
    const nz = head.z + this.dir.z;

    // Wall — shield absorbs it; snake just stays put this tick.
    if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) {
      if (this.consumeShieldIfAny()) return;
      this.endGame();
      return;
    }

    const willEat = nx === this.orb.x && nz === this.orb.z;
    const checkLen = willEat ? this.body.length : this.body.length - 1;
    for (let i = 0; i < checkLen; i++) {
      if (this.body[i].x === nx && this.body[i].z === nz) {
        if (this.consumeShieldIfAny()) return;
        this.endGame();
        return;
      }
    }

    // Corruption block — shield absorbs the hit (block disposed, no shrink);
    // otherwise apply the normal shrink + maybe-game-over path.
    if (this.corruptionEntities.length && this.isCorruptionCell(nx, nz)) {
      if (this.consumeShieldIfAny()) {
        this.disposeCorruptionAt(nx, nz);
        // fall through to advance body normally onto the (now empty) cell
      } else {
        this.handleCorruptionHit(nx, nz);
        return;
      }
    }

    // Power-up pickup — head moves onto the powerup tile; effect kicks in,
    // entity disposes, snake advances normally onto the (now empty) cell.
    if (this.powerupEntity && this.isPowerupCell(nx, nz)) {
      this.collectPowerup();
    }

    this.prevBody = this.body.map((cell) => ({ ...cell }));
    this.body.unshift({ x: nx, z: nz });
    if (willEat) {
      spawnEatPulse(
        this.world,
        this.refs.boardEntity,
        new Vector3(this.lx(this.orb.x), SEG_Y, this.lz(this.orb.z)),
      );
      const state = getSnakeState(this.world);
      const points =
        state.multiplierOrbsLeft.peek() > 0 ? MULTIPLIER_FACTOR : 1;
      state.score.value = state.score.peek() + points;
      if (state.multiplierOrbsLeft.peek() > 0) {
        state.multiplierOrbsLeft.value = state.multiplierOrbsLeft.peek() - 1;
      }
      this.tickInterval = Math.max(
        this.minTick,
        this.tickInterval - this.tickStepSize,
      );

      // Growth bonus: duplicate the new tail an extra N times so the snake
      // grows by 1 + GROWTH_EXTRA_SEGMENTS instead of just 1.
      if (state.growthOrbsLeft.peek() > 0) {
        const tail = this.body[this.body.length - 1];
        for (let i = 0; i < GROWTH_EXTRA_SEGMENTS; i++) {
          this.body.push({ ...tail });
        }
        state.growthOrbsLeft.value = state.growthOrbsLeft.peek() - 1;
      }

      state.length.value = this.body.length;
      this.publishSpeed();
      this.disposeAllCorruption();
      this.spawnOrb();
      if (this.body.length >= CORRUPTION_MIN_LENGTH) {
        this.spawnCorruptionPairNearOrb();
      }
      AudioUtils.play(this.refs.orbEntity);
      this.ensureSegmentMeshes();
    } else {
      this.body.pop();
    }
  }

  private publishSpeed() {
    const state = getSnakeState(this.world);
    const range = this.tickBase - this.minTick;
    const pct = range > 0
      ? Math.round(((this.tickBase - this.tickInterval) / range) * 100)
      : 0;
    state.speedPct.value = pct;
  }

  private endGame() {
    this.gameOver = true;
    AudioUtils.play(this.refs.gameOverAudio);
    getSnakeState(this.world).status.value = "gameOver";
  }

  private setDir(dx: number, dz: number) {
    if (this.gameOver) return;
    if (!this.started) {
      this.dir = { x: dx, z: dz };
      this.nextDir = { x: dx, z: dz };
      this.started = true;
      getSnakeState(this.world).status.value = "playing";
      return;
    }
    // Reject a 180° reversal of the current heading.
    if (dx === -this.nextDir.x && dz === -this.nextDir.z) return;
    this.nextDir = { x: dx, z: dz };
  }

  private spawnOrb() {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 300; tries++) {
      x = Math.floor(Math.random() * GRID);
      z = Math.floor(Math.random() * GRID);
      if (!this.onSnake(x, z)) break;
    }
    if (this.onSnake(x, z)) {
      // Board nearly full — take the first free tile.
      outer: for (let gx = 0; gx < GRID; gx++) {
        for (let gz = 0; gz < GRID; gz++) {
          if (!this.onSnake(gx, gz)) {
            x = gx;
            z = gz;
            break outer;
          }
        }
      }
    }
    this.orb = { x, z };
    this.refs.orb.group.name = `EnergyOrbCell-${x}-${z}`;
    this.refs.orb.group.position.set(this.lx(x), SEG_Y, this.lz(z));
  }

  private onSnake(x: number, z: number): boolean {
    return this.body.some((cell) => cell.x === x && cell.z === z);
  }

  // --- corruption block --------------------------------------------------

  /**
   * Pick up to CORRUPTION_PER_ORB random cells within
   * CORRUPTION_SPAWN_RADIUS (Chebyshev) of the current orb, skipping the
   * orb's own cell, the snake body, and out-of-bounds. Spawn a block at each.
   */
  private spawnCorruptionPairNearOrb() {
    const candidates: Cell[] = [];
    const r = CORRUPTION_SPAWN_RADIUS;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0) continue;
        const x = this.orb.x + dx;
        const z = this.orb.z + dz;
        if (x < 0 || x >= GRID || z < 0 || z >= GRID) continue;
        if (this.onSnake(x, z)) continue;
        candidates.push({ x, z });
      }
    }
    const n = Math.min(CORRUPTION_PER_ORB, candidates.length);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(Math.random() * (candidates.length - i));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      const cell = candidates[i];
      const worldPos = new Vector3(this.lx(cell.x), SEG_Y, this.lz(cell.z));
      this.corruptionEntities.push(
        spawnCorruptionBlock(
          this.world,
          this.refs.boardEntity,
          cell,
          worldPos,
          CORRUPTION_LIFETIME,
        ),
      );
    }
  }

  private isCorruptionCell(x: number, z: number): boolean {
    for (const e of this.corruptionEntities) {
      if (!e.active) continue;
      if (
        (e.getValue(CorruptionBlock, "cellX") as number) === x &&
        (e.getValue(CorruptionBlock, "cellZ") as number) === z
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Snake head hit a corruption block: dispose only that block, lop off
   * CORRUPTION_SHRINK tail segments, and end the game if that empties the
   * body. Other blocks in the pair stay until the orb is eaten.
   */
  private handleCorruptionHit(nx: number, nz: number) {
    this.disposeCorruptionAt(nx, nz);

    // Slice tail segments; head still advances onto the block's old cell.
    this.prevBody = this.body.map((cell) => ({ ...cell }));
    this.body.unshift({ x: nx, z: nz });
    const overshoot = CORRUPTION_SHRINK + 1; // +1 because we just pushed the head
    const trim = Math.min(overshoot, this.body.length);
    this.body.length = this.body.length - trim + 1; // keep the head

    AudioUtils.play(this.refs.gameOverAudio);

    if (this.body.length <= 0) {
      this.endGame();
      return;
    }

    const state = getSnakeState(this.world);
    state.length.value = this.body.length;
    if (this.prevBody.length > this.body.length) {
      this.prevBody.length = this.body.length;
    }
  }

  private disposeAllCorruption() {
    for (const e of this.corruptionEntities) {
      if (e.active) e.dispose();
    }
    this.corruptionEntities.length = 0;
  }

  /** Find the corruption block at the given cell and dispose only it. */
  private disposeCorruptionAt(x: number, z: number) {
    for (let i = 0; i < this.corruptionEntities.length; i++) {
      const e = this.corruptionEntities[i];
      if (!e.active) continue;
      if (
        (e.getValue(CorruptionBlock, "cellX") as number) === x &&
        (e.getValue(CorruptionBlock, "cellZ") as number) === z
      ) {
        e.dispose();
        this.corruptionEntities.splice(i, 1);
        return;
      }
    }
  }

  // --- power-ups ---------------------------------------------------------

  private rollPowerupSpawnDelay(): number {
    return (
      POWERUP_SPAWN_MIN + Math.random() * (POWERUP_SPAWN_MAX - POWERUP_SPAWN_MIN)
    );
  }

  /**
   * Advance the power-up spawn timer; reap a self-despawned entity; spawn a
   * new random power-up when the timer reaches the next-spawn threshold.
   */
  private updatePowerup(delta: number) {
    if (this.powerupEntity && !this.powerupEntity.active) {
      this.powerupEntity = null;
      this.powerupKind = null;
      this.powerupTimer = 0;
      this.powerupNextSpawn = this.rollPowerupSpawnDelay();
    }
    if (this.powerupEntity) return;
    if (this.body.length < POWERUP_MIN_LENGTH) return;
    this.powerupTimer += delta;
    if (this.powerupTimer < this.powerupNextSpawn) return;
    this.spawnRandomPowerupAtFreeCell();
  }

  private spawnRandomPowerupAtFreeCell() {
    let x = 0;
    let z = 0;
    let found = false;
    for (let tries = 0; tries < 300; tries++) {
      x = Math.floor(Math.random() * GRID);
      z = Math.floor(Math.random() * GRID);
      if (this.isCellFreeForPowerup(x, z)) {
        found = true;
        break;
      }
    }
    if (!found) {
      outer: for (let gx = 0; gx < GRID; gx++) {
        for (let gz = 0; gz < GRID; gz++) {
          if (this.isCellFreeForPowerup(gx, gz)) {
            x = gx;
            z = gz;
            found = true;
            break outer;
          }
        }
      }
    }
    if (!found) return;

    const cell = { x, z };
    const worldPos = new Vector3(this.lx(x), SEG_Y, this.lz(z));
    const roll = Math.floor(Math.random() * 3);
    if (roll === 0) {
      this.powerupKind = "shield";
      this.powerupEntity = spawnShieldPowerup(
        this.world,
        this.refs.boardEntity,
        cell,
        worldPos,
        POWERUP_LIFETIME,
      );
    } else if (roll === 1) {
      this.powerupKind = "multiplier";
      this.powerupEntity = spawnMultiplierPowerup(
        this.world,
        this.refs.boardEntity,
        cell,
        worldPos,
        POWERUP_LIFETIME,
      );
    } else {
      this.powerupKind = "growth";
      this.powerupEntity = spawnGrowthPowerup(
        this.world,
        this.refs.boardEntity,
        cell,
        worldPos,
        POWERUP_LIFETIME,
      );
    }
    console.log(
      `[Powerup] spawned ${this.powerupKind} at cell (${x}, ${z}); will despawn in ${POWERUP_LIFETIME}s`,
    );
  }

  private isCellFreeForPowerup(x: number, z: number): boolean {
    if (this.onSnake(x, z)) return false;
    if (x === this.orb.x && z === this.orb.z) return false;
    for (const e of this.corruptionEntities) {
      if (!e.active) continue;
      if (
        (e.getValue(CorruptionBlock, "cellX") as number) === x &&
        (e.getValue(CorruptionBlock, "cellZ") as number) === z
      ) {
        return false;
      }
    }
    return true;
  }

  private isPowerupCell(x: number, z: number): boolean {
    const e = this.powerupEntity;
    if (!e || !e.active) return false;
    if (this.powerupKind === "shield") {
      return (
        (e.getValue(ShieldPowerup, "cellX") as number) === x &&
        (e.getValue(ShieldPowerup, "cellZ") as number) === z
      );
    }
    if (this.powerupKind === "multiplier") {
      return (
        (e.getValue(MultiplierPowerup, "cellX") as number) === x &&
        (e.getValue(MultiplierPowerup, "cellZ") as number) === z
      );
    }
    if (this.powerupKind === "growth") {
      return (
        (e.getValue(GrowthPowerup, "cellX") as number) === x &&
        (e.getValue(GrowthPowerup, "cellZ") as number) === z
      );
    }
    return false;
  }

  /**
   * Snake head landed on the active power-up: bump the matching signal,
   * dispose the entity, and reschedule the next spawn.
   */
  private collectPowerup() {
    const state = getSnakeState(this.world);
    if (this.powerupKind === "shield") {
      state.shieldCharges.value =
        state.shieldCharges.peek() + SHIELD_CHARGES_PER_PICKUP;
    } else if (this.powerupKind === "multiplier") {
      state.multiplierOrbsLeft.value =
        state.multiplierOrbsLeft.peek() + MULTIPLIER_ORBS_PER_PICKUP;
    } else if (this.powerupKind === "growth") {
      state.growthOrbsLeft.value =
        state.growthOrbsLeft.peek() + GROWTH_ORBS_PER_PICKUP;
    }
    AudioUtils.play(this.refs.orbEntity);
    this.disposePowerup();
    this.powerupTimer = 0;
    this.powerupNextSpawn = this.rollPowerupSpawnDelay();
  }

  /**
   * Consume one shield charge if any are available. Returns true when a
   * charge was spent (caller should bail out of the lethal-collision path).
   */
  private consumeShieldIfAny(): boolean {
    const state = getSnakeState(this.world);
    if (state.shieldCharges.peek() <= 0) return false;
    state.shieldCharges.value = state.shieldCharges.peek() - 1;
    AudioUtils.play(this.refs.gameOverAudio);
    return true;
  }

  private disposePowerup() {
    if (this.powerupEntity && this.powerupEntity.active) {
      this.powerupEntity.dispose();
    }
    this.powerupEntity = null;
    this.powerupKind = null;
  }

  // --- rendering ---------------------------------------------------------

  private renderSnake() {
    this.ensureSegmentMeshes();
    const t = this.gameOver
      ? 1
      : Math.min(this.tickTimer / this.tickInterval, 1);

    for (let i = 0; i < this.body.length; i++) {
      const to = this.body[i];
      const from = this.prevBody[i] ?? to;
      const m = this.segMeshes[i];
      m.visible = true;
      m.position.set(
        lerp(this.lx(from.x), this.lx(to.x), t),
        SEG_Y,
        lerp(this.lz(from.z), this.lz(to.z), t),
      );
    }
    for (let i = this.body.length; i < this.segMeshes.length; i++) {
      this.segMeshes[i].visible = false;
    }
    const head = this.segMeshes[0];
    if (head) head.scale.setScalar(1.16 + Math.sin(this.elapsed * 6) * 0.08);
  }

  /** Grow the segment-mesh pool until it covers the whole body. */
  private ensureSegmentMeshes() {
    while (this.segMeshes.length < this.body.length) {
      const isHead = this.segMeshes.length === 0;
      const mesh = new Mesh(
        this.refs.segGeo,
        isHead ? this.refs.headMat : this.refs.segMat,
      );
      mesh.name = isHead
        ? "SnakeHeadSegment"
        : `SnakeBodySegment-${this.segMeshes.length}`;
      this.refs.board.add(mesh);
      this.segMeshes.push(mesh);
    }
  }

  private lx(gx: number) {
    return (gx - (GRID - 1) / 2) * TILE;
  }
  private lz(gz: number) {
    return (gz - (GRID - 1) / 2) * TILE;
  }

  // --- input -------------------------------------------------------------

  private handleInput() {
    const kb = this.input.keyboard;
    if (kb.getKeyDown("ArrowUp") || kb.getKeyDown("KeyW")) this.setDir(0, -1);
    if (kb.getKeyDown("ArrowDown") || kb.getKeyDown("KeyS")) this.setDir(0, 1);
    if (kb.getKeyDown("ArrowLeft") || kb.getKeyDown("KeyA")) this.setDir(-1, 0);
    if (kb.getKeyDown("ArrowRight") || kb.getKeyDown("KeyD")) this.setDir(1, 0);
    if (kb.getKeyDown("KeyR") && this.gameOver) this.onActionButton();

    const pads = this.input.xr.gamepads;
    for (const hand of ["left", "right"] as const) {
      const g = pads[hand];
      if (!g) continue;
      const ts = InputComponent.Thumbstick;
      if (g.getAxesEnteringUp(ts)) this.setDir(0, -1);
      if (g.getAxesEnteringDown(ts)) this.setDir(0, 1);
      if (g.getAxesEnteringLeft(ts)) this.setDir(-1, 0);
      if (g.getAxesEnteringRight(ts)) this.setDir(1, 0);
      if (g.getButtonDown(InputComponent.Trigger) && this.gameOver) {
        this.onActionButton();
      }
      // Hand point-and-pinch steering.
      if (this.input.xr.isPrimary("hand", hand) && g.getSelectStart()) {
        this.pinchSteer(hand);
      }
    }
  }

  /** Steer toward where a tracked hand is pointing when it pinches. */
  private pinchSteer(hand: "left" | "right") {
    this.world.player.raySpaces[hand].getWorldDirection(this.tmpDir);
    // getWorldDirection gives +Z; a ray/controller points along -Z.
    const px = -this.tmpDir.x;
    const pz = -this.tmpDir.z;
    if (Math.abs(px) >= Math.abs(pz)) this.setDir(Math.sign(px) || 1, 0);
    else this.setDir(0, Math.sign(pz) || -1);
  }

  /** Handle a press of NEW GAME / RESTART (from HUD button, keyboard, or trigger). */
  private onActionButton() {
    if (this.gameOver || this.started) this.startGame();
    this.started = true;
    getSnakeState(this.world).status.value = "playing";
  }

}
