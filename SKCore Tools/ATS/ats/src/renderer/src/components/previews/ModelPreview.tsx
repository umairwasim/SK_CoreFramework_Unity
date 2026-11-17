import { Grid, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import type { AssetRecord } from '@shared/types';
import { Loader2, Pause, Play, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { api } from '@/lib/api';
import { disposeObject, type LoadedModel, loadModel, normalize } from '@/lib/three';
import { cn } from '@/lib/utils';

type MatMode = 'original' | 'clay' | 'normals' | 'uv';
type LightMode = 'studio' | 'outdoor' | 'dramatic';

function Lights({ mode }: { mode: LightMode }) {
  if (mode === 'outdoor')
    return (
      <>
        <hemisphereLight args={[0xbfd9ff, 0x4a3b2a, 1.4]} />
        <directionalLight position={[5, 8, 3]} intensity={2.6} color={0xfff1d6} />
      </>
    );
  if (mode === 'dramatic')
    return (
      <>
        <ambientLight intensity={0.08} />
        <spotLight position={[3, 5, 2]} angle={0.5} penumbra={0.6} intensity={60} color={0xffd2a1} />
        <directionalLight position={[-4, 1, -3]} intensity={2.2} color={0x5aa9ff} />
      </>
    );
  return (
    <>
      <hemisphereLight args={[0xdde6ff, 0x202028, 1.3]} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} />
      <directionalLight position={[-4, 2, -3]} intensity={1.1} color={0x88ccff} />
    </>
  );
}

const clay = new THREE.MeshStandardMaterial({ color: 0xb9bcc4, roughness: 0.65, metalness: 0.02 });
const normalMat = new THREE.MeshNormalMaterial();
let uvTex: THREE.Texture | null = null;
function uvMaterial() {
  if (!uvTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        g.fillStyle = (x + y) % 2 ? '#1e293b' : `hsl(${x * 40 + y * 8},70%,60%)`;
        g.fillRect(x * 32, y * 32, 32, 32);
      }
    uvTex = new THREE.CanvasTexture(c);
    uvTex.colorSpace = THREE.SRGBColorSpace;
    uvTex.wrapS = uvTex.wrapT = THREE.RepeatWrapping;
  }
  return new THREE.MeshBasicMaterial({ map: uvTex });
}

function Model({ model, matMode, wireframe, autoRotate, playing }: { model: LoadedModel; matMode: MatMode; wireframe: boolean; autoRotate: boolean; playing: boolean }) {
  const root = useMemo(() => normalize(model.object), [model]);
  const mixer = useMemo(() => (model.animations.length ? new THREE.AnimationMixer(model.object) : null), [model]);
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!mixer) return;
    const action = mixer.clipAction(model.animations[0]);
    action.play();
    return () => void mixer.stopAllAction();
  }, [mixer, model]);

  useEffect(() => {
    const uv = matMode === 'uv' ? uvMaterial() : null;
    model.object.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      m.userData.orig ??= m.material;
      m.material = matMode === 'original' ? m.userData.orig : matMode === 'clay' ? clay : matMode === 'normals' ? normalMat : uv!;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => ((x as THREE.MeshStandardMaterial).wireframe = wireframe));
    });
  }, [model, matMode, wireframe]);

  useFrame((_, dt) => {
    if (autoRotate && group.current) group.current.rotation.y += dt * 0.5;
    if (playing) mixer?.update(dt);
  });

  return (
    <group ref={group}>
      <primitive object={root} />
    </group>
  );
}

export function ModelPreview({ asset }: { asset: AssetRecord }) {
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [matMode, setMatMode] = useState<MatMode>('original');
  const [light, setLight] = useState<LightMode>('studio');
  const [wire, setWire] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [grid, setGrid] = useState(true);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    let alive = true;
    let loaded: LoadedModel | null = null;
    setModel(null);
    setErr(null);
    loadModel(api.fileUrl(asset), asset.ext)
      .then((m) => {
        loaded = m;
        if (alive) setModel(m);
        else disposeObject(m.object);
      })
      .catch((e) => alive && setErr(String(e?.message ?? e)));
    return () => {
      alive = false;
      // restore original materials before disposing, so the shared clay/normal materials survive
      if (loaded) {
        loaded.object.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh && m.userData.orig) m.material = m.userData.orig;
        });
        disposeObject(loaded.object);
      }
    };
  }, [asset.id, asset.mtimeMs]);

  const Seg = <T extends string>({ value, set, opts }: { value: T; set: (v: T) => void; opts: [T, string][] }) => (
    <div className="flex overflow-hidden rounded border border-border">
      {opts.map(([v, l]) => (
        <button key={v} onClick={() => set(v)} className={cn('h-5 px-1.5 text-[10.5px]', value === v ? 'bg-sky-500/20 text-sky-200' : 'text-zinc-400 hover:text-zinc-200')}>
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_35%,#1e293b,#09090b_75%)]">
        {!model && !err && <Loader2 className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 animate-spin text-zinc-500" />}
        {err && <div className="absolute inset-0 grid place-items-center p-4 text-center text-[12px] text-rose-300">{err}</div>}
        {model && (
          <Canvas camera={{ position: [0, 0.8, 3.2], fov: 38, near: 0.01, far: 100 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }} dpr={[1, 2]}>
            <Lights mode={light} />
            <Model model={model} matMode={matMode} wireframe={wire} autoRotate={rotate} playing={playing} />
            {grid && <Grid position={[0, -1, 0]} args={[10, 10]} cellSize={0.25} cellThickness={0.5} sectionSize={1} sectionThickness={1} cellColor="#27272a" sectionColor="#3f3f46" fadeDistance={9} infiniteGrid />}
            <OrbitControls makeDefault enableDamping dampingFactor={0.1} minDistance={0.5} maxDistance={12} />
          </Canvas>
        )}
        {model && (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-2 py-1 text-[10.5px] leading-4 text-zinc-300 backdrop-blur">
            {model.stats.triangles.toLocaleString()} tris · {model.stats.vertices.toLocaleString()} verts
            <br />
            {model.stats.meshes} mesh · {model.stats.materials} mat{model.animations.length ? ` · ${model.animations.length} anim` : ''}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border bg-panel px-2 py-1.5">
        <Seg value={matMode} set={setMatMode} opts={[['original', 'Mat'], ['clay', 'Clay'], ['normals', 'Normals'], ['uv', 'UV']]} />
        <Seg value={light} set={setLight} opts={[['studio', 'Studio'], ['outdoor', 'Sun'], ['dramatic', 'Drama']]} />
        <button onClick={() => setWire(!wire)} className={cn('h-5 rounded border border-border px-1.5 text-[10.5px]', wire ? 'bg-sky-500/20 text-sky-200' : 'text-zinc-400')}>Wire</button>
        <button onClick={() => setGrid(!grid)} className={cn('h-5 rounded border border-border px-1.5 text-[10.5px]', grid ? 'bg-sky-500/20 text-sky-200' : 'text-zinc-400')}>Grid</button>
        <button onClick={() => setRotate(!rotate)} title="Auto-rotate" className={cn('grid h-5 w-6 place-items-center rounded border border-border', rotate ? 'bg-sky-500/20 text-sky-200' : 'text-zinc-400')}>
          <RotateCw className="size-3" />
        </button>
        {model?.animations.length ? (
          <button onClick={() => setPlaying(!playing)} className="grid h-5 w-6 place-items-center rounded border border-border text-zinc-300">
            {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
