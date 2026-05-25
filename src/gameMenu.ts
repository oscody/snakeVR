import {
  CanvasTexture,
  createSystem,
  Entity,
  Group,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PokeInteractable,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
} from "@iwsdk/core";

import { EatPulseSystem } from "./eatPulse.js";
import {
  getSnakeGlobals,
  requestedGame,
  safeRemove,
  type Difficulty,
  type GameId,
} from "./gameHub.js";
import {
  drawHoloPanel,
  drawHoloText,
  HOLO,
  makeGlowMaterial,
  makeScanlineTexture,
  rgba,
} from "./holoUi.js";
import { SnakeGameSystem } from "./snakeGame.js";

/**
 * GameMenuSystem — the launcher.
 *
 * This is the only system registered at boot. It builds a floating
 * neon-holographic menu (two game cards) plus a persistent corner MENU button,
 * and owns every transition between games:
 *
 *   - A card / key sets `requestedGame.value`.
 *   - `update()` notices the change and schedules `applyTransition()` as a
 *     microtask — so the actual `registerSystem` / `unregisterSystem` happens
 *     after the current frame's system loop finishes, never mid-update.
 *   - The outgoing game's system is unregistered (its `cleanupFuncs` tear down
 *     its scene); the incoming game's system is registered (its `init()` runs).
 *
 * The menu's own meshes live for the whole app lifetime, so it needs no cleanup.
 */

const MENU_POS = { x: 0, y: 1.35, z: -1.0 }; // world position of the menu
const MENU_BTN_POS = { x: 0, y: 0.55, z: -0.4 }; // corner "return" button

interface MenuCard {
  entity: Entity;
  ctx: CanvasRenderingContext2D;
  tex: CanvasTexture;
  glow: Mesh; // additive halo behind the card
  accent: string;
  title: string;
  subtitle: string;
  hovered: boolean;
}

const DIFF_KEYS: Difficulty[] = ["easy", "normal", "hard"];
const DIFF_LABELS = ["EASY", "NORMAL", "HARD"];

export class GameMenuSystem extends createSystem({}) {
  private menuRoot!: Group;
  private snakeBtn!: Entity;
  private menuBtnEntity!: Entity;
  private diffBtns: Entity[] = [];
  private diffCtxs: CanvasRenderingContext2D[] = [];
  private diffTexes: CanvasTexture[] = [];

  private current: GameId = "menu";
  private transitioning = false;
  private pressedPrev = { snake: false, menu: false, easy: false, normal: false, hard: false };

  // --- visuals ---
  private cards: MenuCard[] = [];
  private outerGlow!: Mesh;
  private menuBtnGlow!: Mesh;
  private scanlineTex!: CanvasTexture;
  private elapsed = 0;

  init() {
    this.buildMenu();
    this.buildMenuButton();

    // Initial state: launcher visible, no game running.
    this.menuRoot.visible = true;
    this.setInteractable(this.snakeBtn, true);
    for (const btn of this.diffBtns) this.setInteractable(btn, true);
    this.menuBtnEntity.object3D!.visible = false;
    this.setInteractable(this.menuBtnEntity, false);
    this.frameMenuCamera();

    // Subscribe to game selection so transitions fire reactively, not via poll.
    this.cleanupFuncs.push(
      requestedGame.subscribe((next) => {
        if (next !== this.current && !this.transitioning) {
          this.transitioning = true;
          Promise.resolve().then(() => {
            this.applyTransition();
            this.transitioning = false;
          });
        }
      }),
    );

    console.log(
      "[Snake VR] Launcher ready — click the card or press 1 to start. " +
        "Press Esc inside a game to return here.",
    );
  }

  update(delta: number) {
    this.elapsed += delta;
    this.pollButtons();
    this.pollKeyboard();

    // Breathing outer-glow halo + slow drifting scanlines.
    const breath = 0.8 + 0.2 * Math.sin(this.elapsed * 2.2);
    (this.outerGlow.material as MeshBasicMaterial).opacity = 0.24 * breath;
    this.outerGlow.scale.setScalar(1 + 0.03 * Math.sin(this.elapsed * 2.2));
    this.scanlineTex.offset.y = (this.elapsed * 0.03) % 1;

    // Game cards: repaint on hover-change, scale, and pulse the halo.
    for (const card of this.cards) {
      const hovered = card.entity.hasComponent(Hovered);
      if (hovered !== card.hovered) {
        card.hovered = hovered;
        this.drawCard(card);
      }
      card.entity.object3D?.scale.setScalar(hovered ? 1.06 : 1);
      const base = hovered ? 0.55 : 0.22;
      const speed = hovered ? 5.5 : 2.2;
      (card.glow.material as MeshBasicMaterial).opacity =
        base * (0.8 + 0.2 * Math.sin(this.elapsed * speed));
    }

    // Difficulty buttons: hover scale.
    for (const btn of this.diffBtns) {
      btn.object3D?.scale.setScalar(btn.hasComponent(Hovered) ? 1.06 : 1);
    }

    // Corner MENU button.
    const mbHover = this.menuBtnEntity.hasComponent(Hovered);
    this.menuBtnEntity.object3D?.scale.setScalar(mbHover ? 1.06 : 1);
    (this.menuBtnGlow.material as MeshBasicMaterial).opacity =
      (mbHover ? 0.5 : 0.22) * (0.8 + 0.2 * Math.sin(this.elapsed * 3));
  }

  // --- transitions --------------------------------------------------------

  private applyTransition() {
    const next = requestedGame.peek();
    if (next === this.current) return;

    if (this.current === "snake") {
      this.world.unregisterSystem(SnakeGameSystem);
      this.world.unregisterSystem(EatPulseSystem);
    }
    if (next === "snake") {
      this.world.registerSystem(SnakeGameSystem, { priority: -5 });
      this.world.registerSystem(EatPulseSystem, { priority: 0 });
    }

    const inMenu = next === "menu";
    this.menuRoot.visible = inMenu;
    this.setInteractable(this.snakeBtn, inMenu);
    for (const btn of this.diffBtns) this.setInteractable(btn, inMenu);
    this.menuBtnEntity.object3D!.visible = false;
    this.setInteractable(this.menuBtnEntity, false);
    if (inMenu) this.frameMenuCamera();

    for (const e of [this.snakeBtn, this.menuBtnEntity, ...this.diffBtns]) {
      e.object3D?.scale.setScalar(1);
    }
    this.current = next;
  }

  private frameMenuCamera() {
    this.world.camera.position.set(0, 1.5, 0.3);
    this.world.camera.lookAt(MENU_POS.x, MENU_POS.y, MENU_POS.z);
  }

  // --- input --------------------------------------------------------------

  private pollButtons() {
    const fire = (e: Entity, key: "snake" | "menu", requested: GameId) => {
      const now = e.hasComponent(Pressed);
      if (now && !this.pressedPrev[key]) requestedGame.value = requested;
      this.pressedPrev[key] = now;
    };
    fire(this.snakeBtn, "snake", "snake");
    fire(this.menuBtnEntity, "menu", "menu");

    for (let i = 0; i < DIFF_KEYS.length; i++) {
      const key = DIFF_KEYS[i];
      const now = this.diffBtns[i]?.hasComponent(Pressed) ?? false;
      if (now && !this.pressedPrev[key]) {
        getSnakeGlobals(this.world).difficulty.value = key;
        this.drawDifficultyButtons();
      }
      this.pressedPrev[key] = now;
    }
  }

  private pollKeyboard() {
    const kb = this.input.keyboard;
    if (this.current === "menu") {
      if (kb.getKeyDown("Digit1")) requestedGame.value = "snake";
    } else if (kb.getKeyDown("Escape")) {
      requestedGame.value = "menu";
    }
  }

  private setInteractable(e: Entity, on: boolean) {
    if (on) {
      if (!e.hasComponent(RayInteractable)) e.addComponent(RayInteractable);
      if (!e.hasComponent(PokeInteractable)) e.addComponent(PokeInteractable);
    } else {
      safeRemove(e, RayInteractable);
      safeRemove(e, PokeInteractable);
    }
  }

  // --- scene construction -------------------------------------------------

  private buildMenu() {
    this.menuRoot = new Group();
    this.menuRoot.position.set(MENU_POS.x, MENU_POS.y, MENU_POS.z);
    const menuEntity = this.world.createTransformEntity(this.menuRoot);

    // Soft outer-glow halo — makes the panel feel suspended in space.
    this.outerGlow = new Mesh(
      new PlaneGeometry(1.7, 1.52),
      makeGlowMaterial(HOLO.cyan),
    );
    this.outerGlow.position.set(0, 0, -0.06);
    this.menuRoot.add(this.outerGlow);

    // Backboard — dark navy holographic panel.
    const board = this.makePanel(1.18, 1.04, 1180, 1040);
    drawHoloPanel(board.ctx, 30, 30, 1120, 980, {
      accent: HOLO.cyan,
      radius: 42,
      glow: 1,
    });
    board.tex.needsUpdate = true;
    board.mesh.position.set(0, 0, -0.03);
    this.menuRoot.add(board.mesh);

    // Drifting scanline overlay.
    this.scanlineTex = makeScanlineTexture();
    this.scanlineTex.repeat.set(34, 26);
    const scan = new Mesh(
      new PlaneGeometry(1.04, 0.88),
      new MeshBasicMaterial({
        map: this.scanlineTex,
        transparent: true,
        depthWrite: false,
      }),
    );
    scan.position.set(0, 0, -0.018);
    this.menuRoot.add(scan);

    // Title + subtitle pill.
    const title = this.makePanel(1.0, 0.32, 1000, 320);
    this.drawTitle(title.ctx);
    title.tex.needsUpdate = true;
    title.mesh.position.set(0, 0.31, 0);
    this.menuRoot.add(title.mesh);

    // Game card.
    this.snakeBtn = this.makeCard(
      -0.1,
      "SERPENT GRID XR",
      "holographic snake arena",
      HOLO.green,
      menuEntity,
    );

    this.buildDifficultyButtons(menuEntity);
  }

  private buildDifficultyButtons(menuEntity: Entity) {
    const xs = [-0.26, 0, 0.26];
    const y = -0.31;
    for (let i = 0; i < DIFF_KEYS.length; i++) {
      const panel = this.makePanel(0.22, 0.076, 280, 96);
      panel.mesh.position.set(xs[i], y, 0.012);
      const entity = this.world.createTransformEntity(panel.mesh, menuEntity);
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      this.diffBtns.push(entity);
      this.diffCtxs.push(panel.ctx);
      this.diffTexes.push(panel.tex);
    }
    this.drawDifficultyButtons();
  }

  private drawDifficultyButtons() {
    const current = getSnakeGlobals(this.world).difficulty.peek();
    for (let i = 0; i < DIFF_KEYS.length; i++) {
      const active = DIFF_KEYS[i] === current;
      const c = this.diffCtxs[i];
      c.clearRect(0, 0, 280, 96);
      drawHoloPanel(c, 6, 6, 268, 84, {
        accent: active ? HOLO.cyan : rgba(HOLO.lavender, 0.35),
        radius: 14,
        glow: active ? 1.0 : 0.2,
        brackets: false,
      });
      drawHoloText(c, DIFF_LABELS[i], 140, 58, {
        font: "bold 26px sans-serif",
        color: active ? HOLO.text : rgba(HOLO.lavender, 0.55),
        glow: active ? 0.45 : 0,
        align: "center",
        letterSpacing: 2,
      });
      this.diffTexes[i].needsUpdate = true;
    }
  }

  private drawTitle(c: CanvasRenderingContext2D) {
    c.clearRect(0, 0, 1000, 320);
    drawHoloText(c, "SNAKE VR", 500, 128, {
      font: "bold 74px sans-serif",
      color: HOLO.cyanBright,
      glow: 1.1,
      align: "center",
      letterSpacing: 5,
    });
    // subtitle pill
    const pillW = 320;
    const pillH = 58;
    const px = 500 - pillW / 2;
    const py = 196;
    c.save();
    c.strokeStyle = rgba(HOLO.cyan, 0.7);
    c.shadowColor = HOLO.cyan;
    c.shadowBlur = 12;
    c.lineWidth = 2.5;
    c.beginPath();
    c.roundRect(px, py, pillW, pillH, pillH / 2);
    c.stroke();
    c.restore();
    drawHoloText(c, "PRESS 1 OR CLICK TO PLAY", 500, py + 39, {
      font: "26px sans-serif",
      color: HOLO.lavender,
      align: "center",
      letterSpacing: 5,
    });
  }

  private makeCard(
    localY: number,
    title: string,
    subtitle: string,
    accent: string,
    parent: Entity,
  ): Entity {
    const panel = this.makePanel(0.86, 0.26, 760, 230);
    panel.mesh.position.set(0, localY, 0.012);
    const entity = this.world.createTransformEntity(panel.mesh, parent);

    // Additive halo behind the card (a menuRoot child, so the card's
    // hover-scale and the InputSystem raycast are unaffected by it).
    const glow = new Mesh(new PlaneGeometry(1.04, 0.46), makeGlowMaterial(accent));
    glow.position.set(0, localY, 0.004);
    this.menuRoot.add(glow);

    const card: MenuCard = {
      entity,
      ctx: panel.ctx,
      tex: panel.tex,
      glow,
      accent,
      title,
      subtitle,
      hovered: false,
    };
    this.cards.push(card);
    this.drawCard(card);
    return entity;
  }

  /** Paint (or repaint) a game card — brighter glow while hovered. */
  private drawCard(card: MenuCard) {
    const c = card.ctx;
    const W = 760;
    const H = 230;
    c.clearRect(0, 0, W, H);
    const glow = card.hovered ? 1.4 : 0.85;
    drawHoloPanel(c, 28, 28, W - 56, H - 56, {
      accent: card.accent,
      radius: 28,
      glow,
    });

    // Glowing side rail (replaces the old flat accent bar).
    c.save();
    c.shadowColor = card.accent;
    c.shadowBlur = 24 * glow;
    c.fillStyle = card.accent;
    c.beginPath();
    c.roundRect(48, 58, 13, H - 116, 6);
    c.fill();
    c.restore();

    drawHoloText(c, card.title, 102, 120, {
      font: "bold 58px sans-serif",
      color: HOLO.text,
      glow: card.hovered ? 0.6 : 0.25,
      letterSpacing: 3,
    });
    drawHoloText(c, card.subtitle.toUpperCase(), 102, 172, {
      font: "25px sans-serif",
      color: HOLO.lavender,
      letterSpacing: 2,
    });
    card.tex.needsUpdate = true;
  }

  private buildMenuButton() {
    const panel = this.makePanel(0.26, 0.12, 380, 176);
    const c = panel.ctx;
    drawHoloPanel(c, 22, 22, 336, 132, {
      accent: HOLO.cyan,
      radius: 22,
      glow: 0.9,
    });
    // glowing hamburger glyph
    c.save();
    c.shadowColor = HOLO.cyan;
    c.shadowBlur = 12;
    c.fillStyle = HOLO.cyan;
    for (let i = 0; i < 3; i++) c.fillRect(58, 64 + i * 20, 52, 8);
    c.restore();
    drawHoloText(c, "MENU", 142, 102, {
      font: "bold 42px sans-serif",
      color: HOLO.text,
      glow: 0.4,
      letterSpacing: 3,
    });
    panel.tex.needsUpdate = true;
    panel.mesh.position.set(MENU_BTN_POS.x, MENU_BTN_POS.y, MENU_BTN_POS.z);
    this.menuBtnEntity = this.world.createTransformEntity(panel.mesh);

    // Halo — a child of the button mesh, so it shows/hides and scales with it.
    this.menuBtnGlow = new Mesh(
      new PlaneGeometry(0.42, 0.26),
      makeGlowMaterial(HOLO.cyan),
    );
    this.menuBtnGlow.position.set(0, 0, -0.012);
    panel.mesh.add(this.menuBtnGlow);
  }

  /** Create a flat panel mesh + its 2D-canvas drawing context. */
  private makePanel(
    w: number,
    h: number,
    cw: number,
    ch: number,
  ): { mesh: Mesh; ctx: CanvasRenderingContext2D; tex: CanvasTexture } {
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ map: tex, transparent: true }),
    );
    return { mesh, ctx, tex };
  }
}
