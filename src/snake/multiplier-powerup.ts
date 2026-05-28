import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  createComponent,
  createSystem,
  DoubleSide,
  Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Types,
  Vector3,
  World,
} from "@iwsdk/core";

import { TILE } from "./snake-constants.js";

/**
 * Neon-purple "2x" multiplier power-up. Ported from
 * `/Users/bogle/Dev/VR/snakeVR/mocks/code/serpent_grid_multiplier_powerup_threejs_preview.html`.
 * Only the central emblem is kept (no card panel/frames/hex pattern). Per
 * VR-perf rules: no PointLight, no MeshPhysicalMaterial. The glow is built
 * from additive ring/aura/tick layers plus a glowing canvas-text sprite.
 */

export const MultiplierPowerup = createComponent("MultiplierPowerup", {
  cellX: { type: Types.Int16, default: 0 },
  cellZ: { type: Types.Int16, default: 0 },
  age: { type: Types.Float32, default: 0 },
  maxAge: { type: Types.Float32, default: 10.0 },
});

export interface MultiplierPowerupRefs {
  group: Group;
  aura: Mesh;
  outerRing: Mesh;
  innerRing: Mesh;
  tickGroup: Group;
  label: Sprite;
}

const FORWARD = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const flatQuat = new Quaternion();
flatQuat.setFromUnitVectors(FORWARD, UP);

function makeMultiplierLabelTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "700 200px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(244,80,255,0.95)";
  ctx.shadowBlur = 36;
  ctx.fillStyle = "#ffc8ff";
  ctx.fillText("2x", canvas.width / 2, canvas.height / 2 + 6);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function buildMultiplierEmblem(): MultiplierPowerupRefs {
  const group = new Group();
  group.name = "MultiplierPowerup";
  group.quaternion.copy(flatQuat);

  // Aura disc — soft purple glow behind everything.
  const aura = new Mesh(
    new CircleGeometry(TILE * 0.6, 64),
    new MeshBasicMaterial({
      color: 0xc03cff,
      transparent: true,
      opacity: 0.13,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  aura.name = "MultiplierAura";
  aura.position.z = -TILE * 0.01;
  group.add(aura);

  // Outer + inner rings (additive, contra-rotating).
  const ringMat = new MeshBasicMaterial({
    color: 0xe95cff,
    transparent: true,
    opacity: 0.78,
    side: DoubleSide,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const outerRing = new Mesh(
    new RingGeometry(TILE * 0.5, TILE * 0.53, 64),
    ringMat,
  );
  outerRing.name = "MultiplierOuterRing";
  group.add(outerRing);

  const innerRingMat = ringMat.clone();
  innerRingMat.opacity = 0.56;
  const innerRing = new Mesh(
    new RingGeometry(TILE * 0.36, TILE * 0.38, 64),
    innerRingMat,
  );
  innerRing.name = "MultiplierInnerRing";
  group.add(innerRing);

  // 12 tick marks around the perimeter — grouped so they can spin slowly.
  const tickGroup = new Group();
  tickGroup.name = "MultiplierTicks";
  const tickMat = new MeshBasicMaterial({
    color: 0xffc4ff,
    transparent: true,
    opacity: 0.68,
    blending: AdditiveBlending,
  });
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    const long = i % 3 === 0;
    const tick = new Mesh(
      new BoxGeometry(TILE * 0.015, long ? TILE * 0.11 : TILE * 0.06, TILE * 0.01),
      tickMat,
    );
    tick.name = `MultiplierTick-${i}`;
    tick.position.set(Math.cos(a) * TILE * 0.44, Math.sin(a) * TILE * 0.44, TILE * 0.02);
    tick.rotation.z = a;
    tickGroup.add(tick);
  }
  group.add(tickGroup);

  // "2x" label sprite. Sized so width ≈ 0.7 × TILE.
  const labelMat = new SpriteMaterial({
    map: makeMultiplierLabelTexture(),
    transparent: true,
    depthWrite: false,
  });
  const label = new Sprite(labelMat);
  label.name = "Multiplier2xLabel";
  // Canvas is 512×256 → 2:1 aspect; scale so the visible "2x" fits TILE * 0.7.
  label.scale.set(TILE * 0.7, TILE * 0.35, 1);
  label.position.set(0, 0, TILE * 0.04);
  group.add(label);

  return { group, aura, outerRing, innerRing, tickGroup, label };
}

export function spawnMultiplierPowerup(
  world: World,
  parent: Entity,
  cell: { x: number; z: number },
  worldPos: Vector3,
  maxAge: number,
): Entity {
  const refs = buildMultiplierEmblem();
  refs.group.name = `MultiplierPowerupCell-${cell.x}-${cell.z}`;
  refs.group.position.copy(worldPos);
  const entity = world.createTransformEntity(refs.group, parent);
  entity.addComponent(MultiplierPowerup, {
    cellX: cell.x,
    cellZ: cell.z,
    age: 0,
    maxAge,
  });
  return entity;
}

export function disposeMultiplierPowerup(refs: MultiplierPowerupRefs): void {
  refs.group.traverse((obj) => {
    const mesh = obj as Mesh | Sprite;
    (mesh as Mesh).geometry?.dispose?.();
    const mat = (mesh as Mesh).material as
      | MeshBasicMaterial
      | SpriteMaterial
      | Array<MeshBasicMaterial | SpriteMaterial>
      | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose?.();
  });
}

export class MultiplierPowerupSystem extends createSystem({
  multipliers: { required: [MultiplierPowerup] },
}) {
  init() {
    this.cleanupFuncs.push(() => {
      for (const entity of this.queries.multipliers.entities) {
        if (entity.active) entity.dispose();
      }
    });
  }

  update(delta: number) {
    for (const entity of this.queries.multipliers.entities) {
      const age = (entity.getValue(MultiplierPowerup, "age") as number) + delta;
      const maxAge = entity.getValue(MultiplierPowerup, "maxAge") as number;
      if (age >= maxAge) {
        entity.dispose();
        continue;
      }
      entity.setValue(MultiplierPowerup, "age", age);

      const group = entity.object3D as Group | null;
      if (!group) continue;

      const outerRing = group.getObjectByName("MultiplierOuterRing") as Mesh | null;
      const innerRing = group.getObjectByName("MultiplierInnerRing") as Mesh | null;
      const tickGroup = group.getObjectByName("MultiplierTicks") as Group | null;
      const aura = group.getObjectByName("MultiplierAura") as Mesh | null;
      const label = group.getObjectByName("Multiplier2xLabel") as Sprite | null;

      if (outerRing) outerRing.rotation.z += delta * 0.6;
      if (innerRing) innerRing.rotation.z -= delta * 0.9;
      if (tickGroup) tickGroup.rotation.z += delta * 0.2;
      if (aura) {
        (aura.material as MeshBasicMaterial).opacity =
          0.13 + 0.05 * Math.sin(age * 4);
      }
      if (label) {
        const s = TILE * 0.7 * (1 + 0.06 * Math.sin(age * 4));
        label.scale.set(s, s * 0.5, 1);
      }
    }
  }
}
