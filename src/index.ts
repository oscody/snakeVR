import {
  DomeGradient,
  IBLGradient,
  SessionMode,
  VisibilityState,
  World,
} from "@iwsdk/core";

import { requestedGame, type GameId } from "./game-hub.js";
import { MenuPanelSystem } from "./menu-panel-system.js";
import { EatPulseSystem } from "./snake/eat-pulse-system.js";
import { SnakeGameSystem } from "./snake/snake-game-system.js";
import { SnakePanelSystem } from "./snake/snake-panel-system.js";
import { installSnakeState } from "./snake/snake-state.js";

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always",
    features: { handTracking: true, layers: true },
  },
  features: {
    locomotion: false,
    grabbing: false,
    physics: false,
    sceneUnderstanding: false,
    environmentRaycast: false,
  },
}).then((world) => {
  installSnakeState(world);

  // Holographic dome backdrop + matching IBL.
  const levelRoot = world.activeLevel.peek() ?? world.sceneEntity;
  levelRoot
    .addComponent(DomeGradient, {
      sky: [0.04, 0.05, 0.12, 1.0],
      equator: [0.02, 0.04, 0.08, 1.0],
      ground: [0.0, 0.0, 0.0, 1.0],
      intensity: 1.0,
    })
    .addComponent(IBLGradient, {
      sky: [0.25, 0.3, 0.45, 1.0],
      equator: [0.15, 0.18, 0.28, 1.0],
      ground: [0.05, 0.05, 0.08, 1.0],
      intensity: 0.8,
    });

  // The launcher panel is always registered; it owns the menu transform.
  world.registerSystem(MenuPanelSystem, { priority: -10 });

  let current: GameId = "menu";
  const startSnake = () => {
    world
      .registerSystem(SnakeGameSystem, { priority: -5 })
      .registerSystem(EatPulseSystem, { priority: 0 })
      .registerSystem(SnakePanelSystem, { priority: 5 });
  };
  const stopSnake = () => {
    world.unregisterSystem(SnakePanelSystem);
    world.unregisterSystem(EatPulseSystem);
    world.unregisterSystem(SnakeGameSystem);
  };

  // Route between games on `requestedGame`. Defer the register/unregister
  // out of the current update tick so we never mutate the system list mid-loop.
  let transitioning = false;
  requestedGame.subscribe((next) => {
    if (next === current || transitioning) return;
    transitioning = true;
    Promise.resolve().then(() => {
      if (current === "snake") stopSnake();
      if (next === "snake") startSnake();
      current = next;
      transitioning = false;
    });
  });

  // Esc returns to the menu from inside a game.
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && current !== "menu") {
      requestedGame.value = "menu";
    }
  });

  // Restore the browser preview framing when leaving XR back to the page.
  world.visibilityState.subscribe((state) => {
    if (state === VisibilityState.NonImmersive) {
      // Let the active system reframe — menu and snake set their own camera.
      requestAnimationFrame(() => {
        // No-op hook; the menu/game systems set the camera on init.
      });
    }
  });

  console.log(
    "[Snake VR] Launcher ready — click PLAY in the panel, or press Esc inside a game to return.",
  );
});
