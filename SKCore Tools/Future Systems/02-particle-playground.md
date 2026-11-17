# ✨ Particle Playground

> Web-based visual particle system designer for Unity — real-time 3D preview with C# export.

---

## Overview

A comprehensive particle effect design tool with Three.js GPU-instanced rendering. Visually configure Unity ParticleSystem modules in real-time, preview results in a 3D viewport, and export production-ready C# configuration scripts.

---

## Core Features

### 🎆 Particle Renderer (Three.js)
- **GPU Instancing**: `InstancedBufferGeometry` for 10,000+ particles at 60fps
- **Billboard Modes**: Camera-facing quad, stretched billboard, horizontal/vertical, mesh particles
- **Blend Modes**: Additive glow, alpha blend, premultiplied alpha
- **Texture Atlas**: Support for sprite sheet animation (rows × columns)

### 📦 Emitter Shapes
| Shape | Parameters |
|-------|-----------|
| **Cone** | Angle, radius, arc, emit from (base/volume/shell) |
| **Sphere** | Radius, hemisphere ratio, emit from (surface/volume) |
| **Box** | Width, height, depth, emit from (surface/volume/edge) |
| **Circle** | Radius, arc, edge only toggle |
| **Edge** | Length, direction |
| **Mesh** | Upload .OBJ, emit from vertices/triangles/edges |

### 🔄 Lifetime Modules (Each with Curve Editor)
- **Velocity Over Lifetime**: Linear velocity + orbital velocity + speed modifier curve
- **Color Over Lifetime**: Multi-stop gradient editor (RGBA) matching Unity Gradient
- **Size Over Lifetime**: MinMaxCurve with random-between-two-curves support
- **Rotation Over Lifetime**: Angular velocity (Z or 3D XYZ)
- **Noise Module**: Perlin turbulence (strength, frequency, scroll speed, octaves)
- **Force Over Lifetime**: Gravity, wind, custom directional force
- **Limit Velocity**: Speed limit with damping factor

### 💥 Sub-Emitters
- On Birth, On Death, On Collision sub-particle triggers
- Recursive particle spawning (e.g., firework → sparks → smoke)

### 🎨 Visual Composition
- **Layer Stack**: Up to 4 particle layers composited together
- **Scene Backdrop**: Dark Void, Studio Floor, Skybox gradient
- **Reference Grid**: Scale reference with metric units
- **Slow Motion**: 0.1× – 1.0× playback speed slider

### 🎮 Effect Presets (One-Click)
| Category | Effects |
|----------|---------|
| **Fire & Smoke** | Torch Flame, Campfire, Chimney Smoke, Fire Trail |
| **Magic** | Healing Aura, Magic Missile, Spell Circle, Portal Vortex |
| **Weather** | Rain, Snow, Fog, Dust Motes, Fireflies |
| **Combat** | Blood Splatter, Hit Sparks, Muzzle Flash, Arrow Trail |
| **Environment** | Waterfall Mist, Falling Leaves, Rising Embers, Bubble Stream |
| **Sci-Fi** | Engine Thrust, Shield Hit, Energy Beam, Data Particles |

---

## Unity Export System

### Tab A: `ParticleConfig.cs`
```csharp
// MonoBehaviour that fully configures a ParticleSystem at runtime
// Every module parameter mapped 1:1 from web editor values
public class ParticleConfig : MonoBehaviour
{
    void ConfigureSystem(ParticleSystem ps) { ... }
}
```

### Tab B: `ParticlePreset.asset` (ScriptableObject)
```csharp
// Serializable preset for hot-swapping effects at runtime
[CreateAssetMenu(menuName = "SKCore/Particle Preset")]
public class ParticlePreset : ScriptableObject { ... }
```

### Tab C: Params JSON
```json
{
  "emission": { "rateOverTime": 50, "bursts": [...] },
  "shape": { "type": "cone", "angle": 25 },
  "colorOverLifetime": { "gradient": {...} }
}
```

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| 3D Engine | Three.js (local vendor/) with InstancedMesh |
| Curve Editor | Reuse GameFeel Lab MinMaxCurve engine |
| Gradient Editor | Canvas 2D multi-stop color picker |
| UI Framework | Vanilla JS + Custom CSS |
| Persistence | localStorage for user presets |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause / Restart |
| `R` | Reset emitter |
| `G` | Toggle grid |
| `B` | Toggle backdrop |
| `1-4` | Select particle layer |
| `S` | Screenshot capture |

---

**Estimated Complexity**: ~3,500–4,500 lines
**Priority**: ⭐⭐⭐ High (natural companion to Slash Forge VFX)
