import {
  AdditiveBlending,
  Color,
  createComponent,
  createSystem,
  DoubleSide,
  Entity,
  Mesh,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Types,
  Vector3,
  World,
} from "@iwsdk/core";

export const EatPulse = createComponent("EatPulse", {
  age: { type: Types.Float32, default: 0 },
  maxAge: { type: Types.Float32, default: 0.4 },
});

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float d = abs(vUv.y - 0.5) * 2.0;
    float glow = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(uColor, glow * uAlpha);
  }
`;

// RingGeometry faces +Z by default; rotate to face +Y (flat on the board).
const FORWARD = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const tmpQuat = new Quaternion();
tmpQuat.setFromUnitVectors(FORWARD, UP);

export function spawnEatPulse(
  world: World,
  parent: Entity,
  position: Vector3,
): Entity {
  const geometry = new RingGeometry(0.05, 0.09, 32);
  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(0x3fe07a) },
      uAlpha: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.quaternion.copy(tmpQuat);
  const entity = world.createTransformEntity(mesh, parent);
  entity.addComponent(EatPulse, { age: 0, maxAge: 0.4 });
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
      const t = age / maxAge;
      const mesh = entity.object3D as Mesh | null;
      if (!mesh) continue;
      const s = 1 + 1.8 * t;
      mesh.scale.set(s, s, s);
      (mesh.material as ShaderMaterial).uniforms.uAlpha.value = 1 - t;
    }
  }
}
