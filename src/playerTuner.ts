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
  Vector3,
} from "@iwsdk/core";
import { snakeLayoutState } from "./layoutState.js";

/**
 * PlayerTunerSystem — a dev overlay for dialing in the player's height.
 *
 * Two pressable in-world buttons — RAISE and LOWER — move the whole XR rig
 * (`world.player`) up and down while held. Press them with a controller ray
 * or finger poke in VR, or the mouse in the browser. A panel shows the live
 * player position and true eye height so you can watch the numbers while you
 * judge what vantage looks good.
 *
 * The cluster is head-locked (parented to `playerHeadEntity`) so it stays in
 * the lower-left of the view everywhere — the launcher and both games.
 *
 * Always-on: registered once in index.ts. Delete that `registerSystem` line
 * (and this file) once the player position is dialed in.
 */

const MOVE_SPEED = 0.6; // metres per second while a button is held

export class PlayerTunerSystem extends createSystem({}) {
  private ctx!: CanvasRenderingContext2D;
  private tex!: CanvasTexture;
  private raiseBtn!: Entity;
  private lowerBtn!: Entity;
  private resetBtn!: Entity;
  private resetWasPressed = false;
  private readonly defaultPlayerPos = new Vector3();
  private readonly eyeWorld = new Vector3();
  private lastKey = "";

  init() {
    this.defaultPlayerPos.copy(this.world.player.position);

    // Head-locked cluster, lower-left of the view.
    const group = new Group();
    group.position.set(-0.27, -0.1, -0.7);
    const groupEntity = this.world.createTransformEntity(
      group,
      this.playerHeadEntity,
    );

    // Live coordinate readout (display only).
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 236;
    this.ctx = canvas.getContext("2d")!;
    this.tex = new CanvasTexture(canvas);
    this.tex.colorSpace = SRGBColorSpace;
    const panel = new Mesh(
      new PlaneGeometry(0.3, 0.148),
      this.hudMaterial(this.tex),
    );
    panel.position.set(0, 0.107, 0);
    panel.renderOrder = 999;
    group.add(panel);

    // RAISE / LOWER buttons.
    this.raiseBtn = this.makeButton(groupEntity, "RAISE", "up", -0.082);
    this.resetBtn = this.makeButton(groupEntity, "RESET", "reset", 0, true);
    this.lowerBtn = this.makeButton(groupEntity, "LOWER", "down", 0.082);

    this.draw();
    console.log(
      "[Player Tuner] Press & hold the RAISE / LOWER buttons to move the player.",
    );
  }

  update(delta: number) {
    const player = this.world.player;
    if (this.raiseBtn.hasComponent(Pressed)) {
      player.position.y += MOVE_SPEED * delta;
    }
    if (this.lowerBtn.hasComponent(Pressed)) {
      player.position.y -= MOVE_SPEED * delta;
    }
    const resetPressed = this.resetBtn.hasComponent(Pressed);
    if (resetPressed && !this.resetWasPressed) {
      player.position.copy(this.defaultPlayerPos);
    }
    this.resetWasPressed = resetPressed;

    // Hover / press feedback.
    for (const b of [this.raiseBtn, this.resetBtn, this.lowerBtn]) {
      const scale = b.hasComponent(Pressed)
        ? 0.94
        : b.hasComponent(Hovered)
          ? 1.06
          : 1;
      b.object3D?.scale.setScalar(scale);
    }
    this.draw();
  }

  private hudMaterial(tex: CanvasTexture): MeshBasicMaterial {
    return new MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthTest: false, // always draw over the scene
      depthWrite: false,
    });
  }

  /** Build one RAISE / LOWER button as a pressable (ray + poke) entity. */
  private makeButton(
    parent: Entity,
    label: string,
    dir: "up" | "down" | "reset",
    localX: number,
    small = false,
  ): Entity {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 150;
    const c = canvas.getContext("2d")!;
    const accent =
      dir === "up" ? "#4caf6a" : dir === "down" ? "#d6804a" : "#5fe0d0";
    c.fillStyle = "rgba(16,22,30,0.97)";
    c.fillRect(0, 0, 240, 150);
    c.fillStyle = accent;
    c.fillRect(0, 0, 240, 6);
    c.beginPath();
    if (dir === "up") {
      c.moveTo(120, 30);
      c.lineTo(152, 74);
      c.lineTo(88, 74);
    } else {
      c.moveTo(88, 40);
      c.lineTo(152, 40);
      c.lineTo(120, 84);
    }
    if (dir !== "reset") {
      c.closePath();
      c.fill();
    }
    c.textAlign = "center";
    c.fillStyle = "#f5f7ff";
    c.font = small ? "bold 28px sans-serif" : "bold 34px sans-serif";
    c.fillText(label, 120, small ? 92 : 124);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;

    const mesh = new Mesh(
      new PlaneGeometry(small ? 0.102 : 0.135, small ? 0.062 : 0.084),
      this.hudMaterial(tex),
    );
    mesh.position.set(localX, small ? -0.064 : -0.07, 0.002);
    mesh.renderOrder = 999;
    const e = this.world.createTransformEntity(mesh, parent);
    e.addComponent(RayInteractable);
    e.addComponent(PokeInteractable);
    return e;
  }

  /** Repaint the readout — skips work when the numbers are unchanged. */
  private draw() {
    const p = this.world.player.position;
    this.world.camera.getWorldPosition(this.eyeWorld);
    const key =
      `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},` +
      this.eyeWorld.y.toFixed(2) +
      `,${snakeLayoutState.board?.x?.toFixed(2) ?? "na"},` +
      `${snakeLayoutState.board?.y?.toFixed(2) ?? "na"},` +
      `${snakeLayoutState.board?.z?.toFixed(2) ?? "na"},` +
      `${snakeLayoutState.hud?.x?.toFixed(2) ?? "na"},` +
      `${snakeLayoutState.hud?.y?.toFixed(2) ?? "na"},` +
      `${snakeLayoutState.hud?.z?.toFixed(2) ?? "na"}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const c = this.ctx;
    c.clearRect(0, 0, 480, 236);
    c.fillStyle = "rgba(10,14,22,0.9)";
    c.fillRect(0, 0, 480, 236);
    c.fillStyle = "#5fe0d0";
    c.fillRect(0, 0, 480, 6);

    c.textAlign = "left";
    c.fillStyle = "#5fe0d0";
    c.font = "bold 26px sans-serif";
    c.fillText("PLAYER TUNER", 22, 42);

    c.fillStyle = "#f5f7ff";
    c.font = "bold 36px sans-serif";
    c.fillText(`Y height   ${p.y.toFixed(2)} m`, 22, 96);

    c.fillStyle = "#9aa4d4";
    c.font = "24px sans-serif";
    c.fillText(
      `X ${p.x.toFixed(2)}   Z ${p.z.toFixed(2)}   eye ${this.eyeWorld.y.toFixed(2)} m`,
      22,
      138,
    );

    const board = snakeLayoutState.board;
    const hud = snakeLayoutState.hud;
    c.fillStyle = "#8ef0a8";
    c.font = "bold 22px sans-serif";
    c.fillText("BOARD", 22, 174);
    c.fillStyle = "#f5f7ff";
    c.font = "20px sans-serif";
    c.fillText(
      board
        ? `X ${board.x.toFixed(2)}   Y ${board.y.toFixed(2)}   Z ${board.z.toFixed(2)}`
        : "Board coords unavailable",
      100,
      174,
    );

    c.fillStyle = "#78d8ff";
    c.font = "bold 22px sans-serif";
    c.fillText("HUD", 22, 210);
    c.fillStyle = "#f5f7ff";
    c.font = "20px sans-serif";
    c.fillText(
      hud
        ? `X ${hud.x.toFixed(2)}   Y ${hud.y.toFixed(2)}   Z ${hud.z.toFixed(2)}`
        : "HUD coords unavailable",
      100,
      210,
    );

    this.tex.needsUpdate = true;
  }
}
