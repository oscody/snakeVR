import {
  createSystem,
  eq,
  Group,
  Object3D,
  PanelDocument,
  PanelUI,
  PokeInteractable,
  RayInteractable,
  ScreenSpace,
  UIKit,
  UIKitDocument,
  VisibilityState,
} from "@iwsdk/core";

import { requestedGame, type GameId } from "./game-hub.js";
import {
  getSnakeState,
} from "./snake/snake-state.js";
import type { Difficulty } from "./snake/snake-constants.js";

const ACTIVE_BG = "#46e0c0";
const ACTIVE_FG = "#051a0c";
const ACTIVE_BORDER = "#7ff5e6";
const IDLE_BG = "#0c1428";
const IDLE_FG = "#9aa4d4";
const IDLE_BORDER = "#1f304d";

const MENU_POS = { x: 0, y: 1.35, z: -1.1 };

/**
 * Owns the launcher PanelUI panel and the menu's persistent transform.
 *
 * `init()` builds the menu host (a single transform entity holding the
 * `snake-menu.json` PanelUI) and wires its buttons:
 *   - PLAY            → `requestedGame.value = "snake"`
 *   - EASY/NORMAL/HARD → `snakeState.difficulty.value = "..."`
 *   - Enter XR        → `world.launchXR()` / `world.exitXR()`
 *
 * Visibility of the menu host follows `requestedGame` — when the snake
 * game is active the panel hides; on return to "menu" it reappears.
 */
export class MenuPanelSystem extends createSystem({
  menu: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/snake-menu.json")],
  },
}) {
  private menuRoot!: Object3D;

  init(): void {
    this.queries.menu.subscribe("qualify", (e) => {
      const doc = PanelDocument.data.document[e.index] as UIKitDocument;
      if (!doc) return;
      this.wire(doc);
    });

    this.menuRoot = new Group();
    this.menuRoot.position.set(MENU_POS.x, MENU_POS.y, MENU_POS.z);
    const entity = this.world.createTransformEntity(this.menuRoot);
    entity
      .addComponent(PanelUI, {
        config: "./ui/snake-menu.json",
        maxWidth: 0.7,
        maxHeight: 0.95,
      })
      .addComponent(RayInteractable)
      .addComponent(PokeInteractable)
      .addComponent(ScreenSpace, {
        top: "200px",
        left: "80px",
        width: "320px",
      });

    // Hide the menu when the snake game is selected.
    this.cleanupFuncs.push(
      requestedGame.subscribe((g: GameId) => {
        this.menuRoot.visible = g === "menu";
      }),
    );

    // Browser preview framing — close camera looking at the menu.
    this.frameMenuCamera();
  }

  private wire(doc: UIKitDocument): void {
    const state = getSnakeState(this.world);

    const playBtn = doc.getElementById("btn-play") as UIKit.Text | null;
    const xrBtn = doc.getElementById("xr-button") as UIKit.Text | null;
    const diffBtns: Record<Difficulty, UIKit.Text | null> = {
      easy: doc.getElementById("diff-easy") as UIKit.Text | null,
      normal: doc.getElementById("diff-normal") as UIKit.Text | null,
      hard: doc.getElementById("diff-hard") as UIKit.Text | null,
    };

    playBtn?.addEventListener("click", () => {
      requestedGame.value = "snake";
    });

    if (xrBtn) {
      xrBtn.addEventListener("click", () => {
        if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
          this.world.launchXR();
        } else {
          this.world.exitXR();
        }
      });
      this.cleanupFuncs.push(
        this.world.visibilityState.subscribe((vs) => {
          xrBtn.setProperties({
            text: vs === VisibilityState.NonImmersive ? "Enter XR" : "Exit XR",
          });
        }),
      );
    }

    const paintDifficulty = (active: Difficulty) => {
      (Object.keys(diffBtns) as Difficulty[]).forEach((key) => {
        const btn = diffBtns[key];
        if (!btn) return;
        const on = key === active;
        btn.setProperties({
          backgroundColor: on ? ACTIVE_BG : IDLE_BG,
          color: on ? ACTIVE_FG : IDLE_FG,
          borderColor: on ? ACTIVE_BORDER : IDLE_BORDER,
        });
      });
    };
    paintDifficulty(state.difficulty.peek());
    this.cleanupFuncs.push(state.difficulty.subscribe(paintDifficulty));

    (Object.keys(diffBtns) as Difficulty[]).forEach((key) => {
      const btn = diffBtns[key];
      btn?.addEventListener("click", () => {
        state.difficulty.value = key;
      });
    });
  }

  private frameMenuCamera() {
    this.world.camera.position.set(0, 0, 0);
    this.world.camera.lookAt(MENU_POS.x, MENU_POS.y, MENU_POS.z);
  }
}
