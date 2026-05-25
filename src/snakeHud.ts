import {
  CanvasTexture,
  Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PokeInteractable,
  Pressed,
  RayInteractable,
  SRGBColorSpace,
  World,
} from "@iwsdk/core";

import {
  drawHoloPanel,
  drawHoloText,
  HOLO,
  makeGlowMaterial,
} from "./holoUi.js";

export interface HudArrow {
  e: Entity;
  dx: number;
  dz: number;
  prev: boolean;
}

export interface SnakeHudOptions {
  world: World;
  parent: Entity;
  position: { x: number; y: number; z: number };
  rotationX: number;
}

export class SnakeHud {
  readonly root = new Group();
  readonly controls = new Group();
  readonly rootEntity: Entity;
  readonly controlsEntity: Entity;
  readonly restartEntity: Entity;
  readonly exitVrBtnEntity: Entity;
  readonly hudBoardMoveArrows: HudArrow[];
  readonly hudGlow: Mesh;

  private readonly hudCtx: CanvasRenderingContext2D;
  private readonly hudTex: CanvasTexture;
  private readonly actionCtx: CanvasRenderingContext2D;
  private readonly actionTex: CanvasTexture;
  private actionLabel = "";
  private readonly world: World;

  constructor({ world, parent, position, rotationX }: SnakeHudOptions) {
    this.world = world;

    this.root.position.set(position.x, position.y, position.z);
    this.root.rotation.x = rotationX;
    this.rootEntity = world.createTransformEntity(this.root, parent);

    // Keep the controls tucked just below the HUD panel (on its tilted plane)
    // so the whole HUD reads as one cluster above the board, rather than
    // spilling forward over the playfield.
    this.controls.position.set(0, -0.2, 0.04);
    this.controlsEntity = world.createTransformEntity(this.controls, this.rootEntity);

    const hudCanvas = document.createElement("canvas");
    hudCanvas.width = 620;
    hudCanvas.height = 190;
    this.hudCtx = hudCanvas.getContext("2d")!;
    this.hudTex = new CanvasTexture(hudCanvas);
    this.hudTex.colorSpace = SRGBColorSpace;
    const hudMesh = new Mesh(
      new PlaneGeometry(0.62, 0.19),
      new MeshBasicMaterial({ map: this.hudTex, transparent: true }),
    );
    this.root.add(hudMesh);

    this.hudGlow = new Mesh(
      new PlaneGeometry(0.92, 0.42),
      makeGlowMaterial(HOLO.cyan),
    );
    this.hudGlow.position.set(0, 0, -0.01);
    this.root.add(this.hudGlow);

    this.restartEntity = this.buildActionButton(-0.155, 0, 0.001);

    const actionCanvas = document.createElement("canvas");
    actionCanvas.width = 360;
    actionCanvas.height = 100;
    this.actionCtx = actionCanvas.getContext("2d")!;
    this.actionTex = new CanvasTexture(actionCanvas);
    this.actionTex.colorSpace = SRGBColorSpace;
    const actionMesh = this.restartEntity.object3D as Mesh;
    actionMesh.material = new MeshBasicMaterial({
      map: this.actionTex,
      transparent: true,
    });
    this.actionLabel = "NEW GAME";
    this.drawActionButton("NEW GAME");

    this.exitVrBtnEntity = this.makeButton(
      this.controlsEntity,
      0.29,
      0.08,
      360,
      100,
      0.155,
      0,
      0.001,
      (c) => this.drawTextButton(c, "EXIT VR", "#46e0c0"),
    );

    this.hudBoardMoveArrows = [
      this.makeHudBoardMoveArrow("up", 0, 0.55, 0.001, 0, -1),
      this.makeHudBoardMoveArrow("down", 0, 0.09, 0.001, 0, 1),
      this.makeHudBoardMoveArrow("left", -0.35, 0.2, 0.001, -1, 0),
      this.makeHudBoardMoveArrow("right", 0.35, 0.2, 0.001, 1, 0),
    ];
  }

  dispose() {
    this.hudTex.dispose();
    this.actionTex.dispose();
  }

  move(dx: number, dz: number, step: number) {
    this.root.position.x += dx * step;
    this.root.position.z += dz * step;
  }

  get position() {
    return this.root.position;
  }

  updateGlow(elapsed: number) {
    (this.hudGlow.material as MeshBasicMaterial).opacity =
      0.2 * (0.8 + 0.2 * Math.sin(elapsed * 2));
  }

  updateActionButton(started: boolean, gameOver: boolean) {
    const label = started && !gameOver ? "RESTART" : "NEW GAME";
    if (label === this.actionLabel) return;
    this.actionLabel = label;
    this.drawActionButton(label);
  }

  drawHud(params: {
    score: number;
    length: number;
    gameOver: boolean;
    tickInterval: number;
    startTick: number;
    minTick: number;
  }) {
    const { score, length, gameOver, tickInterval, startTick, minTick } = params;
    const c = this.hudCtx;
    c.clearRect(0, 0, 620, 190);
    drawHoloPanel(c, 16, 16, 588, 158, {
      accent: HOLO.cyan,
      radius: 22,
      glow: 1,
    });

    drawHoloText(c, "SERPENT GRID XR", 310, 52, {
      font: "bold 25px sans-serif",
      color: HOLO.cyan,
      glow: 0.7,
      align: "center",
      letterSpacing: 4,
    });

    if (gameOver) {
      drawHoloText(c, "GAME OVER", 310, 110, {
        font: "bold 44px sans-serif",
        color: HOLO.red,
        glow: 0.9,
        align: "center",
        letterSpacing: 3,
      });
      drawHoloText(c, `SCORE ${score}   ·   LENGTH ${length}`, 310, 144, {
        font: "23px sans-serif",
        color: HOLO.lavender,
        align: "center",
      });
      drawHoloText(c, "PRESS R · TRIGGER · RESTART", 310, 170, {
        font: "17px sans-serif",
        color: HOLO.lavender,
        align: "center",
        letterSpacing: 2,
      });
    } else {
      drawHoloText(c, `SCORE  ${String(score).padStart(3, "0")}`, 310, 114, {
        font: "bold 48px sans-serif",
        color: HOLO.text,
        glow: 0.4,
        align: "center",
        letterSpacing: 3,
      });
      const speed = Math.round(
        ((startTick - tickInterval) / (startTick - minTick)) * 100,
      );
      drawHoloText(c, `LENGTH ${length}      SPEED ${speed}%`, 310, 156, {
        font: "22px sans-serif",
        color: HOLO.lavender,
        align: "center",
        letterSpacing: 2,
      });
    }
    this.hudTex.needsUpdate = true;
  }

  private drawTextButton(
    c: CanvasRenderingContext2D,
    label: string,
    accent: string,
  ) {
    c.clearRect(0, 0, 360, 100);
    drawHoloPanel(c, 14, 14, 332, 72, {
      accent,
      radius: 16,
      glow: 0.9,
      brackets: false,
    });
    drawHoloText(c, label, 180, 62, {
      font: "bold 36px sans-serif",
      color: HOLO.text,
      glow: 0.45,
      align: "center",
      letterSpacing: 2,
    });
  }

  private buildActionButton(x: number, y: number, z: number): Entity {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 100;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(
      new PlaneGeometry(0.29, 0.08),
      new MeshBasicMaterial({ map: tex, transparent: true }),
    );
    mesh.position.set(x, y, z);
    const e = this.world.createTransformEntity(mesh, this.controlsEntity);
    e.addComponent(RayInteractable);
    e.addComponent(PokeInteractable);
    return e;
  }

  private drawActionButton(label: string) {
    const accent = label === "RESTART" ? HOLO.amber : HOLO.green;
    this.drawTextButton(this.actionCtx, label, accent);
    this.actionTex.needsUpdate = true;
  }

  private makeHudBoardMoveArrow(
    code: "up" | "down" | "left" | "right",
    x: number,
    y: number,
    z: number,
    dx: number,
    dz: number,
  ): HudArrow {
    const e = this.makeButton(
      this.controlsEntity,
      0.062,
      0.062,
      128,
      128,
      x,
      y,
      z,
      (c) => this.drawArrowButton(c, code, HOLO.green),
    );
    return { e, dx, dz, prev: false };
  }

  private drawArrowButton(
    c: CanvasRenderingContext2D,
    code: "up" | "down" | "left" | "right",
    accent: string,
  ) {
    c.clearRect(0, 0, 128, 128);
    drawHoloPanel(c, 8, 8, 112, 112, {
      accent,
      radius: 16,
      glow: 0.8,
      brackets: false,
    });
    c.save();
    c.fillStyle = accent;
    c.shadowColor = accent;
    c.shadowBlur = 14;
    c.beginPath();
    if (code === "up") {
      c.moveTo(64, 32);
      c.lineTo(98, 92);
      c.lineTo(30, 92);
    } else if (code === "down") {
      c.moveTo(30, 36);
      c.lineTo(98, 36);
      c.lineTo(64, 96);
    } else if (code === "left") {
      c.moveTo(36, 64);
      c.lineTo(96, 32);
      c.lineTo(96, 96);
    } else {
      c.moveTo(92, 64);
      c.lineTo(32, 32);
      c.lineTo(32, 96);
    }
    c.closePath();
    c.fill();
    c.restore();
  }

  private makeButton(
    parent: Entity,
    w: number,
    h: number,
    cw: number,
    ch: number,
    x: number,
    y: number,
    z: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ): Entity {
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    draw(ctx);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ map: tex, transparent: true }),
    );
    mesh.position.set(x, y, z);
    const e = this.world.createTransformEntity(mesh, parent);
    e.addComponent(RayInteractable);
    e.addComponent(PokeInteractable);
    return e;
  }
}
