import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  createComponent,
  createSystem,
  DoubleSide,
  Entity,
  ExtrudeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  Shape,
  Types,
  Vector3,
  World,
} from "@iwsdk/core";

import { TILE } from "./snake-constants.js";

/**
 * Silver shield power-up. Ported from
 * `/Users/bogle/Dev/VR/snakeVR/mocks/code/serpent_grid_sheild_powerup_threejs_preview.html`.
 * Only the central emblem is kept (no card panel/frames/hex pattern), scaled
 * to TILE so it fits a single board cell. Per VR-perf rules: no PointLight
 * and no MeshPhysicalMaterial.clearcoat — the silver look comes from a
 * high-metalness MeshStandardMaterial plus an additive halo + outline lines.
 */

export const ShieldPowerup = createComponent("ShieldPowerup", {
  cellX: { type: Types.Int16, default: 0 },
  cellZ: { type: Types.Int16, default: 0 },
  age: { type: Types.Float32, default: 0 },
  maxAge: { type: Types.Float32, default: 10.0 },
});

export interface ShieldPowerupRefs {
  group: Group;
  halo: Mesh;
  shield: Mesh;
}

// Pulse lies flat on the board (board surface is XZ, +Y is up).
const FORWARD = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const flatQuat = new Quaternion();
flatQuat.setFromUnitVectors(FORWARD, UP);

// Shield silhouette in unit-scale; scaled by `s` at construction.
function createShieldShape(s: number): Shape {
  const shape = new Shape();
  shape.moveTo(0, 0.58 * s);
  shape.bezierCurveTo(0.36 * s, 0.38 * s, 0.5 * s, 0.36 * s, 0.52 * s, 0.32 * s);
  shape.bezierCurveTo(0.5 * s, -0.2 * s, 0.32 * s, -0.45 * s, 0, -0.66 * s);
  shape.bezierCurveTo(-0.32 * s, -0.45 * s, -0.5 * s, -0.2 * s, -0.52 * s, 0.32 * s);
  shape.bezierCurveTo(-0.5 * s, 0.36 * s, -0.36 * s, 0.38 * s, 0, 0.58 * s);
  return shape;
}

function buildShieldEmblem(): ShieldPowerupRefs {
  const group = new Group();
  group.name = "ShieldPowerup";
  group.quaternion.copy(flatQuat);

  // Halo aura — soft additive disc behind the shield.
  const halo = new Mesh(
    new CircleGeometry(TILE * 0.55, 64),
    new MeshBasicMaterial({
      color: 0xb8c8d8,
      transparent: true,
      opacity: 0.045,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.name = "ShieldHalo";
  halo.position.z = -TILE * 0.01;
  group.add(halo);

  // Thin HUD-style ring around the emblem.
  const ring = new Mesh(
    new RingGeometry(TILE * 0.44, TILE * 0.45, 64),
    new MeshBasicMaterial({
      color: 0x9fb5c8,
      transparent: true,
      opacity: 0.18,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  ring.name = "ShieldRing";
  group.add(ring);

  // Silver shield body — extruded shape with bevels.
  const shieldShape = createShieldShape(TILE * 0.5);
  const shieldGeometry = new ExtrudeGeometry(shieldShape, {
    depth: TILE * 0.08,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: TILE * 0.025,
    bevelThickness: TILE * 0.025,
  });
  shieldGeometry.center();
  const shield = new Mesh(
    shieldGeometry,
    new MeshStandardMaterial({
      color: 0xd9dee5,
      emissive: 0x6f7f8f,
      emissiveIntensity: 0.18,
      roughness: 0.24,
      metalness: 0.86,
      transparent: true,
      opacity: 0.98,
    }),
  );
  shield.name = "ShieldBody";
  shield.position.z = TILE * 0.05;
  group.add(shield);

  // Soft outline tracing the shield contour.
  const outlinePoints = shieldShape
    .getPoints(64)
    .map((p) => new Vector3(p.x, p.y, TILE * 0.1));
  const outline = new LineLoop(
    new BufferGeometry().setFromPoints(outlinePoints),
    new LineBasicMaterial({
      color: 0xcfd6df,
      transparent: true,
      opacity: 0.48,
      blending: AdditiveBlending,
    }),
  );
  outline.name = "ShieldOutline";
  group.add(outline);

  // Inner cross dividers.
  const vertical = new Line(
    new BufferGeometry().setFromPoints([
      new Vector3(0, TILE * 0.4, TILE * 0.11),
      new Vector3(0, -TILE * 0.46, TILE * 0.11),
    ]),
    new LineBasicMaterial({
      color: 0xf4f7fa,
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
    }),
  );
  vertical.name = "ShieldVerticalDivider";
  group.add(vertical);

  const horizontal = new Line(
    new BufferGeometry().setFromPoints([
      new Vector3(-TILE * 0.28, 0, TILE * 0.11),
      new Vector3(TILE * 0.28, 0, TILE * 0.11),
    ]),
    new LineBasicMaterial({
      color: 0xf4f7fa,
      transparent: true,
      opacity: 0.18,
      blending: AdditiveBlending,
    }),
  );
  horizontal.name = "ShieldHorizontalDivider";
  group.add(horizontal);

  // 8 perimeter tick marks.
  const tickMat = new MeshBasicMaterial({
    color: 0xb7c7d6,
    transparent: true,
    opacity: 0.22,
    blending: AdditiveBlending,
  });
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    const long = i % 2 === 0;
    const tick = new Mesh(
      new BoxGeometry(TILE * 0.012, long ? TILE * 0.1 : TILE * 0.055, TILE * 0.01),
      tickMat,
    );
    tick.position.set(Math.cos(a) * TILE * 0.5, Math.sin(a) * TILE * 0.5, TILE * 0.03);
    tick.rotation.z = a;
    group.add(tick);
  }

  return { group, halo, shield };
}

export function spawnShieldPowerup(
  world: World,
  parent: Entity,
  cell: { x: number; z: number },
  worldPos: Vector3,
  maxAge: number,
): Entity {
  const refs = buildShieldEmblem();
  refs.group.position.copy(worldPos);
  const entity = world.createTransformEntity(refs.group, parent);
  entity.addComponent(ShieldPowerup, {
    cellX: cell.x,
    cellZ: cell.z,
    age: 0,
    maxAge,
  });
  return entity;
}

export function disposeShieldPowerup(refs: ShieldPowerupRefs): void {
  refs.group.traverse((obj) => {
    const mesh = obj as Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material as
      | MeshBasicMaterial
      | MeshStandardMaterial
      | LineBasicMaterial
      | Array<MeshBasicMaterial | MeshStandardMaterial | LineBasicMaterial>
      | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose?.();
  });
}

export class ShieldPowerupSystem extends createSystem({
  shields: { required: [ShieldPowerup] },
}) {
  init() {
    this.cleanupFuncs.push(() => {
      for (const entity of this.queries.shields.entities) {
        if (entity.active) entity.dispose();
      }
    });
  }

  update(delta: number) {
    for (const entity of this.queries.shields.entities) {
      const age = (entity.getValue(ShieldPowerup, "age") as number) + delta;
      const maxAge = entity.getValue(ShieldPowerup, "maxAge") as number;
      if (age >= maxAge) {
        entity.dispose();
        continue;
      }
      entity.setValue(ShieldPowerup, "age", age);

      const group = entity.object3D as Group | null;
      if (!group) continue;

      // Slow rotation + gentle bob + halo breath.
      group.rotation.y += delta * 0.8;

      const halo = group.getObjectByName("ShieldHalo") as Mesh | null;
      if (halo) {
        (halo.material as MeshBasicMaterial).opacity =
          0.045 * (1 + 0.4 * Math.sin(age * 3.5));
      }
    }
  }
}
