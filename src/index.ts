import { SessionMode, World } from "@iwsdk/core";

import { GameMenuSystem } from "./gameMenu.js";
import { PlayerTunerSystem } from "./playerTuner.js";

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always",
    features: { handTracking: true, layers: true },
  },
}).then((world) => {
  world.registerSystem(GameMenuSystem);
  world.registerSystem(PlayerTunerSystem);
});
