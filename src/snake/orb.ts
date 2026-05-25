import {
  AdditiveBlending,
  BackSide,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from "@iwsdk/core";

import { TILE } from "./snake-constants.js";

/**
 * Standing energy orb visual — a layered translucent green pickup.
 *
 * Five Three.js layers parented under one Group:
 *   1. Inner bright core (opaque pale-green sphere).
 *   2. Translucent green shell — `MeshStandardMaterial` with high emissive.
 *      (No `transmission`/`clearcoat`: too expensive in VR; the look is
 *      preserved by the inner core + additive halo combination.)
 *   3. Soft outer halo — back-side additive sphere.
 *   4. Equator torus ring (additive).
 *   5. Smaller tilted torus ring at an angle (additive).
 *
 * No PointLight: would cost dynamic-light shader recompilation, and the
 * emissive materials + bloom-style additive layers already read brightly.
 *
 * `OrbRefs` exposes the sub-meshes whose materials/rotations the game system
 * animates each frame, so callers don't have to `getObjectByName` lookups.
 */
export interface OrbRefs {
  group: Group;
  shell: Mesh;
  halo: Mesh;
  ringEquator: Mesh;
  ringTilted: Mesh;
}

const ORB_R = TILE * 0.36;

export function buildOrb(): OrbRefs {
  const group = new Group();
  group.name = "EnergyOrb";

  // 1. Inner bright core.
  const core = new Mesh(
    new SphereGeometry(ORB_R * 0.54, 32, 32),
    new MeshBasicMaterial({
      color: 0xb9ffd0,
      transparent: true,
      opacity: 0.92,
    }),
  );
  core.name = "OrbInnerCore";
  group.add(core);

  // 2. Translucent green shell — animated emissive.
  const shell = new Mesh(
    new SphereGeometry(ORB_R, 32, 32),
    new MeshStandardMaterial({
      color: 0x36ff86,
      emissive: 0x10ff67,
      emissiveIntensity: 1.55,
      roughness: 0.08,
      metalness: 0.02,
      transparent: true,
      opacity: 0.72,
    }),
  );
  shell.name = "OrbShell";
  group.add(shell);

  // 3. Soft outer halo — additive back-side.
  const halo = new Mesh(
    new SphereGeometry(ORB_R * 1.18, 24, 24),
    new MeshBasicMaterial({
      color: 0x24ff78,
      transparent: true,
      opacity: 0.18,
      side: BackSide,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.name = "OrbHalo";
  group.add(halo);

  // 4. Equator energy ring — additive torus.
  const ringMatBase = new MeshBasicMaterial({
    color: 0x8dffb8,
    transparent: true,
    opacity: 0.62,
    side: DoubleSide,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const ringEquator = new Mesh(
    new TorusGeometry(ORB_R * 1.05, 0.006, 12, 64),
    ringMatBase,
  );
  ringEquator.name = "OrbRingEquator";
  ringEquator.rotation.x = Math.PI / 2;
  group.add(ringEquator);

  // 5. Tilted energy ring — smaller, fainter, off-axis.
  const ringTiltMat = ringMatBase.clone();
  ringTiltMat.opacity = 0.42;
  const ringTilted = new Mesh(
    new TorusGeometry(ORB_R * 0.86, 0.005, 12, 64),
    ringTiltMat,
  );
  ringTilted.name = "OrbRingTilted";
  ringTilted.rotation.set(Math.PI / 2.5, 0.45, 0.35);
  group.add(ringTilted);

  return { group, shell, halo, ringEquator, ringTilted };
}

/**
 * Direct disposal — useful for one-off respawns. `disposeSnakeScene` walks
 * the whole gameRoot via traverse so it doesn't strictly need this, but it's
 * exported in case a future caller wants to dispose just the orb.
 */
export function disposeOrb(refs: OrbRefs): void {
  refs.group.traverse((obj) => {
    const mesh = obj as Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material as
      | MeshBasicMaterial
      | MeshStandardMaterial
      | Array<MeshBasicMaterial | MeshStandardMaterial>
      | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose?.();
  });
}
