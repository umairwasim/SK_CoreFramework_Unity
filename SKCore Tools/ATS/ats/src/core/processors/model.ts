import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { Logger, NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, meshopt, prune, quantize, simplify, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import type { ModelInfo, ModelSettings } from '../../shared/types';
import { tools } from '../tools';

const pexec = promisify(execFile);

let ioPromise: Promise<NodeIO> | null = null;
function getIO(): Promise<NodeIO> {
  ioPromise ??= (async () => {
    await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
    return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
  })();
  return ioPromise;
}

function statsOf(doc: Document): ModelInfo {
  const root = doc.getRoot();
  let vertices = 0;
  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const n = pos?.getCount() ?? 0;
      vertices += n;
      if (prim.getMode() === 4) triangles += (prim.getIndices()?.getCount() ?? n) / 3;
    }
  }
  return {
    meshes: root.listMeshes().length,
    vertices,
    triangles: Math.round(triangles),
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    animations: root.listAnimations().length,
  };
}

export async function modelInfo(absPath: string, ext: string): Promise<ModelInfo> {
  if (ext === 'glb' || ext === 'gltf') {
    const io = await getIO();
    return statsOf(await io.read(absPath));
  }
  if (ext === 'obj') {
    const text = await fs.readFile(absPath, 'utf8');
    let v = 0, t = 0, o = 0;
    const mats = new Set<string>();
    for (const line of text.split('\n')) {
      if (line.startsWith('v ')) v++;
      else if (line.startsWith('f ')) t += Math.max(1, line.trim().split(/\s+/).length - 3);
      else if (line.startsWith('o ') || line.startsWith('g ')) o++;
      else if (line.startsWith('usemtl ')) mats.add(line.slice(7).trim());
    }
    return { meshes: Math.max(1, o), vertices: v, triangles: t, materials: mats.size };
  }
  return { note: 'FBX is binary/proprietary – geometry stats are shown in the 3D preview.' };
}

export interface ModelResult {
  changed: boolean;
  outExt: string;
  notes: string[];
  before?: ModelInfo;
  after?: ModelInfo;
}

export async function fbxToGlb(absIn: string, outGlb: string): Promise<void> {
  const bin = tools().fbx2gltf;
  if (!bin) throw new Error('FBX2glTF not found – set ATS_FBX2GLTF or `npm i fbx2gltf`');
  const base = outGlb.replace(/\.glb$/i, '');
  await pexec(bin, ['--binary', '--input', absIn, '--output', base], { timeout: 5 * 60_000, windowsHide: true });
  await fs.access(outGlb);
}

/** Optimize a glTF/GLB (or a converted FBX) and write a .glb to `outPath`. */
export async function processGltf(absIn: string, outPath: string, s: ModelSettings['source']): Promise<ModelResult> {
  const io = await getIO();
  const doc = await io.read(absIn);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const before = statsOf(doc);
  const notes: string[] = [];
  const ops = [];
  if (s.dedup) ops.push(dedup());
  if (s.prune) ops.push(prune());
  if (s.weld || s.simplifyRatio < 1) ops.push(weld());
  if (s.simplifyRatio < 1) ops.push(simplify({ simplifier: MeshoptSimplifier, ratio: s.simplifyRatio, error: 0.001 }));
  if (s.textureMaxSize > 0 && doc.getRoot().listTextures().length) ops.push(textureCompress({ encoder: sharp, resize: [s.textureMaxSize, s.textureMaxSize] }));
  if (s.meshCompression === 'draco') ops.push(draco({ method: 'edgebreaker' }));
  else if (s.meshCompression === 'meshopt') ops.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  else if (s.meshCompression === 'quantize') ops.push(quantize());
  if (ops.length) await doc.transform(...ops);
  const after = statsOf(doc);
  await io.write(outPath, doc);
  if (before.triangles !== after.triangles) notes.push(`triangles ${before.triangles} → ${after.triangles}`);
  if (before.vertices !== after.vertices) notes.push(`vertices ${before.vertices} → ${after.vertices}`);
  if (s.meshCompression !== 'none') notes.push(`${s.meshCompression} compression (Unity needs glTFast${s.meshCompression === 'draco' ? ' + Draco package' : ''})`);
  return { changed: true, outExt: path.extname(outPath).slice(1), notes, before, after };
}
