import {
  AudioUtils,
  createSystem,
  InputComponent,
  Mesh,
  Vector3,
  VisibilityState,
} from "@iwsdk/core";

import { spawnEatPulse } from "./eat-pulse-system.js";
import {
  BOARD,
  DIFFICULTY,
  GRID,
  PLAYER_Y,
  SEG_Y,
  START_LEN,
  TILE,
} from "./snake-constants.js";
import {
  buildSnakeBoard,
  disposeSnakeScene,
  type SnakeBoardRefs,
} from "./snake-board.js";
import { getSnakeState } from "./snake-state.js";

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
    }

    this.renderSnake();
    // Orb pulse.
    this.refs.orbMesh.scale.setScalar(1 + Math.sin(this.elapsed * 4) * 0.16);
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

    state.score.value = 0;
    state.length.value = this.body.length;
    state.speedPct.value = 0;
    state.status.value = "ready";

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

    if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) {
      this.endGame();
      return;
    }
    const willEat = nx === this.orb.x && nz === this.orb.z;
    const checkLen = willEat ? this.body.length : this.body.length - 1;
    for (let i = 0; i < checkLen; i++) {
      if (this.body[i].x === nx && this.body[i].z === nz) {
        this.endGame();
        return;
      }
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
      state.score.value = state.score.peek() + 1;
      this.tickInterval = Math.max(
        this.minTick,
        this.tickInterval - this.tickStepSize,
      );
      state.length.value = this.body.length;
      this.publishSpeed();
      this.spawnOrb();
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
    this.refs.orbMesh.position.set(this.lx(x), SEG_Y, this.lz(z));
  }

  private onSnake(x: number, z: number): boolean {
    return this.body.some((cell) => cell.x === x && cell.z === z);
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
