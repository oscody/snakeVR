import {
  AmbientLight,
  AudioSource,
  BoxGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Entity,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PanelUI,
  PlaneGeometry,
  PlaybackMode,
  PokeInteractable,
  RayInteractable,
  World,
} from "@iwsdk/core";

import { buildOrb, type OrbRefs } from "./orb.js";
import { BOARD, GRID, SPAN, TILE } from "./snake-constants.js";

export interface SnakeBoardRefs {
  rootEntity: Entity;
  gameRoot: Group;
  boardEntity: Entity;
  board: Group;
  orbEntity: Entity;
  orb: OrbRefs;
  segGeo: BoxGeometry;
  segMat: MeshStandardMaterial;
  headMat: MeshStandardMaterial;
  gameOverAudio: Entity;
  hudPanelEntity: Entity;
}

/**
 * Build the snake game scene under a single root entity.
 *
 * Returns the refs the game system needs to drive gameplay. The HUD panel
 * entity is parented to the board so it floats above it and tracks any
 * future board grab/relocation — visually adjacent to the play surface.
 */
export function buildSnakeBoard(world: World): SnakeBoardRefs {
  const gameRoot = new Group();
  const rootEntity = world.createTransformEntity(gameRoot);

  gameRoot.add(new AmbientLight(0xffffff, 0.55));
  const dir = new DirectionalLight(0xffffff, 0.7);
  dir.position.set(0.5, 2.2, 0.6);
  gameRoot.add(dir);

  const board = new Group();
  board.position.set(BOARD.x, BOARD.y, BOARD.z);
  const boardEntity = world.createTransformEntity(board, rootEntity);

  // Base plate.
  const plate = new Mesh(
    new PlaneGeometry(SPAN, SPAN),
    new MeshStandardMaterial({
      color: 0x0c1420,
      emissive: 0x07101a,
      emissiveIntensity: 0.6,
      roughness: 0.7,
      metalness: 0.2,
      transparent: true,
      opacity: 0.96,
      side: DoubleSide,
    }),
  );
  plate.rotation.x = -Math.PI / 2;
  board.add(plate);

  // Neon tile grid.
  const grid = new GridHelper(SPAN, GRID, 0x46e0c0, 0x1f5560);
  grid.position.y = 0.001;
  board.add(grid);

  // Glowing boundary frame (the walls).
  const frame = new LineSegments(
    new EdgesGeometry(new BoxGeometry(SPAN, TILE * 0.8, SPAN)),
    new LineBasicMaterial({ color: 0x46e0c0 }),
  );
  frame.position.y = TILE * 0.4;
  board.add(frame);

  // Snake materials + pool geometry (one geometry shared by every segment).
  const segGeo = new BoxGeometry(TILE * 0.82, TILE * 0.82, TILE * 0.82);
  const segMat = new MeshStandardMaterial({
    color: 0x1f7d4a,
    emissive: 0x32d06e,
    emissiveIntensity: 0.85,
    roughness: 0.3,
    metalness: 0.1,
  });
  const headMat = new MeshStandardMaterial({
    color: 0x9affc0,
    emissive: 0x9affc0,
    emissiveIntensity: 1.1,
    roughness: 0.25,
  });

  // Energy orb (its AudioSource plays the pickup chime). Mesh hierarchy
  // lives in `./orb.ts`; this module only places it and attaches audio.
  const orb = buildOrb();
  const orbEntity = world.createTransformEntity(orb.group, boardEntity);
  orbEntity.addComponent(AudioSource, {
    src: "audio/chime.mp3",
    positional: true,
    volume: 0.9,
    playbackMode: PlaybackMode.Restart,
  });

  // Non-positional game-over sound.
  const gameOverAudio = world.createTransformEntity(new Group(), rootEntity);
  gameOverAudio.addComponent(AudioSource, {
    src: "audio/chime.mp3",
    positional: false,
    volume: 0.7,
    playbackMode: PlaybackMode.Restart,
  });

  const hudPanelEntity = buildHudPanel(world, boardEntity);

  return {
    rootEntity,
    gameRoot,
    boardEntity,
    board,
    orbEntity,
    orb,
    segGeo,
    segMat,
    headMat,
    gameOverAudio,
    hudPanelEntity,
  };
}

/**
 * Floats the HUD panel ~80 cm above the board centre. Parenting to the board
 * means the HUD travels with the board if it's ever grabbed/relocated, and
 * its default +Z facing naturally points at the player (player camera is in
 * +Z relative to BOARD.z = -1.6).
 */
function buildHudPanel(world: World, boardEntity: Entity): Entity {
  const host = new Group();
  host.name = "snakeHudPanel";
  host.position.set(0, 0.85, 0);
  const entity = world.createTransformEntity(host, boardEntity);
  entity
    .addComponent(PanelUI, {
      config: "./ui/snake-hud.json",
      maxWidth: 0.9,
      maxHeight: 0.5,
    })
    .addComponent(RayInteractable)
    .addComponent(PokeInteractable);
  return entity;
}

/** Dispose every Three.js resource under the snake root. */
export function disposeSnakeScene(refs: SnakeBoardRefs): void {
  refs.gameRoot.traverse((obj) => {
    const mesh = obj as Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material as
      | MeshBasicMaterial
      | MeshStandardMaterial
      | LineBasicMaterial
      | Array<MeshBasicMaterial | MeshStandardMaterial>
      | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose?.();
  });
  refs.rootEntity.dispose();
}
