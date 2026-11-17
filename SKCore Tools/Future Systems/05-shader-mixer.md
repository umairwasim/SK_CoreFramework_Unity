# 🎨 Shader Mixer

> Web-based visual shader prototyping tool for Unity — node graph editor with real-time GLSL preview and URP HLSL export.

---

## Overview

A lightweight visual shader editor inspired by Unity Shader Graph but running entirely in the browser. Build shader logic by connecting nodes on a canvas, see instant GLSL preview on 3D meshes, and export production-ready URP HLSL shader files.

---

## Core Features

### 🔌 Node Graph Editor

#### Input Nodes
| Node | Output | Description |
|------|--------|-------------|
| **UV** | vec2 | Mesh UV coordinates (Channel 0/1) |
| **Position** | vec3 | Object / World / View space position |
| **Normal** | vec3 | Object / World space normal |
| **View Direction** | vec3 | Camera to fragment direction |
| **Time** | float | `_Time.y`, `sin(_Time.y)`, `cos(_Time.y)` |
| **Screen Position** | vec4 | Screen-space coordinates |
| **Vertex Color** | vec4 | Per-vertex color attribute |
| **Custom Float** | float | User-defined uniform (Inspector slider) |
| **Custom Color** | vec4 | User-defined color picker uniform |
| **Custom Texture** | sampler2D | User-uploadable texture uniform |

#### Math Nodes
| Node | Description |
|------|-------------|
| Add, Subtract, Multiply, Divide | Basic arithmetic |
| Lerp, InverseLerp, Remap | Interpolation |
| Step, Smoothstep | Threshold functions |
| Clamp, Saturate, Abs, Negate | Range operations |
| Power, Sqrt, Log | Exponential functions |
| Floor, Ceil, Round, Frac | Rounding |
| Min, Max | Comparison |
| Dot, Cross | Vector operations |
| Length, Normalize, Distance | Vector magnitude |
| Sin, Cos, Tan | Trigonometric |

#### Texture Nodes
| Node | Description |
|------|-------------|
| **Sample Texture 2D** | tex2D with UV input |
| **Tiling & Offset** | UV scale and translation |
| **Panner** | Animated UV scrolling (Time-based) |
| **Rotate UV** | UV rotation around pivot |
| **Flipbook** | Sprite sheet UV animation |
| **Triplanar** | World-space projection (no UV needed) |
| **Normal Unpack** | Decode normal map |

#### Color Nodes
| Node | Description |
|------|-------------|
| **Blend** | Screen, Overlay, Multiply, Add, Soft Light blend modes |
| **HSV Adjust** | Hue shift, saturation, value |
| **Contrast** | Adjustable contrast |
| **Channel Mixer** | Remap RGB channels |
| **Gradient** | Multi-stop color ramp with position input |
| **Posterize** | Reduce color steps (cel-shading) |
| **Replace Color** | Selective color replacement (tolerance range) |

#### Effect Nodes (High-Level)
| Node | Description |
|------|-------------|
| **Fresnel** | Edge glow based on view angle |
| **Dissolve** | Noise-based dissolution with edge emission |
| **Distortion** | Screen-space distortion (refraction/heat haze) |
| **Voronoi** | Procedural Voronoi noise (cells/distance) |
| **Simplex Noise** | 2D/3D smooth noise |
| **Gradient Noise** | Perlin-style noise |
| **Checkerboard** | Procedural UV pattern |
| **Polar Coordinates** | UV → polar transform |
| **Parallax Mapping** | Height-based UV offset |

#### Output Nodes
| Output | Shader Model |
|--------|-------------|
| **Unlit Master** | Base Color, Alpha, Alpha Clip |
| **Lit Master (PBR)** | Albedo, Normal, Metallic, Smoothness, Emission, AO, Alpha |

### 🖼️ Real-Time 3D Preview
- **Preview Meshes**: Sphere, Cube, Cylinder, Plane, Torus, Custom .OBJ upload
- **Environment**: HDRI-style gradient environment for PBR reflection
- **Rotate / Zoom**: OrbitControls
- **Split View**: Node graph (left) + 3D preview (right), resizable splitter

### 🎮 Shader Template Library
| Template | Description |
|----------|-------------|
| 🔥 **Dissolve** | Noise dissolve with glowing edge |
| 🛡️ **Fresnel Shield** | View-angle glow force field |
| 🌊 **Water Surface** | Animated UV distortion + depth fade |
| ❄️ **Ice / Frost** | Fresnel + noise overlay + blue tint |
| 👻 **Hologram** | Scan lines + flicker + rim glow |
| ⚡ **Force Field** | Intersection highlight + hex pattern |
| 🎯 **Hit Flash** | Emission pulse on damage |
| 🌈 **Iridescent** | View-angle hue shift (soap bubble) |
| 💎 **Crystal / Gem** | Refraction + internal reflection |
| 🔮 **Portal** | Swirling vortex + edge distortion |

### 🔗 Node Graph UX
- Drag from output port → input port to connect
- Type-safe connections (float ↔ float, vec2 ↔ vec2, auto-promotion float→vec3)
- Color-coded port types (gray=float, green=vec2, blue=vec3, purple=vec4, pink=texture)
- Node search command palette (Ctrl+Space or `/`)
- Group nodes with comment frames
- Preview any intermediate node (right-click → Preview)

---

## Unity Export System

### Tab A: `CustomShader_URP.shader`
```hlsl
Shader "SKCore/CustomShader"
{
    Properties { ... }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" }
        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            ...
            ENDHLSL
        }
    }
}
```

### Tab B: `ShaderProperties.cs`
```csharp
// MonoBehaviour for runtime shader property control
// Exposes all custom uniforms as serialized fields
public class ShaderProperties : MonoBehaviour
{
    [SerializeField] Material _targetMaterial;
    [SerializeField, Range(0, 1)] float _dissolveAmount;
    ...
}
```

### Tab C: Graph JSON
```json
{
  "nodes": [...],
  "connections": [...],
  "properties": [...],
  "outputMode": "unlit"
}
```

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| 3D Preview | Three.js (local vendor/) with ShaderMaterial |
| Node Canvas | HTML5 Canvas 2D (custom graph renderer) |
| GLSL Compiler | Real-time graph → GLSL fragment shader transpiler |
| HLSL Exporter | GLSL → URP HLSL transpiler (syntax mapping) |
| UI Framework | Vanilla JS + Custom CSS |

---

## Technical Challenges

> [!IMPORTANT]
> This is the most technically complex tool in the suite. Key challenges:
> 1. **Real-time GLSL compilation** from node graph changes
> 2. **GLSL → HLSL transpilation** for Unity URP export
> 3. **Type system** enforcement across node connections
> 4. **Graph layout** algorithm for readable auto-arrangement

---

**Estimated Complexity**: ~5,000–7,000 lines
**Priority**: ⭐⭐ Medium (highest impact but most complex to build)
