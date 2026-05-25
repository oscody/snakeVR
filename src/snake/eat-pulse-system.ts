import {
  AdditiveBlending,
  Color,
  createComponent,
  createSystem,
  DoubleSide,
  Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Types,
  Vector3,
  World,
} from "@iwsdk/core";

/**
 * Eat-pulse: the burst-when-eaten effect. Spawned by the game system at the
 * orb's last cell whenever the snake's head lands on the orb. Three layers
 * fade out in sync over `maxAge`, restyled to match the new green energy orb:
 *
 *   1. Bright inner flash sphere — pale-green core, additive.
 *   2. Expanding bright ring — original shader-rendered ring, tinted green.
 *   3. Soft outer halo ring — additive light-green torus-like ring.
 *
 * Self-contained module: an ECS component + system pair, mirrors the shape
 * of `corruption-block.ts`. The game system spawns; this module animates.
 */

export const EatPulse = createComponent("EatPulse", {
  age: { type: Types.Float32, default: 0 },
  maxAge: { type: Types.Float32, default: 0.5 },
});

const ringVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ringFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float d = abs(vUv.y - 0.5) * 2.0;
    float glow = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(uColor, glow * uAlpha);
  }
`;

// Pulse lies flat on the board: RingGeometry/SphereGeometry face +Y after
// applying this quaternion to a `Group` parented to the board entity.
const FORWARD = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const tmpQuat = new Quaternion();
tmpQuat.setFromUnitVectors(FORWARD, UP);

interface PulseRefs {
  flash: Mesh;          // inner additive sphere — bright core flash
  ring: Mesh;            // shader ring — main expanding wave
  halo: Mesh;            // outer additive ring — soft trailing halo
}

const GREEN_FLASH = 0xb9ffd0;
const GREEN_RING = 0x36ff86;
const GREEN_HALO = 0x8dffb8;

function buildPulse(): { group: Group; refs: PulseRefs } {
  const group = new Group();
  group.name = "EatPulse";
  group.quaternion.copy(tmpQuat);

  // 1. Inner flash — small additive sphere.
  const flash = new Mesh(
    new SphereGeometry(0.05, 16, 12),
    new MeshBasicMaterial({
      color: GREEN_FLASH,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  flash.name = "EatPulseFlash";
  group.add(flash);

  // 2. Main expanding ring — shader for a soft anti-aliased band.
  const ring = new Mesh(
    new RingGeometry(0.05, 0.1, 36),
    new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(GREEN_RING) },
        uAlpha: { value: 1 },
      },
      vertexShader: ringVertexShader,
      fragmentShader: ringFragmentShader,
      transparent: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  ring.name = "EatPulseRing";
  group.add(ring);

  // 3. Outer soft halo ring — additive, lighter, larger.
  const halo = new Mesh(
    new RingGeometry(0.06, 0.18, 36),
    new MeshBasicMaterial({
      color: GREEN_HALO,
      transparent: true,
      opacity: 0.45,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  halo.name = "EatPulseHalo";
  group.add(halo);

  return { group, refs: { flash, ring, halo } };
}

export function spawnEatPulse(
  world: World,
  parent: Entity,
  position: Vector3,
): Entity {
  const { group } = buildPulse();
  group.position.copy(position);
  const entity = world.createTransformEntity(group, parent);
  entity.addComponent(EatPulse, { age: 0, maxAge: 0.5 });
  return entity;
}

export class EatPulseSystem extends createSystem({
  pulses: { required: [EatPulse] },
}) {
  init() {
    this.cleanupFuncs.push(() => {
      for (const entity of this.queries.pulses.entities) {
        if (entity.active) entity.dispose();
      }
    });
  }

  update(delta: number) {
    for (const entity of this.queries.pulses.entities) {
      const age = (entity.getValue(EatPulse, "age") as number) + delta;
      const maxAge = entity.getValue(EatPulse, "maxAge") as number;
      if (age >= maxAge) {
        entity.dispose();
        continue;
      }
      entity.setValue(EatPulse, "age", age);

      const group = entity.object3D as Group | null;
      if (!group) continue;

      const t = age / maxAge;
      const inv = 1 - t;

      // Look up children by name; structure is fixed by `buildPulse`.
      const flash = group.getObjectByName("EatPulseFlash") as Mesh | null;
      const ring = group.getObjectByName("EatPulseRing") as Mesh | null;
      const halo = group.getObjectByName("EatPulseHalo") as Mesh | null;

      // Flash: pops outward fast and fades; bias the curve so the core
      // stays bright early.
      if (flash) {
        const flashS = 0.5 + 2.0 * t;
        flash.scale.set(flashS, flashS, flashS);
        (flash.material as MeshBasicMaterial).opacity = 0.9 * inv * inv;
      }

      // Main ring: smooth scale-up, shader-driven alpha fade.
      if (ring) {
        const ringS = 1 + 1.8 * t;
        ring.scale.set(ringS, ringS, ringS);
        (ring.material as ShaderMaterial).uniforms.uAlpha.value = inv;
      }

      // Halo: larger, slower, faint.
      if (halo) {
        const haloS = 1.2 + 2.4 * t;
        halo.scale.set(haloS, haloS, haloS);
        (halo.material as MeshBasicMaterial).opacity = 0.45 * inv;
      }
    }
  }
}
