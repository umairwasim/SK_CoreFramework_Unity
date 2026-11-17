# 🛤️ Spline & Path Studio

> Web-based 3D spline/path editor for Unity — design camera rails, movement paths, and procedural placement curves with real-time 3D preview.

---

## Overview

An interactive 3D path design tool built on Three.js. Create, edit, and visualize splines in a 3D viewport with intuitive gizmo controls. Export paths as Unity Spline package data, custom C# followers, or raw point arrays.

---

## Core Features

### 📐 Spline Types
| Type | Math | Use Case |
|------|------|----------|
| **Cubic Bézier** | Cubic Bézier segments with independent tangent handles | Camera rails, precise art-directed paths |
| **Catmull-Rom** | Centripetal parameterization, passes through all points | Smooth organic paths, rivers, roads |
| **B-Spline** | Uniform B-spline, smooth approximation | Track layouts, interpolation curves |
| **Linear** | Point-to-point straight segments | Waypoint paths, grid-based movement |

### 🎯 Control Point Editing
- **3D Gizmos**: Translate (XYZ arrows + plane squares) per control point
- **Handle Modes**:
  - 🔗 **Smooth (Aligned)**: Tangent handles mirror each other for C1 continuity
  - 📐 **Corner (Broken)**: Independent handle control for sharp turns
  - ⚡ **Auto**: Automatic tangent computation from neighboring points
- **Operations**: Add (double-click), Delete (right-click/Del), Insert (click on curve)
- **Multi-select**: Ctrl+Click or marquee selection for batch transforms
- **Snap**: Grid snap toggle with configurable step size
- **Closed Loop**: Toggle start→end connection for circular paths

### 🔬 Path Analysis & Sampling
- **Arc-Length Parameterization**: Uniform distance sampling regardless of control point density
- **Curvature Visualization**: Color-coded curve overlay (blue=straight → red=sharp turn)
- **Distance Markers**: Configurable interval distance labels along path
- **Total Length**: Real-time path length calculation display
- **Tangent / Normal / Binormal**: TNB frame visualization at any point

### 🎥 Path Follower Preview
- **Animated Preview Object**: Sphere/cube/arrow travels along path in real-time
- **Speed Curve**: Velocity over normalized path position (reuse GameFeel curve editor)
- **Look-At Modes**:
  - Forward tangent (default)
  - Fixed target point
  - Custom offset rotation
- **Easing**: Start/end acceleration curves
- **Ping-Pong / Loop / Once**: Playback mode selector

### 📐 Path Tools
| Tool | Description |
|------|-------------|
| **Mirror** | Mirror path across X, Y, or Z axis |
| **Reverse** | Flip path direction |
| **Subdivide** | Add midpoints to refine curve |
| **Simplify** | Remove redundant points (RDP algorithm) |
| **Offset** | Create parallel path at fixed distance |
| **Distribute** | Space selected points evenly |
| **Project to Ground** | Raycast points down to Y=0 plane |

### 🎮 Use Case Templates
| Template | Description |
|----------|-------------|
| 🎥 **Camera Dolly Rail** | Smooth orbital camera path with look-at target |
| 🏎️ **Race Track** | Closed loop with banking data |
| 🚂 **Train Route** | Multi-stop station path with pause points |
| ⚔️ **Projectile Arc** | Parabolic trajectory with gravity |
| 🌊 **River/Road** | Flowing path with width variation data |
| 🏗️ **Procedural Placement** | Scatter points along path (trees, fences, lights) |
| 🎢 **Roller Coaster** | 3D helix with roll/bank angles |

### 🖼️ Viewport Features
- OrbitControls (rotate/zoom/pan)
- Multiple camera presets: Perspective, Top (XZ), Front (XY), Side (YZ)
- Reference grid + axis indicator
- Scene backdrops: Void, Studio, Gradient
- Point size / line thickness controls

---

## Unity Export System

### Tab A: `SplineData.json`
```json
{
  "type": "catmull-rom",
  "closed": false,
  "points": [
    { "position": [0, 0, 0], "tangentIn": [...], "tangentOut": [...] }
  ],
  "totalLength": 45.7
}
```

### Tab B: `SplineFollower.cs`
```csharp
// MonoBehaviour that moves transform along exported spline
// Supports speed curve, look-at, loop/pingpong/once modes
public class SplineFollower : MonoBehaviour { ... }
```

### Tab C: `SplinePath.cs`
```csharp
// Pure C# spline evaluator — no MonoBehaviour dependency
// GetPoint(t), GetTangent(t), GetLength(), GetUniformPoint(distance)
public class SplinePath { ... }
```

### Tab D: `SplineGizmoDrawer.cs`
```csharp
// Editor-only gizmo drawer for visualizing path in Scene view
// Draws control points, tangent handles, and sampled curve
[ExecuteInEditMode]
public class SplineGizmoDrawer : MonoBehaviour { ... }
```

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| 3D Engine | Three.js (local vendor/) |
| Spline Math | CatmullRomCurve3, CubicBezierCurve3 (Three.js built-in + custom) |
| Gizmos | Custom TransformControls-style raycasted handles |
| Speed Curve | Reuse GameFeel Lab curve editor component |
| UI Framework | Vanilla JS + Custom CSS |

---

**Estimated Complexity**: ~3,000–4,000 lines
**Priority**: ⭐⭐ Medium (complements Verlet Studio 3D workflow)
