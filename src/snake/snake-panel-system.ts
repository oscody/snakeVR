import {
  createSystem,
  eq,
  PanelDocument,
  PanelUI,
  UIKit,
  UIKitDocument,
} from "@iwsdk/core";

import { requestedGame } from "../game-hub.js";
import { getSnakeState, type SnakeStatus } from "./snake-state.js";

const STATUS_LABEL: Record<SnakeStatus, string> = {
  ready: "Move to begin",
  playing: "Steer to grow",
  gameOver: "GAME OVER - press NEW GAME",
};

/**
 * Wires the snake HUD `.uikitml` panel to the live game state.
 *
 * The panel entity is created by `buildSnakeBoard` and parented to the
 * board, so it floats above and travels with the play surface. This system
 * only subscribes to signals and routes button clicks — no scene work.
 */
export class SnakePanelSystem extends createSystem({
  hud: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/snake-hud.json")],
  },
}) {
  init(): void {
    this.queries.hud.subscribe("qualify", (entity) => {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      this.wire(doc);
    });
  }

  private wire(doc: UIKitDocument): void {
    const state = getSnakeState(this.world);

    const scoreEl = doc.getElementById("score-value") as UIKit.Text | null;
    const lengthEl = doc.getElementById("length-value") as UIKit.Text | null;
    const speedEl = doc.getElementById("speed-value") as UIKit.Text | null;
    const statusEl = doc.getElementById("status-text") as UIKit.Text | null;
    const actionBtn = doc.getElementById("btn-action") as UIKit.Text | null;
    const exitBtn = doc.getElementById("btn-exit") as UIKit.Text | null;

    if (scoreEl) {
      const paint = (n: number) =>
        scoreEl.setProperties({ text: String(n).padStart(3, "0") });
      paint(state.score.peek());
      this.cleanupFuncs.push(state.score.subscribe(paint));
    }

    if (lengthEl) {
      const paint = (n: number) => lengthEl.setProperties({ text: String(n) });
      paint(state.length.peek());
      this.cleanupFuncs.push(state.length.subscribe(paint));
    }

    if (speedEl) {
      const paint = (n: number) => speedEl.setProperties({ text: `${n}%` });
      paint(state.speedPct.peek());
      this.cleanupFuncs.push(state.speedPct.subscribe(paint));
    }

    if (statusEl) {
      const paint = (s: SnakeStatus) =>
        statusEl.setProperties({ text: STATUS_LABEL[s] });
      paint(state.status.peek());
      this.cleanupFuncs.push(state.status.subscribe(paint));
    }

    const powerupEl = doc.getElementById("powerup-text") as UIKit.Text | null;
    if (powerupEl) {
      const paint = () => {
        const parts: string[] = [];
        if (state.shieldCharges.peek() > 0) parts.push("SHIELD");
        const m = state.multiplierOrbsLeft.peek();
        if (m > 0) parts.push(`2× ×${m}`);
        const g = state.growthOrbsLeft.peek();
        if (g > 0) parts.push(`GROW ×${g}`);
        powerupEl.setProperties({
          text: parts.length ? parts.join(" · ") : "-",
        });
      };
      paint();
      this.cleanupFuncs.push(state.shieldCharges.subscribe(paint));
      this.cleanupFuncs.push(state.multiplierOrbsLeft.subscribe(paint));
      this.cleanupFuncs.push(state.growthOrbsLeft.subscribe(paint));
    }

    if (actionBtn) {
      // Label flips between NEW GAME (idle / game over) and RESTART (playing).
      const paint = (s: SnakeStatus) =>
        actionBtn.setProperties({
          text: s === "playing" ? "RESTART" : "NEW GAME",
        });
      paint(state.status.peek());
      this.cleanupFuncs.push(state.status.subscribe(paint));
      actionBtn.addEventListener("click", () => {
        state.newGameRequest.value = state.newGameRequest.peek() + 1;
      });
    }

    if (exitBtn) {
      exitBtn.addEventListener("click", () => {
        requestedGame.value = "menu";
      });
    }
  }
}
