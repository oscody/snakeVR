import {
  BoxGeometry,
  createComponent,
  createSystem,
  Entity,
  Mesh,
  MeshStandardMaterial,
  Types,
  Vector3,
  World,
} from "@iwsdk/core";

import { TILE } from "./snake-constants.js";

/**
 * Hazard block: appears periodically on the board for a few seconds, shrinks
 * the snake if the head runs into it. Self-contained module — the entity owns
 * its lifetime via the `age`/`maxAge` fields, and `CorruptionBlockSystem`
 * advances both the age and the visual pulse every frame. The game system
 * spawns blocks and tests collision against `cellX/cellZ`; everything else
 * (visuals, disposal) lives here.
 *
 * Pattern mirrors `eat-pulse-system.ts`.
 */

export const CorruptionBlock = createComponent("CorruptionBlock", {
  cellX: { type: Types.Int16, default: 0 },
  cellZ: { type: Types.Int16, default: 0 },
  age: { type: Types.Float32, default: 0 },
  maxAge: { type: Types.Float32, default: 5.0 },
});

export function spawnCorruptionBlock(
  world: World,
  parent: Entity,
  cell: { x: number; z: number },
  worldPos: Vector3,
  maxAge: number,
): Entity {
  const geometry = new BoxGeometry(TILE * 0.82, TILE * 0.82, TILE * 0.82);
  const material = new MeshStandardMaterial({
    color: 0x3a0a0a,
    emissive: 0xff2a2a,
    emissiveIntensity: 1.4,
    roughness: 0.4,
    metalness: 0.1,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.copy(worldPos);
  const entity = world.createTransformEntity(mesh, parent);
  entity.addComponent(CorruptionBlock, {
    cellX: cell.x,
    cellZ: cell.z,
    age: 0,
    maxAge,
  });
  return entity;
}

export class CorruptionBlockSystem extends createSystem({
  blocks: { required: [CorruptionBlock] },
}) {
  init() {
    this.cleanupFuncs.push(() => {
      for (const entity of this.queries.blocks.entities) {
        if (entity.active) entity.dispose();
      }
    });
  }

  update(delta: number) {
    for (const entity of this.queries.blocks.entities) {
      const age = (entity.getValue(CorruptionBlock, "age") as number) + delta;
      const maxAge = entity.getValue(CorruptionBlock, "maxAge") as number;
      if (age >= maxAge) {
        entity.dispose();
        continue;
      }
      entity.setValue(CorruptionBlock, "age", age);

      const mesh = entity.object3D as Mesh | null;
      if (!mesh) continue;

      // Steady neon pulse, then a brighter flicker during the last 30% of life
      // so the player can see the block is about to vanish.
      const t = age / maxAge;
      const pulse = 1 + 0.25 * Math.sin(age * 8);
      const warnRamp = t > 0.7 ? 1 + 3.5 * ((t - 0.7) / 0.3) : 1;
      const flicker =
        t > 0.7 ? 1 + 0.35 * Math.sin(age * 28) : 1;
      const material = mesh.material as MeshStandardMaterial;
      material.emissiveIntensity = 1.2 * pulse * warnRamp * flicker;
      mesh.scale.setScalar(
        1 + 0.05 * Math.sin(age * 10) + (t > 0.7 ? 0.12 * ((t - 0.7) / 0.3) : 0),
      );
    }
  }
}
