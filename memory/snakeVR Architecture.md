snakeVR Architecture

  The big picture                                           

  The app is an IWSDK (ECS-based WebXR) project with a multi-game launcher shell. At any moment
  exactly one "game" is active: either the menu (launcher) or snake. Switching games means
  registering / unregistering ECS systems — the inactive game has no systems running, no
  entities alive, no per-frame cost.

  Three layers of state:

  ┌───────────┬───────────────────────────────────┬────────────────────────────────────────┐
  │   Layer   │             Lives in              │                Purpose                 │
  ├───────────┼───────────────────────────────────┼────────────────────────────────────────┤
  │ Routing   │ requestedGame signal in           │ Which game should be active            │
  │           │ game-hub.ts                       │                                        │
  ├───────────┼───────────────────────────────────┼────────────────────────────────────────┤
  │ Game      │ world.globals.snake (signals)     │ Score, length, speed%, status,         │
  │ state     │                                   │ difficulty                             │
  ├───────────┼───────────────────────────────────┼────────────────────────────────────────┤
  │ Scene/ECS │ Entities + Three.js objects       │ What's actually rendered each frame    │
  └───────────┴───────────────────────────────────┴────────────────────────────────────────┘

  Three layers of code per feature:

  ┌────────────┬───────────────────────┬────────────────────────────────────────────────────┐
  │   Layer    │     Snake example     │                        Job                         │
  ├────────────┼───────────────────────┼────────────────────────────────────────────────────┤
  │ Scene      │ snake-board.ts        │ A plain function that creates Three.js meshes +    │
  │ builder    │                       │ ECS entities and returns refs                      │
  ├────────────┼───────────────────────┼────────────────────────────────────────────────────┤
  │ Game       │ snake-game-system.ts  │ Owns the game loop, mutates the signals, advances  │
  │ system     │                       │ the simulation                                     │
  ├────────────┼───────────────────────┼────────────────────────────────────────────────────┤
  │ Panel      │ snake-panel-system.ts │ Subscribes signals → repaints UIKit text; binds    │
  │ system     │                       │ button clicks → mutates signals                    │
  └────────────┴───────────────────────┴────────────────────────────────────────────────────┘

  The panel system never touches game logic. The game system never touches UIKit. They
  communicate only through world.globals.snake signals. That's why a refactor of either side
  doesn't ripple.

  Data flow per frame

  keyboard / gamepad / pinch
          ↓
  SnakeGameSystem.handleInput()
          ↓
  this.nextDir = {...}        ←─── direction queued
          ↓
  SnakeGameSystem.update()
          ↓
    tick() advances body, checks collisions
          ↓
    on eat: state.score.value++   ─────→ signal
                                            ↓
                              SnakePanelSystem subscription
                                            ↓
                              UIKit "score-value" text repaints

  HUD button click  ──→ state.newGameRequest.value++   ─────→ signal
                                                                ↓
                                    SnakeGameSystem subscription
                                                                ↓
                                    startGame() resets body, orb, etc.

  The signal layer is the entire API between the panel and the game.

  ---
  File-by-file

  src/index.ts — the bootstrap

  World.create(...).then(world => {
    installSnakeState(world);          // signals on world.globals.snake
    levelRoot.addComponent(DomeGradient, ...) // backdrop
    world.registerSystem(MenuPanelSystem)    // launcher is always live

    requestedGame.subscribe(next => {
      Promise.resolve().then(() => {     // defer past current update tick
        if (current === "snake") stopSnake();
        if (next    === "snake") startSnake();
      });
    });
  })

  Responsibilities:
  1. Configure World.create with VR session options (features: { locomotion: false, ... } — the
  snake board is virtual, no floor needed).
  2. Install global state.
  3. Add DomeGradient + IBLGradient to the level root (atmosphere + reflections — addComponent
  pattern, not scene.add).
  4. Register MenuPanelSystem once. Don't register the snake systems yet.
  5. Subscribe to requestedGame. On change, defer the register/unregister via
  Promise.resolve().then(...). Why deferred: mutating the system list while ECS is iterating it
  = crashes. The microtask runs after the current frame's update loop.
  6. Esc key returns to the menu — a single non-IWSDK window listener.

  src/game-hub.ts — the routing signal

  export type GameId = "menu" | "snake";
  export const requestedGame = signal<GameId>("menu");

  That's it. A single module-level signal. Anyone who imports it can .value = "snake" to
  navigate. Decoupled from any system — the menu writes it (PLAY button), the HUD writes it
  (EXIT button), Escape writes it. index.ts is the only reader that actually drives transitions.

  src/menu-panel-system.ts — the launcher

  export class MenuPanelSystem extends createSystem({
    menu: {
      required: [PanelUI, PanelDocument],
      where: [eq(PanelUI, "config", "./ui/snake-menu.json")],
    },
  }) {

  Two responsibilities in one system:

  (a) Build the menu entity (in init):
  - Creates a Group at world (0, 1.35, -1.1).
  - Wraps it in a transform entity.
  - Adds PanelUI pointing at ./ui/snake-menu.json (compiled from .uikitml).
  - Adds RayInteractable + PokeInteractable so VR controller rays and finger pokes both hit it.
  - Adds ScreenSpace for the 2D browser preview (CSS strings "20px", never numbers — IWSDK
  requirement).

  (b) Wire the panel (when the query qualifies):
  this.queries.menu.subscribe("qualify", e => {
    const doc = PanelDocument.data.document[e.index] as UIKitDocument;
    this.wire(doc);
  });

  The PanelDocument component is added asynchronously by IWSDK after the panel HTML loads.
  qualify fires at that moment. wire(doc) then:

  - doc.getElementById("btn-play") → click → requestedGame.value = "snake"
  - doc.getElementById("xr-button") → click → world.launchXR() / exitXR(). Subscribes to
  visibilityState to flip the button label.
  - doc.getElementById("diff-easy" | "diff-normal" | "diff-hard") → click →
  state.difficulty.value = key. Subscribes to state.difficulty and recolors the three buttons so
   the active one is highlighted.

  Visibility:
  requestedGame.subscribe(g => { this.menuRoot.visible = g === "menu"; })
  The menu panel stays in the scene during the snake game but is hidden. Cheaper than tearing it
   down and rebuilding.

  ui/snake-menu.uikitml → public/ui/snake-menu.json

  HTML-like markup with embedded CSS. The vite plugin compileUIKit watches ui/ and emits
  compiled JSON to public/ui/. The runtime loads the JSON via the PanelUI({ config: ... })
  reference.

  Structure:
  - Title "SNAKE VR" + subtitle
  - A .section-label ("DIFFICULTY")
  - A .row containing three .diff-btn buttons (#diff-easy, #diff-normal, #diff-hard)
  - #btn-play — the big green PLAY button
  - #xr-button — Enter/Exit XR

  Element IDs are the contract with the panel system. Class names control styling only.

  src/snake/snake-constants.ts — config

  Pure values, no logic:
  GRID = 30          // tiles per side
  TILE = 0.08        // metres per tile
  SPAN = 2.4 m       // total board side
  BOARD = { x: 0, y: 1.0, z: -1.6 }   // board centre in world space
  PLAYER_Y = 0.7     // virtual floor height for the snake scene
  DIFFICULTY = { easy: {...}, normal: {...}, hard: {...} }

  Two reasons constants live here:
  1. Other files (board, game, panel) import them — co-locating in one file avoids circular
  deps.
  2. They're tweakable knobs; finding them in one place beats hunting through 500-line files.

  src/snake/snake-state.ts — the signal bus

  export interface SnakeState {
    score: Signal<number>;
    length: Signal<number>;
    speedPct: Signal<number>;
    status: Signal<"ready" | "playing" | "gameOver">;
    difficulty: Signal<Difficulty>;
    newGameRequest: Signal<number>;
  }

  installSnakeState(world) creates the signals and parks them on world.globals.snake.
  getSnakeState(world) retrieves them.

  Why signals, not plain fields:
  - Push, not pull. The panel doesn't have to poll — it subscribes once and only repaints when
  the value changes.
  - Cross-system without coupling. Game system, panel system, and index.ts all share state
  without importing each other's classes.

  newGameRequest is a "command" signal — its value doesn't mean anything, only that it changed.
  The panel bumps it; the game system listens for changes and calls startGame(). This is how to
  send a one-shot trigger through a value-based reactive system.

  src/snake/snake-board.ts — pure scene builder

  A function, not a system: buildSnakeBoard(world): SnakeBoardRefs.

  Builds the visible scene:
  1. Root entity holding everything (so disposal is one call).
  2. Lights — AmbientLight (0.55) for fill + DirectionalLight (0.7) for the snake's emissive
  material to look correct.
  3. Board group at BOARD position, parented to root.
  4. Plate — dark navy plane, rotation.x = -π/2 to lie flat.
  5. Grid — GridHelper, 30×30 cyan lines.
  6. Frame — LineSegments of an EdgesGeometry(BoxGeometry) for the glowing border walls.
  7. Snake materials + geometry — one shared BoxGeometry and two MeshStandardMaterials (head vs
  body). The game system instantiates Mesh objects from these for each segment, pooled.
  8. Orb entity with positional AudioSource (chime on eat).
  9. Game-over audio entity — non-positional, separate so it doesn't compete with the orb's
  audio source.
  10. HUD panel entity — parented to boardEntity at local (0, 0.85, 0). PanelUI config =
  ./ui/snake-hud.json. This is the bit that makes the HUD "float above the board, visually
  adjacent": because it's parented to the board, moving the board moves the HUD too.

  Returns a SnakeBoardRefs interface with handles to everything the game system needs. Also
  exports disposeSnakeScene(refs) which traverses and disposes every geometry/material then
  rootEntity.dispose() — used in cleanup.

  src/snake/snake-game-system.ts — game loop

  export class SnakeGameSystem extends createSystem({}) {
    init() { ... }
    update(delta) { ... }
  }

  Empty query set {} — it doesn't iterate ECS entities, it owns its own state.

  init():
  1. Save the player's previous Y position (to restore on exit), set it to PLAYER_Y.
  2. Aim the browser camera at the board for non-XR preview.
  3. Call buildSnakeBoard(world) and store the refs.
  4. Call startGame() to seed the snake and orb.
  5. Subscribe to state.newGameRequest so the HUD's NEW GAME button can restart.
  6. Register cleanup: restore player Y, dispose the entire snake scene.

  update(delta):
  1. Bail if visibility is VisibleBlurred (XR but not focused → pause).
  2. handleInput() — read keyboard, gamepad thumbsticks, pinch direction.
  3. If started && !gameOver: accumulate tickTimer; while it exceeds tickInterval, call tick().
  The while handles low frame rates — multiple ticks per frame if needed.
  4. renderSnake() — interpolate visible segment positions between prev and new grid cells using
   tickTimer / tickInterval as t. This is why the snake looks smooth instead of jumping
  cell-to-cell.
  5. Pulse the orb's scale.

  tick():
  - Compute next head position.
  - Wall collision → endGame().
  - Self collision (skipping the tail tile if not eating, since it vacates) → endGame().
  - Snapshot prevBody for interpolation.
  - Unshift new head. If willEat: increment score, spawn an eat-pulse ring, accelerate
  tickInterval, play chime, spawn new orb. Else pop the tail.

  setDir(dx, dz):
  - Refuses 180° reversals (no self-immolation on first turn).
  - First direction input promotes the game from "ready" to "playing".

  Why input lives in the game system: input is tightly coupled to "what's the current direction"
   and "is the game over" — splitting it out would require another signal layer for a small win.

  src/snake/snake-panel-system.ts — HUD wiring

  export class SnakePanelSystem extends createSystem({
    hud: {
      required: [PanelUI, PanelDocument],
      where: [eq(PanelUI, "config", "./ui/snake-hud.json")],
    },
  }) {

  Exactly the same pattern as MenuPanelSystem but for the HUD JSON. The system is registered
  only while the snake game is active (see startSnake in index.ts), and unregistered on exit —
  its cleanupFuncs (signal subscriptions) tear down automatically.

  wire(doc) does six things, all the same shape:
  const paint = (n: number) => scoreEl.setProperties({ text: String(n).padStart(3, "0") });
  paint(state.score.peek());                       // prime initial value
  this.cleanupFuncs.push(state.score.subscribe(paint));  // and on every change

  For score / length / speed%: paint number → text. For status: paint enum → human-readable
  label via a STATUS_LABEL map. For the action button: paint status → "RESTART" or "NEW GAME".

  Two click handlers:
  - #btn-action click → state.newGameRequest.value++
  - #btn-exit click → requestedGame.value = "menu"

  ui/snake-hud.uikitml → public/ui/snake-hud.json

  Structure:
  - Title "SERPENT GRID XR"
  - .stats-row with three .stat-blocks. Each has a label ("SCORE"/"LENGTH"/"SPEED") and a value
  element (#score-value, #length-value, #speed-value). The IDs are the contract.
  - #status-text — line that flips based on game state
  - .row with #btn-action (green primary) and #btn-exit (cyan secondary)

  src/snake/eat-pulse-system.ts — visual effect

  Self-contained: one ECS component + one system in one file.

  export const EatPulse = createComponent("EatPulse", {
    age: { type: Types.Float32, default: 0 },
    maxAge: { type: Types.Float32, default: 0.4 },
  });

  spawnEatPulse(world, parent, position) builds a RingGeometry mesh with a custom ShaderMaterial
   (the radial glow), parents it to the board, and tags it with the EatPulse component.

  EatPulseSystem queries all EatPulse entities each frame:
  - Bump age.
  - If age >= maxAge: dispose the entity (geometry + material + entity removal).
  - Otherwise: scale the ring up (1 + 1.8 * t) and fade the alpha (1 - t).

  It's its own system because:
  1. The query elegantly handles "however many pulses are alive right now."
  2. Lifetime is tied to component age, decoupled from the game loop.
  3. It can be registered/unregistered with the snake game and clean up all its pulses on exit.

  ---
  How a single user action flows through everything

  User clicks EASY in the menu in browser preview:

  1. Mouse click hits the canvas. IWSDK's InputSystem raycasts via BVH, finds the menu entity
  (it has RayInteractable).
  2. The PanelUI underlying UIKit document receives the click on #diff-easy.
  3. The listener registered by MenuPanelSystem.wire: state.difficulty.value = "easy".
  4. state.difficulty is a @preact/signals-core signal. Setting .value notifies subscribers.
  5. The paintDifficulty subscriber (also wired in MenuPanelSystem.wire) recolors the three
  buttons.
  6. No other system reacts yet — difficulty is only consumed when a new snake game starts.

  User clicks PLAY:

  1. Same path: click → requestedGame.value = "snake".
  2. index.ts's subscriber sees the change. Schedules a microtask.
  5. The paintDifficulty subscriber (also wired in MenuPanelSystem.wire) recolors the three
  buttons.
  6. No other system reacts yet — difficulty is only consumed when a new snake game starts.

  User clicks PLAY:

  1. Same path: click → requestedGame.value = "snake".
  2. index.ts's subscriber sees the change. Schedules a microtask.
  6. No other system reacts yet — difficulty is only consumed when a new snake game starts.

  User clicks PLAY:

  1. Same path: click → requestedGame.value = "snake".
  2. index.ts's subscriber sees the change. Schedules a microtask.
  3. Microtask: startSnake() calls world.registerSystem(SnakeGameSystem), then EatPulseSystem, then SnakePanelSystem.
  4. SnakeGameSystem.init() runs: builds the board (via buildSnakeBoard), starts a fresh game using the currently-stored
  state.difficulty.peek(), primes signals (state.score.value = 0, etc.).
  5. SnakePanelSystem.init() runs: subscribes to query qualify.
  6. buildSnakeBoard already created the HUD entity with PanelUI. IWSDK loads snake-hud.json asynchronously; when it's ready,
  PanelDocument is added to the entity.
  7. The panel system's qualify fires. wire(doc) connects every UIKit element to its signal.
  8. Meanwhile MenuPanelSystem's requestedGame subscriber set menuRoot.visible = false, hiding the menu.

  The board is now in front of the player, HUD floating above it, signals primed, and the snake is sitting idle waiting for arrow keys.

  ---
  That's the full architecture. The key idea to internalize: signals are the API surface between the UI layer and the game layer, and ECS
   system registration is the way you turn whole features on and off.