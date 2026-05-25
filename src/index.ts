import { SessionMode, World } from "@iwsdk/core";

import { installSnakeGlobals } from "./gameHub.js";
import { GameMenuSystem } from "./gameMenu.js";
import { PlayerTunerSystem } from "./playerTuner.js";

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always",
    features: { handTracking: true, layers: true },
  },
}).then((world) => {
  installSnakeGlobals(world);
  world.registerSystem(GameMenuSystem, { priority: -10 });
  world.registerSystem(PlayerTunerSystem, { priority: 0 });
});
