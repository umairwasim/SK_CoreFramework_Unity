import type { AssetKind, AudioSettings, ModelSettings, SettingsBundle, TextureSettings } from '@shared/types';
import { ChevronDown, FileCog, FileImage, Info } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { type Option, Select } from './ui/select';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';

const SIZES = [256, 512, 1024, 2048, 4096, 8192];
const tri: Option<'keep' | 'on' | 'off'>[] = [
  { value: 'keep', label: 'Keep' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-3 py-[3px]">
      <div className="flex items-center gap-1 truncate text-[12px] text-zinc-400" title={hint}>
        {label}
        {hint && <Info className="size-3 shrink-0 text-zinc-600" />}
      </div>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step = 1, onChange, fmt, hint }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string; hint?: string }) {
  return (
    <Row label={label} hint={hint}>
      <div className="flex w-full items-center gap-2">
        <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
        <span className="w-10 shrink-0 text-right text-[11.5px] tabular-nums text-zinc-300">{fmt ? fmt(value) : value}</span>
      </div>
    </Row>
  );
}

function Group({ title, icon: Icon, enabled, onToggle, children, note }: { title: string; icon: typeof FileImage; enabled: boolean; onToggle: (v: boolean) => void; children: React.ReactNode; note?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border bg-zinc-900/40">
      <div className="flex h-8 items-center gap-2 px-2.5">
        <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setOpen(!open)}>
          <ChevronDown className={cn('size-3.5 text-zinc-500 transition-transform', !open && '-rotate-90')} />
          <Icon className={cn('size-3.5', enabled ? 'text-accent' : 'text-zinc-600')} />
          <span className={cn('text-[12px] font-medium', enabled ? 'text-zinc-200' : 'text-zinc-500')}>{title}</span>
        </button>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {open && (
        <div className={cn('border-t border-border/70 px-2.5 py-1.5', !enabled && 'pointer-events-none opacity-40')}>
          {note && <p className="mb-1 text-[11px] leading-snug text-zinc-500">{note}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

function TextureEditor({ s, up }: { s: TextureSettings; up: (fn: (t: TextureSettings) => void) => void }) {
  return (
    <div className="space-y-2">
      <Group title="Source file" icon={FileImage} enabled={s.source.enabled} onToggle={(v) => up((t) => void (t.source.enabled = v))} note="Rewrites the pixels (resize / re-encode). JPG is only re-encoded when it must be resized.">
        <Row label="Max size" hint="Longest edge. Larger images are downscaled with Lanczos3.">
          <Select value={s.source.maxSize} onChange={(v) => up((t) => void (t.source.maxSize = v))} options={[{ value: 0, label: 'Keep' }, ...SIZES.map((n) => ({ value: n, label: `${n}` }))]} className="w-full" />
        </Row>
        <Row label="Power of two" hint="Block compression (ASTC/BC7/ETC2) works best with POT sizes.">
          <Select value={s.source.powerOfTwo} onChange={(v) => up((t) => void (t.source.powerOfTwo = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'nearest', label: 'Nearest' }, { value: 'down', label: 'Round down' }]} className="w-full" />
        </Row>
        <Row label="Output format" hint="Format changes only apply in Save as New (Overwrite must keep the .meta binding).">
          <Select value={s.source.outputFormat} onChange={(v) => up((t) => void (t.source.outputFormat = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'tga', label: 'TGA' }]} className="w-full" />
        </Row>
        {s.source.outputFormat === 'jpg' && <SliderRow label="JPG quality" value={s.source.quality} min={40} max={100} onChange={(v) => up((t) => void (t.source.quality = v))} />}
        <SliderRow label="PNG compression" value={s.source.pngCompressionLevel} min={0} max={9} onChange={(v) => up((t) => void (t.source.pngCompressionLevel = v))} hint="Lossless; 9 = smallest file" />
        <Row label="Strip alpha if opaque">
          <Switch checked={s.source.stripAlphaIfOpaque} onCheckedChange={(v) => up((t) => void (t.source.stripAlphaIfOpaque = v))} />
        </Row>
      </Group>
      <Group title="Unity importer (.meta)" icon={FileCog} enabled={s.importer.enabled} onToggle={(v) => up((t) => void (t.importer.enabled = v))} note="Patched in place – GUID and unknown fields stay untouched.">
        <Row label="Texture type">
          <Select value={s.importer.textureType} onChange={(v) => up((t) => void (t.importer.textureType = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'default', label: 'Default' }, { value: 'normal', label: 'Normal map' }, { value: 'sprite', label: 'Sprite (2D and UI)' }]} className="w-full" />
        </Row>
        <Row label="Max texture size" hint="4K textures inflate mobile VRAM">
          <Select value={s.importer.maxTextureSize} onChange={(v) => up((t) => void (t.importer.maxTextureSize = v))} options={[{ value: 0, label: 'Keep' }, ...[32, 64, 128, ...SIZES, 16384].map((n) => ({ value: n, label: `${n}` }))]} className="w-full" />
        </Row>
        <Row label="Generate mip maps" hint="Auto: off for Sprite/UI (no blur), on for 3D textures (less aliasing)">
          <Select value={s.importer.mipmaps} onChange={(v) => up((t) => void (t.importer.mipmaps = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'auto', label: 'Auto (UI off / 3D on)' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} className="w-full" />
        </Row>
        <Row label="sRGB (color texture)" hint="Ignored for normal maps">
          <Select value={s.importer.sRGB} onChange={(v) => up((t) => void (t.importer.sRGB = v))} options={tri} className="w-full" />
        </Row>
        <Row label="Read/Write" hint="Off halves RAM (no CPU copy)">
          <Select value={s.importer.readWrite} onChange={(v) => up((t) => void (t.importer.readWrite = v))} options={tri} className="w-full" />
        </Row>
        <Row label="Android / iOS" hint="Platform override → textureFormat">
          <Select value={s.importer.mobileFormat} onChange={(v) => up((t) => void (t.importer.mobileFormat = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'ASTC_4x4', label: 'ASTC 4×4 (HQ)' }, { value: 'ASTC_6x6', label: 'ASTC 6×6' }, { value: 'ASTC_8x8', label: 'ASTC 8×8 (small)' }, { value: 'ETC2_RGBA8', label: 'ETC2 RGBA8' }]} className="w-full" />
        </Row>
        <Row label="PC (Standalone)">
          <Select value={s.importer.pcFormat} onChange={(v) => up((t) => void (t.importer.pcFormat = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'BC7', label: 'BC7' }, { value: 'DXT5', label: 'DXT5 / BC3' }, { value: 'DXT1', label: 'DXT1 / BC1' }]} className="w-full" />
        </Row>
      </Group>
    </div>
  );
}

function ModelEditor({ s, up }: { s: ModelSettings; up: (fn: (t: ModelSettings) => void) => void }) {
  const fbx = useStore((st) => st.tools?.fbx2gltf);
  return (
    <div className="space-y-2">
      <Group title="Source file (glTF / GLB)" icon={FileImage} enabled={s.source.enabled} onToggle={(v) => up((t) => void (t.source.enabled = v))} note="gltf-transform pipeline. FBX/OBJ sources are only touched via the importer unless converted.">
        <Row label="Dedup / Prune / Weld">
          <div className="flex gap-3">
            <Switch checked={s.source.dedup} onCheckedChange={(v) => up((t) => void (t.source.dedup = v))} title="Dedup" />
            <Switch checked={s.source.prune} onCheckedChange={(v) => up((t) => void (t.source.prune = v))} title="Prune" />
            <Switch checked={s.source.weld} onCheckedChange={(v) => up((t) => void (t.source.weld = v))} title="Weld" />
          </div>
        </Row>
        <SliderRow label="Simplify (keep %)" value={Math.round(s.source.simplifyRatio * 100)} min={10} max={100} step={5} onChange={(v) => up((t) => void (t.source.simplifyRatio = v / 100))} fmt={(v) => `${v}%`} hint="meshoptimizer simplifier; 100% = off" />
        <Row label="Geometry compression" hint="Unity needs glTFast (+ Draco package for Draco)">
          <Select value={s.source.meshCompression} onChange={(v) => up((t) => void (t.source.meshCompression = v))} options={[{ value: 'none', label: 'None' }, { value: 'quantize', label: 'Quantize' }, { value: 'meshopt', label: 'Meshopt' }, { value: 'draco', label: 'Draco' }]} className="w-full" />
        </Row>
        <Row label="Embedded textures max">
          <Select value={s.source.textureMaxSize} onChange={(v) => up((t) => void (t.source.textureMaxSize = v))} options={[{ value: 0, label: 'Keep' }, ...SIZES.map((n) => ({ value: n, label: `${n}` }))]} className="w-full" />
        </Row>
        <Row label="FBX → GLB" hint={fbx ? 'Save as New only' : 'FBX2glTF not found (set ATS_FBX2GLTF or npm i fbx2gltf)'}>
          <Switch checked={s.source.convertFbxToGlb} disabled={!fbx} onCheckedChange={(v) => up((t) => void (t.source.convertFbxToGlb = v))} />
        </Row>
      </Group>
      <Group title="Unity importer (.meta)" icon={FileCog} enabled={s.importer.enabled} onToggle={(v) => up((t) => void (t.importer.enabled = v))} note="ModelImporter (FBX / OBJ). glTF files use glTFast's ScriptedImporter.">
        <Row label="Mesh compression">
          <Select value={s.importer.meshCompression} onChange={(v) => up((t) => void (t.importer.meshCompression = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'off', label: 'Off' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} className="w-full" />
        </Row>
        <Row label="Optimize Game Objects" hint="Flattens rig hierarchy (Generic/Humanoid)">
          <Select value={s.importer.optimizeGameObjects} onChange={(v) => up((t) => void (t.importer.optimizeGameObjects = v))} options={tri} className="w-full" />
        </Row>
        <Row label="Import animation">
          <Select value={s.importer.importAnimation} onChange={(v) => up((t) => void (t.importer.importAnimation = v))} options={tri} className="w-full" />
        </Row>
        <Row label="Normals">
          <Select value={s.importer.normals} onChange={(v) => up((t) => void (t.importer.normals = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'import', label: 'Import' }, { value: 'calculate', label: 'Calculate' }, { value: 'none', label: 'None' }]} className="w-full" />
        </Row>
        <Row label="Read/Write">
          <Select value={s.importer.readWrite} onChange={(v) => up((t) => void (t.importer.readWrite = v))} options={tri} className="w-full" />
        </Row>
      </Group>
    </div>
  );
}

function AudioEditor({ s, up }: { s: AudioSettings; up: (fn: (t: AudioSettings) => void) => void }) {
  return (
    <div className="space-y-2">
      <Group title="Source file" icon={FileImage} enabled={s.source.enabled} onToggle={(v) => up((t) => void (t.source.enabled = v))} note="FFmpeg. Skipped automatically when nothing would change (no pointless lossy re-encode).">
        <Row label="Force mono (downmix)">
          <Switch checked={s.source.forceMono} onCheckedChange={(v) => up((t) => void (t.source.forceMono = v))} />
        </Row>
        <Row label="Max sample rate" hint="Never upsamples">
          <Select value={s.source.sampleRate} onChange={(v) => up((t) => void (t.source.sampleRate = v))} options={[{ value: 0, label: 'Keep' }, { value: 48000, label: '48000 Hz' }, { value: 44100, label: '44100 Hz' }, { value: 32000, label: '32000 Hz' }, { value: 22050, label: '22050 Hz' }]} className="w-full" />
        </Row>
        <Row label="Output format">
          <Select value={s.source.outputFormat} onChange={(v) => up((t) => void (t.source.outputFormat = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'wav', label: 'WAV (PCM)' }, { value: 'ogg', label: 'OGG Vorbis' }, { value: 'mp3', label: 'MP3' }]} className="w-full" />
        </Row>
        <SliderRow label="Encoder quality" value={s.source.quality} min={0} max={10} onChange={(v) => up((t) => void (t.source.quality = v))} hint="Vorbis q / MP3 VBR" />
        <Row label="Normalize (-16 LUFS)">
          <Switch checked={s.source.normalize} onCheckedChange={(v) => up((t) => void (t.source.normalize = v))} />
        </Row>
        <Row label="Trim silence">
          <Switch checked={s.source.trimSilence} onCheckedChange={(v) => up((t) => void (t.source.trimSilence = v))} />
        </Row>
      </Group>
      <Group title="Unity importer (.meta)" icon={FileCog} enabled={s.importer.enabled} onToggle={(v) => up((t) => void (t.importer.enabled = v))} note="Auto rules: SFX (short or in SFX/UI folders) vs. Music (long or in Music/Ambience).">
        <Row label="Force To Mono">
          <Select value={s.importer.forceToMono} onChange={(v) => up((t) => void (t.importer.forceToMono = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'auto', label: 'Auto (SFX on)' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} className="w-full" />
        </Row>
        <Row label="Load type">
          <Select value={s.importer.loadType} onChange={(v) => up((t) => void (t.importer.loadType = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'auto', label: 'Auto (by length)' }, { value: 'decompressOnLoad', label: 'Decompress On Load' }, { value: 'compressedInMemory', label: 'Compressed In Memory' }, { value: 'streaming', label: 'Streaming' }]} className="w-full" />
        </Row>
        <Row label="Compression">
          <Select value={s.importer.compressionFormat} onChange={(v) => up((t) => void (t.importer.compressionFormat = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'vorbis', label: 'Vorbis' }, { value: 'adpcm', label: 'ADPCM' }, { value: 'pcm', label: 'PCM' }]} className="w-full" />
        </Row>
        <SliderRow label="Quality" value={s.importer.quality} min={1} max={100} onChange={(v) => up((t) => void (t.importer.quality = v))} fmt={(v) => `${v}%`} />
        <Row label="Sample rate">
          <Select value={s.importer.sampleRate} onChange={(v) => up((t) => void (t.importer.sampleRate = v))} options={[{ value: 'keep', label: 'Keep' }, { value: 'auto', label: 'Auto (SFX 22k)' }, { value: 'preserve', label: 'Preserve' }, { value: 'optimize', label: 'Optimize' }, { value: 44100, label: 'Override 44100' }, { value: 22050, label: 'Override 22050' }]} className="w-full" />
        </Row>
      </Group>
    </div>
  );
}

export function SettingsEditor({ kinds }: { kinds: AssetKind[] }) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const up = <K extends keyof SettingsBundle>(k: K) => (fn: (t: SettingsBundle[K]) => void) => updateSettings((s) => fn(s[k]));
  const multi = kinds.length > 1;
  return (
    <div className="space-y-3">
      {kinds.includes('texture') && (
        <div className="space-y-1.5">
          {multi && <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Textures</h4>}
          <TextureEditor s={settings.texture} up={up('texture')} />
        </div>
      )}
      {kinds.includes('model') && (
        <div className="space-y-1.5">
          {multi && <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Models</h4>}
          <ModelEditor s={settings.model} up={up('model')} />
        </div>
      )}
      {kinds.includes('audio') && (
        <div className="space-y-1.5">
          {multi && <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Audio</h4>}
          <AudioEditor s={settings.audio} up={up('audio')} />
        </div>
      )}
    </div>
  );
}
