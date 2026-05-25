import {
  BoxGeometry,
  BufferGeometry,
  createComponent,
  createSystem,
  EdgesGeometry,
  Entity,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Types,
  Vector3,
  World,
} from "@iwsdk/core";

import { TILE } from "./snake-constants.js";

/**
 * Lava-block hazard: a black obsidian cube veined with glowing red cracks
 * and a few molten "lava nodes" at its corners, wrapped in a faint cyan rim
 * outline. Self-contained module — the entity owns its lifetime via the
 * `age`/`maxAge` fields, and `CorruptionBlockSystem` advances both the age
 * and the per-frame pulse/flicker animation. The game system spawns blocks
 * and tests collision against `cellX/cellZ`; everything visual lives here.
 *
 * VR-perf notes:
 *   - No PointLights (the HTML preview adds 5 per block; with 2 blocks per
 *     orb that's 10 dynamic lights — recompilation territory). Brightness
 *     comes from emissive materials and unlit `MeshBasicMaterial` nodes.
 *   - 6 crack paths (preview has 9). Each rendered as a sharp red core line
 *     plus a slightly enlarged orange "glow" line — cheap two-pass bloom.
 *   - 4 lava nodes (preview has 5). Small `MeshBasicMaterial` spheres.
 */

export const CorruptionBlock = createComponent("CorruptionBlock", {
  cellX: { type: Types.Int16, default: 0 },
  cellZ: { type: Types.Int16, default: 0 },
  age: { type: Types.Float32, default: 0 },
  maxAge: { type: Types.Float32, default: 5.0 },
});

const CUBE_SIZE = TILE * 0.82;
const HALF = CUBE_SIZE / 2;
const SURFACE = HALF + 0.0008; // tiny outward offset so cracks don't z-fight the cube

// Crack paths in block-local space. Coordinates use HALF/SURFACE so cracks
// sit just above each face. Six picked from the HTML preview's nine — kept
// the ones with the most varied silhouette so each face has at least one
// visible crack from typical viewing angles.
function buildCrackPaths(): Array<Array<[number, number, number]>> {
  const f = HALF;       // face-aligned axis offset
  const s = SURFACE;    // face surface (just outside)
  return [
    // Front face (+Z): two strong cracks.
    [[-f * 0.83, f * 0.61, s], [-f * 0.33, f * 0.28, s], [f * 0.06, f * 0.53, s], [f * 0.83, f * 0.17, s]],
    [[-f * 0.94, -f * 0.14, s], [-f * 0.44, -f * 0.39, s], [f * 0.17, -f * 0.11, s], [f * 0.92, -f * 0.5, s]],
    // Right face (+X): two cracks.
    [[s, f * 0.86, f * 0.75], [s, f * 0.28, f * 0.33], [s, f * 0.5, -f * 0.17], [s, -f * 0.17, -f * 0.86]],
    [[s, -f * 0.78, f * 0.86], [s, -f * 0.28, f * 0.17], [s, -f * 0.61, -f * 0.56]],
    // Top face (+Y): one crack.
    [[-f * 0.86, s, f * 0.44], [-f * 0.31, s, f * 0.06], [f * 0.22, s, f * 0.5], [f * 0.86, s, f * 0.06]],
    // Left face (-X): one crack.
    [[-s, f * 0.69, f * 0.56], [-s, f * 0.14, f * 0.17], [-s, -f * 0.28, f * 0.64]],
  ];
}

function makeCrackLine(
  path: Array<[number, number, number]>,
  material: LineBasicMaterial,
): Line {
  const points = path.map((p) => new Vector3(p[0], p[1], p[2]));
  return new Line(new BufferGeometry().setFromPoints(points), material);
}

interface CorruptionVisualRefs {
  group: Group;
  cube: Mesh;
  nodes: Mesh[];
}

function buildCorruptionVisual(): CorruptionVisualRefs {
  const group = new Group();
  group.name = "CorruptionBlockVisual";

  // Obsidian stone cube.
  const boxGeo = new BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, 4, 4, 4);
  const cube = new Mesh(
    boxGeo,
    new MeshStandardMaterial({
      color: 0x08090b,
      roughness: 0.92,
      metalness: 0.08,
      emissive: 0x160000,
      emissiveIntensity: 0.35,
    }),
  );
  cube.name = "ObsidianStoneMesh";
  group.add(cube);

  // Cool cyan rim outline — sits just outside the cube faces.
  const rim = new LineSegments(
    new EdgesGeometry(boxGeo),
    new LineBasicMaterial({
      color: 0x25eaff,
      transparent: true,
      opacity: 0.18,
    }),
  );
  rim.name = "CorruptionCoolRim";
  rim.scale.setScalar(1.006);
  group.add(rim);

  // Emissive crack network — hot red core + orange glow halo per path.
  const hotMat = new LineBasicMaterial({
    color: 0xff2600,
    transparent: true,
    opacity: 1.0,
  });
  const glowMat = new LineBasicMaterial({
    color: 0xff7b00,
    transparent: true,
    opacity: 0.42,
  });

  const crackGroup = new Group();
  crackGroup.name = "EmissiveCrackNetwork";
  for (const path of buildCrackPaths()) {
    const hot = makeCrackLine(path, hotMat);
    crackGroup.add(hot);
    const glow = makeCrackLine(path, glowMat);
    glow.scale.setScalar(1.02);
    crackGroup.add(glow);
  }
  group.add(crackGroup);

  // Lava glow nodes — small additive-feeling pale-amber spheres at corner-ish
  // positions on the cube's faces. No PointLights (see file header).
  const nodeGeo = new SphereGeometry(CUBE_SIZE * 0.05, 14, 12);
  const nodeMat = new MeshBasicMaterial({ color: 0xffe0a0 });
  const nodePositions: Array<[number, number, number]> = [
    [HALF, HALF, HALF],
    [-HALF, HALF * 0.5, HALF],
    [HALF, -HALF * 0.45, HALF],
    [HALF, HALF * 0.5, -HALF],
  ];
  const nodes: Mesh[] = [];
  for (const [x, y, z] of nodePositions) {
    const node = new Mesh(nodeGeo, nodeMat);
    node.position.set(x, y, z);
    nodes.push(node);
    group.add(node);
  }

  return { group, cube, nodes };
}

export function spawnCorruptionBlock(
  world: World,
  parent: Entity,
  cell: { x: number; z: number },
  worldPos: Vector3,
  maxAge: number,
): Entity {
  const visual = buildCorruptionVisual();
  visual.group.position.copy(worldPos);
  const entity = world.createTransformEntity(visual.group, parent);
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

      const group = entity.object3D as Group | null;
      if (!group) continue;

      const t = age / maxAge;
      const pulse = 1 + 0.25 * Math.sin(age * 8);
      const dying = t > 0.7;
      const warnRamp = dying ? 1 + 3.5 * ((t - 0.7) / 0.3) : 1;
      const flicker = dying ? 1 + 0.35 * Math.sin(age * 28) : 1;

      // Drive the obsidian cube's emissive — the main breathing signal.
      const cube = group.getObjectByName("ObsidianStoneMesh") as Mesh | null;
      if (cube) {
        (cube.material as MeshStandardMaterial).emissiveIntensity =
          0.35 * pulse * warnRamp * flicker;
      }

      // Lava nodes brighten on the same beat (they share a material, so we
      // only need to touch one and every node updates with it).
      const sharedNodeMat = this.findNodeMaterial(group);
      if (sharedNodeMat) {
        // MeshBasicMaterial has no emissive, but `color` modulates apparent
        // brightness. Map pulse/warn onto a 0.7..1.4 multiplier on a base
        // pale-amber; clamp via opacity to keep it from exploding.
        sharedNodeMat.opacity = Math.min(1, 0.85 * pulse * warnRamp * flicker);
        if (!sharedNodeMat.transparent) sharedNodeMat.transparent = true;
      }

      // Whole-group scale breath.
      group.scale.setScalar(
        1 + 0.05 * Math.sin(age * 10) + (dying ? 0.12 * ((t - 0.7) / 0.3) : 0),
      );
    }
  }

  /**
   * Lava nodes share a single MeshBasicMaterial instance from the builder,
   * so finding any one node and reading its `material` gives us the shared
   * handle for free.
   */
  private findNodeMaterial(group: Group): MeshBasicMaterial | null {
    for (const child of group.children) {
      if (
        (child as Mesh).isMesh &&
        child.name !== "ObsidianStoneMesh" &&
        (child as Mesh).geometry?.type === "SphereGeometry"
      ) {
        return (child as Mesh).material as MeshBasicMaterial;
      }
    }
    return null;
  }
}
