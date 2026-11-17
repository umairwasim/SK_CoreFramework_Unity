# 🧠 State Machine Forge

> Web-based visual Finite State Machine (FSM) & Behavior Tree editor for Unity — drag-and-drop nodes with C# export.

---

## Overview

A dual-mode visual logic editor that lets Unity developers design gameplay state machines and AI behavior trees using an intuitive node graph canvas. Features real-time simulation/debugging and generates clean, dependency-free C# code.

---

## Core Features

### 📐 Mode A: Finite State Machine (FSM)

#### Node Types
| Node | Color | Purpose |
|------|-------|---------|
| **Entry** | 🟢 Green | Starting state (exactly one per graph) |
| **State** | 🔵 Blue | Named state with OnEnter / OnUpdate / OnExit callbacks |
| **Any State** | 🟡 Yellow | Global transitions (like Animator AnyState) |
| **Exit** | 🔴 Red | Terminal state (optional) |
| **Sub-FSM** | 🟣 Purple | Nested state machine reference |

#### Transitions
- Directional arrow connections between states
- **Condition System**: Parameter-based guards
  - Bool: `isGrounded == true`
  - Float: `health < 0.2`
  - Int: `ammoCount == 0`
  - Trigger: `onHitTrigger` (auto-resets)
- **Transition Settings**: Exit time, transition duration, can interrupt self
- **Priority Ordering**: Drag to reorder when multiple transitions exist

#### Parameters Panel
- Add/remove typed parameters (Bool, Int, Float, Trigger)
- Default values and descriptions
- Maps directly to C# enum or dictionary

### 🌳 Mode B: Behavior Tree

#### Node Types
| Node | Symbol | Purpose |
|------|--------|---------|
| **Root** | ◆ | Single entry point |
| **Selector** | ? | Runs children until one succeeds (OR logic) |
| **Sequence** | → | Runs children until one fails (AND logic) |
| **Parallel** | ⇉ | Runs all children simultaneously |
| **Decorator** | ◇ | Modifies child (Inverter, Repeater, Cooldown, Probability) |
| **Action Leaf** | ■ | Executes game logic (MoveTo, Attack, Wait, PlayAnimation) |
| **Condition Leaf** | ● | Checks world state (IsEnemyNear, HasAmmo, IsHealthLow) |

#### Decorator Library
- **Inverter**: Flips Success ↔ Failure
- **Repeater**: Loops N times or until fail
- **Cooldown**: Blocks re-entry for N seconds
- **Probability**: Random gate (0–100%)
- **Timeout**: Fails after N seconds

### 🎬 Real-Time Simulation
- **Step Mode**: Click-to-advance frame-by-frame execution
- **Auto Mode**: Continuous simulation at configurable speed
- **Visual Feedback**:
  - 🟢 Active state/node highlighted with glow animation
  - 🔵 Transition arrows animate flow direction
  - 🔴 Failed conditions flash red
  - ⚪ Inactive nodes dimmed
- **Parameter Inspector**: Live-edit parameter values during simulation
- **Execution Log**: Timestamped history of state changes and transitions

### 📋 Canvas Features
- Drag-and-drop node placement
- Snap-to-grid with configurable grid size
- Multi-select (Ctrl+Click or marquee)
- Copy/Paste/Duplicate node groups
- Auto-layout (horizontal tree / vertical list)
- Zoom (scroll wheel) + Pan (middle mouse / Space+drag)
- Minimap overview panel
- Undo/Redo stack (Ctrl+Z / Ctrl+Y)

### 🎮 Template Library (One-Click)
| Template | Type | Description |
|----------|------|-------------|
| 🤖 Enemy Patrol AI | BT | Patrol → Detect → Chase → Attack → Return |
| 🎮 Player Controller | FSM | Idle → Run → Jump → Fall → Land → Dash → Attack |
| 🚪 Door System | FSM | Locked → Unlocking → Opening → Open → Closing → Closed |
| 📋 Quest Tracker | FSM | Available → Active → Objective Progress → Complete → Reward |
| 💬 Dialogue System | FSM | Idle → Speaking → WaitChoice → Branch → Exit |
| 🏪 Shop NPC | BT | Greet → ShowInventory → Transaction → Farewell |
| 🧟 Zombie Horde AI | BT | Wander → Detect → Swarm → Attack → Stunned → Recover |

---

## Unity Export System

### Tab A: `StateMachine.cs`
```csharp
// Generic reusable FSM engine — zero MonoBehaviour dependency
// Can be used in Update(), FixedUpdate(), or any tick context
public class StateMachine<TState> where TState : Enum { ... }
```

### Tab B: Per-State Classes
```csharp
// Individual IState implementations with OnEnter/OnUpdate/OnExit
public class PlayerIdleState : IState { ... }
public class PlayerRunState : IState { ... }
```

### Tab C: `BehaviorTree.cs`
```csharp
// Lightweight BT runtime with Selector/Sequence/Parallel
// Status enum: Running, Success, Failure
public class BehaviorTree { ... }
```

### Tab D: Graph JSON
```json
{
  "type": "fsm",
  "states": [...],
  "transitions": [...],
  "parameters": [...]
}
```

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Graph Canvas | HTML5 Canvas 2D (custom node renderer) |
| Connection Lines | Bézier curves with animated flow particles |
| Layout Algorithm | Dagre-style hierarchical layout (vanilla JS) |
| UI Framework | Vanilla JS + Custom CSS |
| Persistence | localStorage + JSON file import/export |

---

**Estimated Complexity**: ~4,000–5,000 lines
**Priority**: ⭐⭐⭐ High (fills gameplay logic gap)
