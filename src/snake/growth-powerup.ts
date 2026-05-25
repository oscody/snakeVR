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
 * Neon-green stem-and-leaves growth power-up. Ported from
 * `/Users/bogle/Dev/VR/snakeVR/mocks/code/serpent_grid_growth_powerup_threejs_preview.html`.
 * Only the central emblem is kept (no card panel/frames/hex pattern), scaled
 * to TILE. Per VR-perf rules: no PointLight, no MeshPhysicalMaterial.clearcoat
 * — the wet leaf look is approximated with high-emissive MeshStandardMaterial.
 */

export const GrowthPowerup = createComponent("GrowthPowerup", {
  cellX: { type: Types.Int16, default: 0 },
  cellZ: { type: Types.Int16, default: 0 },
  age: { type: Types.Float32, default: 0 },
  maxAge: { type: Types.Float32, default: 10.0 },
});

export interface GrowthPowerupRefs {
  group: Group;
  aura: Mesh;
  outerRing: Mesh;
  innerRing: Mesh;
}

const FORWARD = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const flatQuat = new Quaternion();
flatQuat.setFromUnitVectors(FORWARD, UP);

function createLeafShape(s: number): Shape {
  const shape = new Shape();
  shape.moveTo(0, -0.22 * s);
  shape.bezierCurveTo(0.34 * s, -0.05 * s, 0.44 * s, 0.28 * s, 0.15 * s, 0.5 * s);
  shape.bezierCurveTo(-0.12 * s, 0.31 * s, -0.25 * s, 0.06 * s, 0, -0.22 * s);
  return shape;
}

function buildLeaf(
  scale: number,
  rotation: number,
  position: [number, number, number],
  color: number,
): Mesh {
  const shape = createLeafShape(scale);
  const geometry = new ExtrudeGeometry(shape, {
    depth: TILE * 0.04,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: TILE * 0.01,
    bevelThickness: TILE * 0.012,
  });
  geometry.center();
  const leaf = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color,
      emissive: 0x51ff22,
      emissiveIntensity: 0.85,
      roughness: 0.16,
      metalness: 0.08,
      transparent: true,
      opacity: 0.94,
    }),
  );
  leaf.position.set(position[0], position[1], position[2]);
  leaf.rotation.z = rotation;

  // Glowing outline tracing the leaf contour.
  const outlinePoints = shape
    .getPoints(64)
    .map((p) => new Vector3(p.x, p.y, TILE * 0.04));
  const outline = new LineLoop(
    new BufferGeometry().setFromPoints(outlinePoints),
    new LineBasicMaterial({
      color: 0xd9ffc8,
      transparent: true,
      opacity: 0.54,
      blending: AdditiveBlending,
    }),
  );
  leaf.add(outline);

  // Diagonal vein.
  const vein = new Line(
    new BufferGeometry().setFromPoints([
      new Vector3(-0.1 * scale, -0.16 * scale, TILE * 0.05),
      new Vector3(0.13 * scale, 0.32 * scale, TILE * 0.05),
    ]),
    new LineBasicMaterial({
      color: 0xeaffdd,
      transparent: true,
      opacity: 0.32,
      blending: AdditiveBlending,
    }),
  );
  leaf.add(vein);

  return leaf;
}

function buildGrowthEmblem(): GrowthPowerupRefs {
  const group = new Group();
  group.name = "GrowthPowerup";
  group.quaternion.copy(flatQuat);

  // Aura disc — green glow.
  const aura = new Mesh(
    new CircleGeometry(TILE * 0.6, 64),
    new MeshBasicMaterial({
      color: 0x66ff33,
      transparent: true,
      opacity: 0.12,
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  aura.name = "GrowthAura";
  aura.position.z = -TILE * 0.01;
  group.add(aura);

  // Outer + inner rings (additive).
  const ringMat = new MeshBasicMaterial({
    color: 0x8dff63,
    transparent: true,
    opacity: 0.72,
    side: DoubleSide,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const outerRing = new Mesh(
    new RingGeometry(TILE * 0.5, TILE * 0.53, 64),
    ringMat,
  );
  outerRing.name = "GrowthOuterRing";
  group.add(outerRing);

  const innerRingMat = ringMat.clone();
  innerRingMat.opacity = 0.42;
  const innerRing = new Mesh(
    new RingGeometry(TILE * 0.36, TILE * 0.38, 64),
    innerRingMat,
  );
  innerRing.name = "GrowthInnerRing";
  group.add(innerRing);

  // Stem — a thin emissive bar tilted slightly.
  const stem = new Mesh(
    new BoxGeometry(TILE * 0.045, TILE * 0.6, TILE * 0.04),
    new MeshStandardMaterial({
      color: 0x7dff55,
      emissive: 0x45dd22,
      emissiveIntensity: 0.7,
      roughness: 0.18,
      metalness: 0.06,
    }),
  );
  stem.name = "GrowthStem";
  stem.position.set(-TILE * 0.025, -TILE * 0.065, TILE * 0.065);
  stem.rotation.z = -0.34;
  group.add(stem);

  // Three leaves at varying scales/positions.
  group.add(
    buildLeaf(TILE * 0.55, -0.25, [TILE * 0.115, TILE * 0.1, TILE * 0.1], 0x8dff63),
  );
  group.add(
    buildLeaf(TILE * 0.38, -1.05, [-TILE * 0.165, -TILE * 0.04, TILE * 0.1], 0x73ec51),
  );
  group.add(
    buildLeaf(TILE * 0.42, -0.78, [TILE * 0.16, -TILE * 0.18, TILE * 0.1], 0x7cff58),
  );

  // 12 perimeter tick marks (pale mint).
  const tickMat = new MeshBasicMaterial({
    color: 0xcfffba,
    transparent: true,
    opacity: 0.48,
    blending: AdditiveBlending,
  });
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    const long = i % 3 === 0;
    const tick = new Mesh(
      new BoxGeometry(TILE * 0.012, long ? TILE * 0.1 : TILE * 0.055, TILE * 0.01),
      tickMat,
    );
    tick.position.set(Math.cos(a) * TILE * 0.44, Math.sin(a) * TILE * 0.44, TILE * 0.03);
    tick.rotation.z = a;
    group.add(tick);
  }

  return { group, aura, outerRing, innerRing };
}

export function spawnGrowthPowerup(
  world: World,
  parent: Entity,
  cell: { x: number; z: number },
  worldPos: Vector3,
  maxAge: number,
): Entity {
  const refs = buildGrowthEmblem();
  refs.group.position.copy(worldPos);
  const entity = world.createTransformEntity(refs.group, parent);
  entity.addComponent(GrowthPowerup, {
    cellX: cell.x,
    cellZ: cell.z,
    age: 0,
    maxAge,
  });
  return entity;
}

export function disposeGrowthPowerup(refs: GrowthPowerupRefs): void {
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

export class GrowthPowerupSystem extends createSystem({
  growths: { required: [GrowthPowerup] },
}) {
  init() {
    this.cleanupFuncs.push(() => {
      for (const entity of this.queries.growths.entities) {
        if (entity.active) entity.dispose();
      }
    });
  }

  update(delta: number) {
    for (const entity of this.queries.growths.entities) {
      const age = (entity.getValue(GrowthPowerup, "age") as number) + delta;
      const maxAge = entity.getValue(GrowthPowerup, "maxAge") as number;
      if (age >= maxAge) {
        entity.dispose();
        continue;
      }
      entity.setValue(GrowthPowerup, "age", age);

      const group = entity.object3D as Group | null;
      if (!group) continue;

      const outerRing = group.getObjectByName("GrowthOuterRing") as Mesh | null;
      const innerRing = group.getObjectByName("GrowthInnerRing") as Mesh | null;
      const aura = group.getObjectByName("GrowthAura") as Mesh | null;

      if (outerRing) outerRing.rotation.z += delta * 0.6;
      if (innerRing) innerRing.rotation.z -= delta * 0.9;
      // Slow Y-spin so the leaves twist visibly without taking the rings off-axis.
      group.rotation.y += delta * 0.3;
      if (aura) {
        (aura.material as MeshBasicMaterial).opacity =
          0.12 + 0.04 * Math.sin(age * 3.5);
      }
    }
  }
}
