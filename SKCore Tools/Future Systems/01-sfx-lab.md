# 🔊 Procedural SFX Lab

> Web-based procedural sound effect generator for Unity game development.

---

## Overview

A real-time audio synthesis workstation that generates game-ready sound effects using Web Audio API oscillators, noise generators, and DSP effect chains. Designed for rapid prototyping — create placeholder or production-quality SFX without purchasing asset packs.

---

## Core Features

### 🎛️ Synthesis Engine
- **Oscillators**: Sine, Square, Sawtooth, Triangle with detune & phase control
- **Noise Generators**: White, Pink, Brown noise for impacts, explosions, wind
- **ADSR Envelope**: Attack, Decay, Sustain, Release with visual curve editor
- **Pitch Sweep**: Start/end frequency with customizable easing curve
- **Vibrato & Tremolo**: Rate + depth modulation for organic feel

### 🔗 Effect Chain (Drag-Reorderable)
- Low-Pass / High-Pass / Band-Pass Filter (resonance Q control)
- Bit Crusher (sample rate reduction + bit depth)
- Distortion / Overdrive / Waveshaper
- Delay (time, feedback, wet/dry mix)
- Reverb (convolution-based room simulation)
- Compressor (threshold, ratio, knee, attack, release)
- Stereo Panner

### 📊 Real-Time Visualization
- **Waveform Display**: Canvas oscilloscope showing generated waveform
- **Frequency Spectrum**: FFT analyzer bar graph
- **ADSR Curve**: Interactive envelope shape editor
- **Pitch Timeline**: Frequency over time graph

### 🎮 Category Presets (One-Click)
| Category | Presets |
|----------|---------|
| **Combat** | Sword Slash, Shield Block, Arrow Fly, Explosion, Magic Cast |
| **Movement** | Footstep (Stone/Grass/Wood), Jump, Land, Dash, Swim |
| **UI/UX** | Button Click, Menu Open, Notification, Error, Success, Coin |
| **Environment** | Wind Gust, Thunder, Rain Drop, Fire Crackle, Water Splash |
| **Sci-Fi** | Laser Shot, Energy Shield, Teleport, Power Up, Alarm |
| **8-Bit Retro** | Retro Jump, Retro Shoot, Retro Pickup, Retro Death |

### 🎚️ Randomizer / Mutation
- **Mutate Button**: Randomly varies ±15% of current parameters for organic variation
- **Lock Parameters**: Pin specific values while mutating others
- **Batch Generate**: Create 5-10 variations of same SFX for runtime randomization

---

## Unity Export System

### Tab A: `SfxConfig.cs`
```csharp
// ScriptableObject containing all synth parameters
// Drag-and-drop in Inspector for designer tweaking
[CreateAssetMenu(menuName = "SKCore/SFX Config")]
public class SfxConfig : ScriptableObject { ... }
```

### Tab B: `ProceduralSfx.cs`
```csharp
// Runtime procedural audio generator using AudioSource.clip
// Zero-allocation ring buffer synthesis matching web preview 1:1
public class ProceduralSfx : MonoBehaviour { ... }
```

### Tab C: `.wav` File Download
- PCM 16-bit WAV, 44.1 kHz stereo
- Normalized peak levels
- Ready for Unity AudioClip import

### Tab D: `SfxBank.cs`
```csharp
// AudioClip bank with random pitch/volume variation
// Prevents repetitive playback of same sound
public class SfxBank : MonoBehaviour { ... }
```

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Audio Engine | Web Audio API (AudioContext, OscillatorNode, BiquadFilterNode, etc.) |
| Visualization | HTML5 Canvas 2D (AnalyserNode FFT data) |
| WAV Encoding | Pure JS PCM encoder (no external lib) |
| UI Framework | Vanilla JS + Custom CSS (glassmorphism) |
| Persistence | localStorage for user presets |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Stop current SFX |
| `R` | Randomize / Mutate |
| `S` | Save to preset library |
| `E` | Export WAV |
| `D` | Toggle dark mode |
| `[` / `]` | Previous / Next preset |

---

## Design Reference

Inspired by: [jsfxr](https://sfxr.me/), [ChipTone](https://sfbgames.itch.io/chiptone), Ableton Operator

**Estimated Complexity**: ~2,500–3,500 lines
**Priority**: ⭐⭐⭐ High (fills critical audio gap in suite)
