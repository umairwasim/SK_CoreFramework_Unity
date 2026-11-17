# 🚀 SKCore Tools — Future Systems

> Planned web-based Unity developer tools for the SKCore Tools suite.
> Each tool follows the SKCore design philosophy: **zero-framework vanilla JS, offline-capable, Unity C# code generation, dark mode support, glassmorphism UI**.

---

## 📋 Pipeline Overview

| # | Tool Name | Status | Priority | Spec |
|---|-----------|--------|----------|------|
| 6 | Procedural SFX Lab | 🟡 Planned | ⭐⭐⭐ High | [spec](./01-sfx-lab.md) |
| 7 | Particle Playground | 🟡 Planned | ⭐⭐⭐ High | [spec](./02-particle-playground.md) |
| 8 | State Machine Forge | 🟡 Planned | ⭐⭐⭐ High | [spec](./03-state-machine-forge.md) |
| 9 | Spline & Path Studio | 🟡 Planned | ⭐⭐ Medium | [spec](./04-spline-path-studio.md) |
| 10 | Shader Mixer | 🟡 Planned | ⭐⭐ Medium | [spec](./05-shader-mixer.md) |
| 11 | Tilemap Architect | 🔴 Concept | ⭐⭐⭐ High | inline ↓ |
| 12 | ScriptableObject Foundry | 🔴 Concept | ⭐⭐⭐ High | inline ↓ |
| 13 | Terrain Sculptor | 🔴 Concept | ⭐⭐ Medium | inline ↓ |
| 14 | Animation Timeline Mixer | 🔴 Concept | ⭐⭐ Medium | inline ↓ |
| 15 | Debug Console Designer | 🔴 Concept | ⭐⭐⭐ High | inline ↓ |
| 16 | Probability Lab | 🔴 Concept | ⭐⭐⭐ High | inline ↓ |
| 17 | Font & Text FX Workshop | 🔴 Concept | ⭐⭐ Medium | inline ↓ |
| 18 | Grid & Formation Planner | 🔴 Concept | ⭐⭐ Medium | inline ↓ |
| 19 | Skybox & Atmosphere Studio | 🔴 Concept | ⭐⭐ Medium | inline ↓ |
| 20 | UI Wireframe Studio | 🔴 Concept | ⭐⭐⭐ High | inline ↓ |
| 21 | Cinemachine & Camera Shake Studio | 🔴 Concept | ⭐⭐⭐ High | inline ↓ |
| 22 | Narrative Weaver | 🔴 Concept | ⭐⭐⭐ High | inline ↓ |
| 23 | Combat Hitbox & Frame Data Studio | 🔴 Concept | ⭐⭐⭐ High | inline ↓ |
| 24 | Low-Poly Sculptor & Mesh Deformer | 🔴 Concept | ⭐⭐ Medium | inline ↓ |
| 25 | Audio Mixer & Ambience Orchestrator | 🔴 Concept | ⭐⭐ Medium | inline ↓ |
| 26 | Procedural Dungeon & WFC Architect | 🔴 Concept | ⭐⭐⭐ High | inline ↓ |
| 27 | PBR Texture Baker & Seamless Normal Lab | 🔴 Concept | ⭐⭐⭐ High | inline ↓ |
| 28 | Ragdoll & Joint Physics Calibrator | 🔴 Concept | ⭐⭐ Medium | inline ↓ |
| 29 | Boids & Flocking Swarm Lab | 🔴 Concept | ⭐⭐ Medium | inline ↓ |
| 30 | Input Action Map Architect | 🔴 Concept | ⭐⭐⭐ High | inline ↓ |

---

## 🏗️ Architecture Standards

All future tools must follow these conventions:

- **Single HTML file** (or HTML + local `vendor/` for large libs)
- **Theme sync**: `localStorage('skcore_theme')` + FOUC prevention + `storage` event listener
- **Navigation**: Hub return button linking to `../index.html`
- **Language**: All UI text in English
- **Export**: Unity C# code generation with clipboard copy
- **Offline**: Zero CDN dependencies (local vendor/ for Three.js)
- **Dark Mode**: Full `html.dark` CSS coverage
- **Keyboard shortcuts**: Consistent with existing suite patterns

---

## 🔧 Tool Specs (6–10) — Detailed specs in separate files

- **#6 Procedural SFX Lab** → [01-sfx-lab.md](./01-sfx-lab.md)
- **#7 Particle Playground** → [02-particle-playground.md](./02-particle-playground.md)
- **#8 State Machine Forge** → [03-state-machine-forge.md](./03-state-machine-forge.md)
- **#9 Spline & Path Studio** → [04-spline-path-studio.md](./04-spline-path-studio.md)
- **#10 Shader Mixer** → [05-shader-mixer.md](./05-shader-mixer.md)

---

## 🗺️ #11 — Tilemap Architect (2D Level Design Editor)

> Web-based 2D tile map editor for rapid Unity level prototyping.

**Core Features:**
- **Drawing Tools**: Brush, Fill (flood), Rectangle, Ellipse, Line, Eraser, Eyedropper
- **Layer System**: Ground, Walls, Decoration, Collision, Triggers — reorderable with visibility toggles
- **Auto-Tiling**: 47-rule bitmask engine for automatic edge/corner tile selection
- **Tileset Import**: Upload PNG sprite sheet → grid slicer with adjustable cell size & padding
- **Collision Painter**: Draw collision shapes per tile (box, polygon, edge collider)
- **Undo/Redo**: Full history stack (Ctrl+Z / Ctrl+Y)
- **Minimap**: Zoomed-out overview of entire level

**Presets:** 🏰 Dungeon Crawler · 🌲 Platformer Forest · 🏙️ Top-Down City · 🚀 Space Station · 🏜️ Desert Temple

**Export:**
- Unity Tilemap JSON data + `TilemapLoader.cs` MonoBehaviour
- Per-layer collision data (`CompositeCollider2D` config)
- `.tmx` format (Tiled compatible)
- Raw CSV grid data

**Tech:** HTML5 Canvas 2D (tile renderer), Vanilla JS, ~3,000–4,000 lines

---

## 📊 #12 — ScriptableObject Foundry (Data Architecture Designer)

> Visual schema designer for Unity ScriptableObject data systems — plan before you code.

**Core Features:**
- **Visual Schema Editor**: Drag-and-drop field builder with types: `string`, `int`, `float`, `bool`, `enum`, `AnimationCurve`, `Gradient`, `Color`, `Vector2/3`, `List<T>`, `SO reference`
- **Relationship Map**: Visual graph showing SO-to-SO references (e.g., WeaponData → DamageType → VFX Preset)
- **Enum Generator**: Name list → auto C# enum with `[Flags]` support
- **Data Table**: Fill created schema in spreadsheet view (e.g., 50 weapons, 30 abilities)
- **Validation Engine**: Null reference, missing field, type mismatch, circular dependency detection
- **Inheritance**: Mark base SO classes, create derived variants

**Presets:** ⚔️ RPG Item Database · 🧙 Skill/Ability Tree · 🏪 Shop Inventory · 🎵 Audio Config Bank · 📋 Quest/Dialogue Definition · 🎮 Input Action Map

**Export:**
- `[CreateAssetMenu]` ScriptableObject C# classes
- Custom `PropertyDrawer` / `Editor` scripts for Inspector UX
- JSON seed data for bulk `.asset` creation via `AssetDatabase`
- ERD diagram (Mermaid markdown)

**Tech:** HTML5 Canvas 2D (relationship graph), Vanilla JS, ~2,500–3,500 lines

---

## 🌍 #13 — Terrain Sculptor (Procedural Terrain Generator)

> Noise-based heightmap generator with 3D preview — exports Unity Terrain-ready data.

**Core Features:**
- **Noise Layer Stack**: Up to 8 layers — Perlin, Simplex, Ridged, Voronoi, Domain Warping
- **Per-Layer Controls**: Frequency, amplitude, octaves, persistence, lacunarity, seed, offset
- **3D Preview**: Three.js real-time terrain mesh with dynamic water plane & atmosphere
- **Sculpt Brushes**: Raise, Lower, Smooth, Flatten, Terrace, Plateau (Canvas 2D heightmap painting)
- **Erosion Simulation**: Hydraulic erosion (raindrop → river bed → sediment deposit → delta)
- **Biome Painter**: Height + slope-based auto-assignment (grass, rock, snow, sand, forest)
- **Splatmap Preview**: 4-channel texture weight visualization overlaid on terrain

**Presets:** 🏔️ Alpine Mountains · 🏜️ Desert Canyon · 🌋 Volcanic Island · 🌊 Coastal Cliffs · 🌿 Rolling Hills · 🧊 Arctic Glacier

**Export:**
- 16-bit RAW heightmap (Unity Terrain import-ready)
- Splatmap PNG (RGBA 4-channel texture weights)
- `TerrainSetup.cs` — C# script configuring Terrain resolution, height, splatmaps, tree/detail placement
- Heightmap PNG (8-bit grayscale for quick preview)

**Tech:** Three.js (local vendor/) for 3D, Canvas 2D for heightmap painting, ~4,000–5,500 lines

---

## 🎭 #14 — Animation Timeline Mixer (Blend & Layer Planner)

> Visual Animator Controller layer structure and blend tree planning tool.

**Core Features:**
- **Timeline View**: Place animation clips on a multi-track timeline with crossfade transitions
- **Blend Tree Editor**: 1D (speed parameter), 2D Freeform Directional (strafe), Direct blend — weight field visualization with interactive parameter point
- **Layer Manager**: Base / Override / Additive layers with avatar mask config (Upper Body, Lower Body, Full Body, Hands Only)
- **Transition Graph**: State-to-state arrows with condition configuration (Float >, Bool ==, Trigger)
- **IK Planning**: IK target weight curve editor (LookAt, Foot IK, Hand IK) per animation clip
- **Duration Calculator**: Total transition time, blend time, exit time visualization
- **Conflict Detector**: Warns when layers fight over same body parts or transitions have unreachable states

**Presets:** 🏃 Locomotion Blend Tree · ⚔️ Combat Layer (Attack/Block/Dodge) · 🧗 Climbing Override · 💃 Social Emotes · 🏊 Swimming Layer

**Export:**
- `AnimatorSetup.cs` — complete C# script creating layers, parameters, states, transitions, blend trees via `AnimatorController` API
- Parameter definition JSON
- Layer/mask configuration JSON

**Tech:** HTML5 Canvas 2D (timeline + blend tree graph), Vanilla JS, ~3,500–4,500 lines

---

## 🧪 #15 — Debug Console Designer (In-Game Dev Tools Generator)

> Visually design your game's runtime debug console — export a complete IMGUI/UI Toolkit system.

**Core Features:**
- **Command Builder**: Define slash commands with typed arguments: `/god`, `/tp <float> <float> <float>`, `/spawn <string> <int>`, `/timescale <float>`, `/stat <string>`
- **Autocomplete System**: Tab-completion for commands + parameter suggestions
- **Watch Panel Designer**: Add live-updating variable monitors (FPS, memory, position, velocity, state name) with configurable refresh rate
- **Quick Toggles**: Bool switches: God Mode, No Clip, Show Colliders, Show NavMesh, Slow Motion, Show FPS, Mute Audio
- **Slider Tweakers**: Runtime float/int adjusters (gravity, player speed, damage multiplier, spawn rate)
- **Log Viewer**: Level filters (Info/Warn/Error/Exception), category tags, search + regex, timestamp toggle, stack trace expand
- **Layout Editor**: Visual drag-resize of console panels — position, size, font, colors, opacity, dock mode (bottom/side/floating)
- **Hotkey Config**: Assign keyboard shortcuts to toggle console, individual panels, commands

**Presets:** 🎮 Standard Game Console · 🏗️ Level Designer Tools · 🤖 AI Debug Panel · 📈 Performance Monitor · 🎯 QA Tester Kit

**Export:**
- `DebugConsole.cs` — main console MonoBehaviour with command registry
- `DebugCommand.cs` — base class + attribute `[ConsoleCommand("god", "Toggle god mode")]`
- `DebugOverlay.cs` — watch panel + toggle/slider HUD
- `DebugLogViewer.cs` — filterable log capture
- Choice of IMGUI (immediate) or UI Toolkit (retained) rendering

**Tech:** HTML5 Canvas 2D (layout preview), Vanilla JS, ~2,500–3,500 lines

---

## 🎲 #16 — Probability Lab (Loot Table & Random Event Designer)

> Web-based probability and loot drop architecture simulator with Monte Carlo validation.

**Core Features:**
- **Loot Table Builder**: Drag-and-drop item drops, dynamic weight sliders, automatic percentage normalization
- **Nested & Tiered Tables**: Sub-table branches (e.g. Boss Chest → 40% Weapon, 30% Armor, 30% Gem Table)
- **Monte Carlo Simulator**: Run 10,000–100,000 roll simulations instantly with Canvas 2D frequency histograms
- **Pity & Bad-Luck Protection**: Configurable hard/soft pity curves, cumulative probability graphs
- **Fairness & ROI Metrics**: Expected value (EV), standard deviation, median pull counts, cost analysis
- **Rule Evaluators**: Conditional drops (player level, quest state, location modifiers)

**Presets:** 💎 Gacha Banner · ⚔️ Monster Drop Table · 🎰 Slot Machine / Wheel · 🎁 Daily Login Milestone · 🏪 Mystery Lootbox

**Export:**
- `LootTable.cs` ScriptableObject with weighted lottery picker algorithms (Alias Method / CDF)
- `PityTracker.cs` runtime manager
- Drop probability sheet (CSV / JSON)

**Tech:** HTML5 Canvas 2D (charts & distribution graphs), Vanilla JS, ~2,500–3,500 lines

---

## 🔤 #17 — Font & Text FX Workshop (TextMeshPro FX Studio)

> TextMeshPro rich text and runtime vertex animation design laboratory.

**Core Features:**
- **Real-Time Canvas Text Engine**: Live preview of complex multi-layered text animations
- **Vertex Animation Modifiers**: Wave, Shake, Rainbow, Wobble, Bounce, Typewriter, Glitch, Heat Distortion
- **Character-Level Curves**: Curve-controlled per-glyph offset, rotation, scale, alpha, and color ramps
- **Rich Text Tag Composer**: Visual builder for `<color>`, `<size>`, `<voffset>`, `<rotate>`, `<sprite>`, `<mark>` tags
- **Dialogue Typer Simulation**: Pacing controls, punctuation pauses, tag-aware typewriter flow, sound trigger hooks
- **Gradient & Palette Maker**: TMP 4-corner vertex color presets and animated gradient cycles

**Presets:** 🌊 Ocean Wave · 💥 Boss Impact Shake · 🌈 Rainbow Rave · 👻 Spectral Whisper · ⚡ Cyber Glitch · 📜 RPG Scroll Typer

**Export:**
- `TextAnimator.cs` — zero-GC per-vertex TMP mesh deformer MonoBehaviour
- `DialogueTyper.cs` — tag-aware typewriter component
- Formatted TMP rich-text templates with copy-paste readiness

**Tech:** HTML5 Canvas 2D / WebGL text rendering, Vanilla JS, ~3,000–4,000 lines

---

## 📐 #18 — Grid & Formation Planner (Tactical Grid & Unit Formation Designer)

> Strategic grid topology, unit combat formations, and spatial pathfinding visualizer.

**Core Features:**
- **Grid Topology Modes**: Square, Hexagonal (Pointy-topped / Flat-topped), Isometric 2.5D with coordinate converters
- **Formation Architect**: Visual formation layout designer (Line, Column, Wedge, Phalanx, Circle, Custom offsets)
- **A* & Dijkstra Visualizer**: Animated step-by-step pathfinding inspection with node cost heatmaps
- **Flow Field Generator**: Vector directional map generator for large crowd / swarm navigation
- **Obstacle & Cost Painting**: Impassable cells, rough terrain weights (mud, water), directional one-way boundaries
- **Unit Slot Assignment**: Dynamic slot reallocation algorithm when squad members die or change direction

**Presets:** 🏰 Castle Siege Grid · ⚔️ Legion Phalanx · 🏙️ City Builder Road Grid · 🎯 Tower Defense Waypoint Map · 🛸 Swarm Flow Field

**Export:**
- `GridSystem.cs` — coordinate mapping and neighbor calculation utility (axial/cubic hex coordinates)
- `FormationData.cs` ScriptableObject with local squad offsets
- `FlowFieldNavigator.cs` — high-performance crowd movement controller

**Tech:** HTML5 Canvas 2D, Vanilla JS, ~3,500–4,500 lines

---

## 🌅 #19 — Skybox & Atmosphere Studio (Procedural Skybox & Lighting Designer)

> Procedural 3D sky dome, atmospheric Rayleigh/Mie scattering, and day-night lighting system.

**Core Features:**
- **3D Dome Viewport**: Three.js inverted dome shader with real-time solar elevation and azimuth controls
- **Atmospheric Scattering**: Physical Rayleigh (blue sky) and Mie (sun halo / haze) scattering controls
- **Dynamic Cloud Deck**: Multi-layer procedural noise clouds with speed, coverage, thickness, and wind direction
- **Starfield & Celestial Bodies**: Procedural star twinkle, constellations, moon phases, and planetary disks
- **24-Hour Day/Night Loop**: Timeline scrubber mapping sun angle, ambient sky color, fog tint, and shadow intensity
- **Lighting Gradient Generator**: Color over time ramps for Unity directional light, ambient horizon, and fog

**Presets:** 🌅 Golden Hour Sunset · 🌌 Deep Starry Void · ☁️ Overcast Storm · 🌄 Mist Dawn · 🔴 Red Mars Sky · 🟣 Alien Aurora

**Export:**
- Cubemap 6-face texture generator (.PNG downloads)
- `Skybox_URP.shader` — lightweight procedural skybox shader for Universal Render Pipeline
- `DayNightCycle.cs` — light and environment reflections driver script

**Tech:** Three.js (local vendor/), custom GLSL Sky Dome Shader, Vanilla JS, ~3,500–4,500 lines

---

## 📱 #20 — UI Wireframe Studio (Unity Canvas Layout & RectTransform Wireframer)

> Interactive canvas mockup environment designed specifically around Unity's RectTransform rules.

**Core Features:**
- **RectTransform-Accurate Anchors**: Visual anchor presets (top-left, middle-center, stretch-horizontal, full-stretch)
- **Canvas Scaler Preview**: Test dynamic scaling modes (Constant Pixel Size, Scale With Screen Size, Constant Physical Size)
- **Device & Aspect Presets**: 16:9, 19.5:9 (iPhone Dynamic Island / Notch), 16:10, 4:3 iPad, foldable aspect ratios
- **Safe Area Overlay**: Visual hardware cutouts and mobile notch margins with automatic padding calculations
- **Component Toolbox**: Panel, Button, Text, RawImage, Slider, ScrollRect, Toggle, Virtual D-pad
- **Screen Flow Diagram**: Interactive transition state linking (MainMenu → Inventory → PauseModal → GameHUD)

**Presets:** 🎮 Action RPG HUD · 📋 Grid Inventory · 🏪 In-Game Shop · ⚙️ Settings / Audio Matrix · 💬 VN Dialogue Screen

**Export:**
- `CanvasBuilder.cs` — C# editor script that programmatically instantiates the UI hierarchy in Unity
- RectTransform coordinate JSON table
- Screen mockup vector diagram export

**Tech:** HTML5 Canvas 2D / DOM layout sandbox, Vanilla JS, ~3,500–4,500 lines

---

## 🎥 #21 — Cinemachine & Camera Shake Studio (Camera Impulse & Noise Tuner)

> Real-time 3D camera shake laboratory and Cinemachine noise profile designer.

**Core Features:**
- **3D Test Stage**: Three.js interior/exterior scene with movable character, destructible prop, and manual explosion trigger
- **6D Noise Modulation**: Independent position (X, Y, Z) and rotation (Pitch, Yaw, Roll) frequency, octave, and amplitude tuning
- **Non-Linear Trauma Model**: $Trauma^2$ / $Trauma^3$ power curves for realistic camera impulse and decay falloff
- **Camera Behaviors**: Directional Recoil (weapon kickback), Sustained Rumble (earthquake/engine), Impact Shockwave (explosions)
- **Cinemachine 1:1 Parity**: Direct mapping to Unity's `CinemachineNoiseSettings` raw profile channels
- **Live Comparison**: Split-screen or toggle between raw vs smoothed motion

**Presets:** 💥 Heavy Rocket Explosion · 🔫 Shotgun Kickback · 🏎️ Off-Road High Speed · 🚁 Rotor Vibration · 👣 Titan Footstep

**Export:**
- `CinemachineNoiseSettings.asset` serialized profile
- `CameraShake.cs` — zero-dependency standalone camera impulse controller
- Impulse profile JSON configuration

**Tech:** Three.js (local vendor/), Vanilla JS, ~3,000–4,000 lines

---

## 💬 #22 — Narrative Weaver (Dialogue & Quest Branching Tree)

> Node-based branching dialogue, quest condition graph, and narrative state editor.

**Core Features:**
- **Node Graph Canvas**: Dialogue nodes, player choice forks, condition gates, event broadcast nodes
- **Localization Studio Integration**: Direct binding to SKCore Localization Studio text keys (`KEY_NPC_GREET`)
- **Condition & Variable Guards**: Flexible state gates (`gold >= 50`, `hasItem("Key")`, `questState == Completed`)
- **Portraits & Expressions**: Character avatar switching with emotional tags (Neutral, Angry, Joy, Surprised)
- **Interactive Playtest Simulator**: In-browser visual novel preview pane allowing direct playtesting of dialogue paths
- **Branch Validation Engine**: Dead-end detection, circular loop warnings, untranslated key alerts

**Presets:** 🧙 RPG Quest Giver · 🏪 Haggling Merchant · 🔍 Detective Interrogation · 📜 Visual Novel Route Fork

**Export:**
- `DialogueGraph.json` serialized node tree
- `DialogueRunner.cs` — lightweight runtime dialogue interpreter MonoBehaviour
- `QuestTrackerBridge.cs` — event dispatcher for quest goals

**Tech:** HTML5 Canvas 2D (node graph) + DOM preview, Vanilla JS, ~3,500–4,500 lines

---

## 🥊 #23 — Combat Hitbox & Frame Data Studio (Action Combat Timing Animator)

> Frame-by-frame hitbox, hurtbox, and combat frame data timing editor.

**Core Features:**
- **60 FPS Timeline Scrubber**: Clear visual breakdown of **Startup**, **Active**, and **Recovery** frame windows
- **Multi-Layer Box Painting**: 🟢 Hurtbox (vulnerable), 🔴 Hitbox (damage), 🔵 I-Frames (invincible), 🟡 Pushbox (collision)
- **Combat Property Attachment**: Damage value, hitstun duration, blockstun, hitstop freeze frames, camera shake magnitude
- **Knockback Vector Gizmo**: Visual 2D/3D arrow defining launch direction, angle, and force
- **Audio & Particle Cues**: Bind SFX triggers (from SFX Lab) and VFX spawn points (from Slash Forge) directly to specific frames
- **Combo String Linking**: Chain multiple attack profiles (Light 1 → Light 2 → Heavy Finisher) with cancel windows

**Presets:** 🗡️ 3-Hit Katana Combo · 🥋 Dragon Uppercut · 🛡️ Shield Perfect Parry · 💨 Dodge Roll I-Frames · 🔨 Heavy Hammer Slam

**Export:**
- `AttackFrameData.cs` ScriptableObject with exact frame window definitions
- `HitboxManager.cs` — zero-GC runtime overlap checker and damage dispatcher
- Frame data reference cheat-sheet (Markdown / JSON)

**Tech:** HTML5 Canvas 2D + Three.js hybrid preview, Vanilla JS, ~3,500–4,500 lines

---

## 🧊 #24 — Low-Poly Sculptor & Mesh Deformer (Procedural Mesh & Vertex Painter)

> In-browser low-poly 3D modeling, algorithmic deformation, and vertex color mask painter.

**Core Features:**
- **Primitive Generators**: Cube, Sphere, Cylinder, Capsule, Torus, Cone with adjustable subdivisions
- **Parametric Deformers**: Taper, Twist, Bend, Bulge, Noise Displace (Perlin vertex offset)
- **Vertex Color Mask Painting**: Paint RGB channels directly on 3D vertices (R=wind bend weight, G=emissive glow, B=wetness/dirt)
- **Boolean & Slicing**: Basic CSG operations (subtract door opening from wall, union modular props)
- **Surface Diagnostics**: Polygon & triangle budget counters, hard edge / smooth normal recalculations
- **Wireframe & PBR Preview**: Real-time lighting inspection with material roughness/metallic sliders

**Presets:** 🌲 Stylized Pine Tree · 🪨 Fantasy Crystal Shard · ⚔️ Low-Poly Dagger Draft · 🏰 Dungeon Archway

**Export:**
- Standard `.obj` 3D model download
- `ProceduralMesh.cs` — Unity runtime mesh generator constructing vertex, triangle, UV, and vertex color arrays
- Vertex color palette configuration

**Tech:** Three.js (local vendor/), CSG operations, Vanilla JS, ~4,000–5,000 lines

---

## 🎧 #25 — Audio Mixer & Ambience Orchestrator (Dynamic Music Stems & Snapshots)

> Dynamic interactive soundscape designer with multi-stem music mixing and audio snapshot transitions.

**Core Features:**
- **Multi-Stem Player**: Real-time synchronized playback of Drums, Bass, Melody, and Ambient stems
- **Dynamic Transition Matrix**: Smooth volume crossfading across combat intensity states (Exploration → Tension → Combat)
- **Ducking Simulation**: Automatic audio ducking curves when dialogue, explosions, or UI sounds play
- **Spatial Falloff Visualizer**: Visual 3D falloff curves (Logarithmic vs Linear vs Custom) with listener distance slider
- **Snapshot Presets**: Design audio mixer snapshots (Normal, PauseMenu, Underwater muffled filter, LowHealth heartbeat)
- **DSP Effect Preview**: Web Audio lowpass filtering, reverb sends, and master compression simulation

**Presets:** ⚔️ Exploration to Boss Battle Dynamic Stems · 🌊 Underwater Submersion · 🧟 Survival Horror Tension Layers

**Export:**
- `AudioMixerController.cs` — Unity AudioMixer snapshot blending and exposed parameter controller
- `DynamicMusicPlayer.cs` — sample-accurate stem synchronizer MonoBehaviour
- Soundscape balance profile JSON

**Tech:** Web Audio API (multi-track gain/filter nodes), HTML5 Canvas 2D, Vanilla JS, ~3,000–4,000 lines

---

## 🏰 #26 — Procedural Dungeon & WFC Architect (Dungeon & Level Generator)

> Real-time procedural dungeon laboratory supporting BSP, Cellular Automata, and Wave Function Collapse.

**Core Features:**
- **Algorithm Sandbox**: Binary Space Partitioning (BSP), Drunkard's Walk (caves), Cellular Automata, Wave Function Collapse (tile adjacency constraints)
- **Sanity & Connectivity Verification**: Automated flood fill validation ensuring start-to-exit pathing and no unreachable isolated rooms
- **Room & Corridor Architect**: Configurable room aspect ratios, corridor carving thickness, loop percentage, dead-end pruning
- **Deterministic Seed Engine**: Reproduce and debug edge cases with explicit numerical seeds (e.g. `seed = 4829104`)
- **Key & Lock Dependency Graph**: Place locks, keys, puzzle doors, boss rooms, and treasure vaults with progression solvability checks
- **Spawn Layering**: Markers for player spawn, patrol paths, chest tiers, trap locations, enemy encounter zones

**Presets:** 🏰 Classic Rogue Dungeon · 🪨 Organic Cave Network · 🏛️ Ancient Catacombs · 🚀 Sci-Fi Space Hulk · 🌿 Overworld Hedge Maze

**Export:**
- `DungeonGenerator.cs` — zero-GC runtime level generator with pre-allocated arrays
- Prefab & Tilemap coordinate matrix JSON
- ASCII / 2D map preview export

**Tech:** HTML5 Canvas 2D / WebGL grid renderer, Vanilla JS, ~4,000–5,500 lines

---

## 🪨 #27 — PBR Texture Baker & Seamless Normal Lab (PBR Map Studio)

> Browser-based seamless tiling converter, normal map synthesizer, and PBR material pack generator.

**Core Features:**
- **Seamless Texture Tiler**: Offset seam wrapping with Poisson and gradient blending to eliminate tiling repetition seams
- **Height-to-Normal Synthesis**: Sobel filter matrix converting height/albedo to tangent-space Normal Maps (depth, blur, invert Y for DirectX/OpenGL)
- **Roughness & Smoothness Extractor**: Contrast curves, thresholding, and inverted channel modes for Unity URP Lit shaders
- **Ambient Occlusion (AO) Generator**: SSAO-like cavity shadow estimation generating micro-shadowing maps
- **PBR 3D Stage**: Real-time Three.js sphere/cube preview with rotatable light source, roughness slider, and metallic reflections
- **Channel Packing Utility**: Combine maps into standard Unity URP MaskMap format (R = Metallic, G = AO, B = Detail, A = Smoothness)

**Presets:** 🧱 Cobblestone Wall · 🪵 Rough Wood Bark · 🪨 Mossy Rock Face · ⚙️ Sci-Fi Metal Plate · 🏜️ Cracked Mud

**Export:**
- 4-channel texture set: `_Albedo.png`, `_Normal.png`, `_Roughness.png`, `_AO.png`
- Packed URP `_MaskMap.png`
- Material import helper C# script with texture import settings (Normal Map flag, sRGB toggle)

**Tech:** Three.js (local vendor/), HTML5 Canvas 2D image processing, Vanilla JS, ~3,000–4,000 lines

---

## 🦴 #28 — Ragdoll & Joint Physics Calibrator (Physics Joint Studio)

> Interactive 3D ragdoll joint constraint editor, angle limit visualizer, and damping tuner.

**Core Features:**
- **3D Humanoid Skeleton Stage**: Three.js mannequin visualizing Pelvis, Spine, Head, Arms, and Legs with colliders and joint pivots
- **Angular Constraint Cones**: Visual representation of `CharacterJoint` / `ConfigurableJoint` twist, swing 1, and swing 2 angle limits
- **Damping & Spring Calibration**: Eliminate physics jitter and joint explosion with real-time stiffness, spring restitution, and damping sliders
- **Interactive Stress Testing**: Drag-and-drop mouse ragdoll throw, gravity drop, explosive force impulses, and wind tunnel tests
- **Mass Distribution Auto-Balancer**: Realistic anatomical mass percentages (Head: ~8%, Torso: ~45%, Arms: ~12%, Legs: ~35%)
- **Hinge vs Ball-and-Socket**: Preconfigured joint topologies for knees/elbows (hinge) vs shoulders/hips (spherical)

**Presets:** 🧍 Standard Humanoid · 🧟 Stiff Zombie · 🤸 Flexible Acrobat · 🤖 Heavy Armored Golem · 💀 Loose Skeleton

**Export:**
- `RagdollSetup.cs` — Unity Editor script configuring `Rigidbody`, `CapsuleCollider`, and `CharacterJoint` components automatically
- Joint limit parameter JSON
- Ragdoll bone hierarchy reference

**Tech:** Three.js (local vendor/), Cannon.js / custom lightweight constraint solver, Vanilla JS, ~3,500–4,500 lines

---

## 🐟 #29 — Boids & Flocking Swarm Lab (Steering Behaviors Sandbox)

> Real-time flocking, crowd steering behaviors, and autonomous agent simulation sandbox.

**Core Features:**
- **Core Flocking Rules**: Real-time sliders for Craig Reynolds' **Separation**, **Alignment**, and **Cohesion** forces
- **Secondary Steering Forces**: Seek (target), Flee (predator), Wander (organic noise), Obstacle Avoidance (forward raycasts)
- **High-Capacity Simulation**: 500+ autonomous agents running at 60 FPS in 2D Canvas or 3D Three.js
- **Perception Cones**: Visual field-of-view (FOV cone) and neighbor detection radius overlays
- **Leader & Predator Dynamics**: Introduce controllable leader boids or hunting predator agents that scatter the flock
- **Boundary Modes**: Toroidal wrap-around, bouncing bounding box, or soft spherical repulsion boundary

**Presets:** 🐦 Bird Flock · 🐟 School of Fish · 🧟 Zombie Swarm · 🚀 Starfighter Fleet · 🐜 Insect Cloud

**Export:**
- `BoidManager.cs` + `BoidAgent.cs` — zero-GC Unity C# implementation (or DOTS / Jobs-ready Burst variant)
- Steering behavior ScriptableObject presets
- Flocking tuning parameter JSON

**Tech:** Three.js / HTML5 Canvas 2D, spatial partitioning (grid hashing), Vanilla JS, ~3,000–4,000 lines

---

## 🎮 #30 — Input Action Map Architect (Unity New Input System Designer)

> Visual action map designer, composite binding generator, and input processor configurator.

**Core Features:**
- **Action Map Organization**: Create maps (`Player`, `UI`, `Vehicle`, `Spectator`) and actions (`Move`, `Jump`, `Fire`, `Look`)
- **Cross-Platform Device Bindings**: Keyboard/Mouse, Xbox Controller, DualSense/PS5, Touchscreen Virtual Sticks
- **Composite Bindings**: 2D Vector (WASD / D-Pad), 1D Axis (Triggers L2/R2), Button with One Modifier (Shift + W = Sprint)
- **Processors & Interactions**: Deadzone curves, Normalize, Invert Y, Hold duration (charge attacks), Tap vs Multi-tap
- **Virtual Controller Tester**: On-screen interactive gamepad & keyboard visualizer showing active inputs in real-time
- **Type-Safe Wrapper Generator**: Generates clean C# interfaces (`IPlayerActions`) and event dispatchers without stringly-typed lookups

**Presets:** 🕹️ Standard FPS / TPS · 🏎️ Racing Vehicle · ⚔️ 2D Metroidvania · 📱 Mobile Action RPG · 🎯 RTS Command / Mouse

**Export:**
- Clean `InputReader.cs` ScriptableObject architecture
- `IPlayerActions` C# interface contract
- Standard Unity `.inputactions` JSON asset

**Tech:** HTML5 Canvas 2D / DOM controller visualizer, Vanilla JS, ~3,000–4,000 lines


