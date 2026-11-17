/**
 * Generates a small but realistic Unity 6 project for trying ATS:
 *   npm run sample            → ./sample-project
 *   npm run sample -- <dir>   → custom location
 */
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { newGuid } from '../src/core/meta';
import { encodeTga } from '../src/core/processors/tga';
import { tools } from '../src/core/tools';
import { audioMeta, gltfMeta, modelMeta, textureMeta } from '../tests/fixtures/metaTemplates';

const root = path.resolve(process.argv[2] ?? 'sample-project');
const A = (...p: string[]) => path.join(root, 'Assets', ...p);
const guids: Record<string, string> = {};

async function put(rel: string, data: Buffer | string, meta: (guid: string) => string) {
  const abs = A(...rel.split('/'));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  const g = newGuid();
  guids[rel] = g;
  await fs.writeFile(abs + '.meta', meta(g));
}

function svgArt(w: number, h: number, hue: number, label: string, alpha = false) {
  const circles = Array.from({ length: 18 }, (_, i) => {
    const x = ((i * 7919) % 97) / 97 * w;
    const y = ((i * 104729) % 89) / 89 * h;
    const r = (0.04 + ((i * 31) % 17) / 170) * Math.min(w, h);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="hsl(${(hue + i * 23) % 360},70%,${45 + (i % 4) * 8}%)" fill-opacity="0.75"/>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},60%,25%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,55%)"/></linearGradient></defs>
    ${alpha ? '' : `<rect width="100%" height="100%" fill="url(#g)"/>`}
    ${circles}
    <text x="50%" y="52%" font-family="sans-serif" font-weight="700" font-size="${Math.min(w, h) / 9}" text-anchor="middle" fill="white" fill-opacity="0.9">${label}</text>
  </svg>`);
}

async function textures() {
  const png = (w: number, h: number, hue: number, label: string, alpha = false) => sharp(svgArt(w, h, hue, label, alpha)).png({ compressionLevel: 1 }).toBuffer();
  await put('Art/Textures/hero_albedo_4k.png', await png(4096, 4096, 200, 'HERO 4K'), (g) => textureMeta({ guid: g, labels: ['Character', 'HighRes'], platforms: ['Standalone', 'Android'] }));
  await put('Art/Textures/rock_normal.png', await sharp({ create: { width: 2048, height: 2048, channels: 3, background: { r: 128, g: 128, b: 255 } } }).png({ compressionLevel: 1 }).toBuffer(), (g) => textureMeta({ guid: g, textureType: 1, sRGB: 0, labels: ['Environment'] }));
  await put('Art/Textures/wood_diffuse.jpg', await sharp(svgArt(3000, 2000, 30, 'WOOD')).jpeg({ quality: 97 }).toBuffer(), (g) => textureMeta({ guid: g, isReadable: 1, labels: ['Environment'] }));
  {
    const { data, info } = await sharp(svgArt(1024, 1024, 120, 'TGA MASK', true)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    await put('Art/Textures/metal_mask.tga', encodeTga(data, info.width, info.height, true), (g) => textureMeta({ guid: g, crlf: true }));
  }
  await put('UI/Icons/icon_coin.png', await png(512, 512, 45, '¢', true), (g) => textureMeta({ guid: g, textureType: 8, spriteMode: 1, enableMipMap: 1, labels: ['UI'] }));
  await put('UI/Panels/panel_9slice.png', await png(2560, 1440, 260, 'PANEL', true), (g) => textureMeta({ guid: g, textureType: 8, spriteMode: 1, ppu: 100, border: [128, 96, 128, 96], labels: ['UI'] }));
  await put('UI/Atlases/buttons_atlas.png', await png(2560, 2560, 330, 'ATLAS', true), (g) => textureMeta({ guid: g, textureType: 8, spriteMode: 2, labels: ['UI'] }));
}

function torusKnot(p = 2, q = 3, tubular = 480, radial = 64, R = 1, r = 0.32) {
  // non-indexed on purpose → weld/dedup have work to do
  const pos: number[] = [];
  const nor: number[] = [];
  const curve = (u: number) => {
    const cu = Math.cos(u), su = Math.sin(u), quOverP = (q / p) * u, cs = Math.cos(quOverP);
    return [R * (2 + cs) * 0.5 * cu, R * (2 + cs) * su * 0.5, R * Math.sin(quOverP) * 0.5];
  };
  const grid: number[][][] = [];
  for (let i = 0; i <= tubular; i++) {
    const u = (i / tubular) * p * Math.PI * 2;
    const P1 = curve(u), P2 = curve(u + 0.01);
    const T = P2.map((v, k) => v - P1[k]);
    const N = P2.map((v, k) => v + P1[k]);
    const B = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
    const N2 = [B[1] * T[2] - B[2] * T[1], B[2] * T[0] - B[0] * T[2], B[0] * T[1] - B[1] * T[0]];
    const nb = Math.hypot(...B), nn = Math.hypot(...N2);
    const row: number[][] = [];
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2;
      const cx = -r * Math.cos(v), cy = r * Math.sin(v);
      const n = [0, 1, 2].map((k) => (cx * N2[k]) / nn + (cy * B[k]) / nb);
      row.push([P1[0] + n[0], P1[1] + n[1], P1[2] + n[2], ...n.map((x) => x / r)]);
    }
    grid.push(row);
  }
  for (let i = 0; i < tubular; i++)
    for (let j = 0; j < radial; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      for (const v of [a, b, d, b, c, d]) {
        pos.push(v[0], v[1], v[2]);
        nor.push(v[3], v[4], v[5]);
      }
    }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor) };
}

async function models() {
  const io = new NodeIO();
  // torus knot (dense, unwelded)
  {
    const doc = new Document();
    const buf = doc.createBuffer();
    const { pos, nor } = torusKnot();
    const mat = doc.createMaterial('Chrome').setBaseColorFactor([0.8, 0.85, 0.9, 1]).setMetallicFactor(1).setRoughnessFactor(0.25);
    const prim = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buf));
    const mesh = doc.createMesh('TorusKnot').addPrimitive(prim);
    doc.createScene().addChild(doc.createNode('TorusKnot').setMesh(mesh));
    // an unused material + duplicate material → prune/dedup demo
    doc.createMaterial('Unused');
    await put('Models/Props/torus_knot.glb', Buffer.from(await io.writeBinary(doc)), (g) => gltfMeta({ guid: g, labels: ['Props'] }));
  }
  // crate: cube with an embedded 2048 texture
  {
    const doc = new Document();
    const buf = doc.createBuffer();
    // [normal, up]; right = up × normal so that (right, up, normal) is right-handed → CCW front faces
    const faces: [number[], number[]][] = [
      [[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]], [[0, 0, 1], [0, 1, 0]], [[0, 0, -1], [0, 1, 0]],
      [[0, 1, 0], [0, 0, -1]], [[0, -1, 0], [0, 0, 1]],
    ];
    const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = [];
    faces.forEach(([n, up], f) => {
      const right = cross(up, n);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      corners.forEach(([a, b]) => {
        P.push(n[0] * 0.5 + right[0] * a * 0.5 + up[0] * b * 0.5, n[1] * 0.5 + right[1] * a * 0.5 + up[1] * b * 0.5, n[2] * 0.5 + right[2] * a * 0.5 + up[2] * b * 0.5);
        N.push(...n);
        U.push((a + 1) / 2, 1 - (b + 1) / 2);
      });
      const o = f * 4;
      I.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const img = await sharp(svgArt(2048, 2048, 25, 'CRATE')).png({ compressionLevel: 1 }).toBuffer();
    const tex = doc.createTexture('crate_albedo').setImage(new Uint8Array(img)).setMimeType('image/png');
    const mat = doc.createMaterial('Crate').setBaseColorTexture(tex).setRoughnessFactor(0.8).setMetallicFactor(0);
    const prim = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buf))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(U)).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(I)).setBuffer(buf));
    doc.createScene().addChild(doc.createNode('Crate').setMesh(doc.createMesh('Crate').addPrimitive(prim)));
    await put('Models/Props/crate.glb', Buffer.from(await io.writeBinary(doc)), (g) => gltfMeta({ guid: g, labels: ['Props'] }));
  }
  // OBJ (ModelImporter)
  {
    const lines = ['# barrel – generated by ATS sample', 'o Barrel'];
    const seg = 48, rings = 12;
    for (let y = 0; y <= rings; y++)
      for (let s = 0; s < seg; s++) {
        const t = y / rings, rad = 0.5 + 0.08 * Math.sin(t * Math.PI), a = (s / seg) * Math.PI * 2;
        lines.push(`v ${(Math.cos(a) * rad).toFixed(4)} ${(t * 1.4).toFixed(4)} ${(Math.sin(a) * rad).toFixed(4)}`);
      }
    for (let y = 0; y < rings; y++)
      for (let s = 0; s < seg; s++) {
        const a = y * seg + s + 1, b = y * seg + ((s + 1) % seg) + 1;
        lines.push(`f ${a} ${b} ${b + seg} ${a + seg}`);
      }
    await put('Models/Props/barrel.obj', lines.join('\n') + '\n', (g) => modelMeta({ guid: g, animationType: 0 }));
  }
}

function ff(args: string[]) {
  const bin = tools().ffmpeg;
  if (!bin) throw new Error('ffmpeg missing');
  const r = spawnSync(bin, ['-v', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
}

async function audio() {
  const tmp = path.join(root, '.ats-sample-tmp');
  await fs.mkdir(tmp, { recursive: true });
  const gen = async (rel: string, lavfi: string, dur: number, out: string[], meta: (g: string) => string) => {
    const file = path.join(tmp, path.basename(rel));
    ff(['-f', 'lavfi', '-i', lavfi, '-t', String(dur), ...out, file]);
    await put(rel, await fs.readFile(file), meta);
  };
  await gen('Audio/Music/theme_loop.ogg', 'sine=f=220:sample_rate=48000,aformat=channel_layouts=stereo,tremolo=f=2:d=0.6', 75, ['-ar', '48000', '-c:a', 'libvorbis', '-q:a', '8'], (g) => audioMeta({ guid: g, labels: ['Music'] }));
  await gen('Audio/Ambience/wind.mp3', 'anoisesrc=color=pink:amplitude=0.3:sample_rate=44100,lowpass=f=900,aformat=channel_layouts=stereo', 32, ['-c:a', 'libmp3lame', '-b:a', '256k'], (g) => audioMeta({ guid: g }));
  await gen('Audio/SFX/coin_pickup.wav', 'sine=f=1320:sample_rate=48000,aformat=channel_layouts=stereo,afade=t=out:st=0.05:d=0.35', 0.4, ['-c:a', 'pcm_s16le'], (g) => audioMeta({ guid: g, labels: ['SFX'] }));
  await gen('Audio/SFX/explosion.wav', 'anoisesrc=color=brown:amplitude=0.9:sample_rate=48000,aformat=channel_layouts=stereo,afade=t=out:st=0.2:d=1.8', 2.2, ['-c:a', 'pcm_s16le'], (g) => audioMeta({ guid: g, labels: ['SFX'] }));
  await gen('Audio/SFX/ui_click.wav', 'sine=f=880:sample_rate=44100,aformat=channel_layouts=stereo,afade=t=out:st=0.01:d=0.08', 0.12, ['-c:a', 'pcm_s16le'], (g) => audioMeta({ guid: g, labels: ['SFX', 'UI'] }));
  await fs.rm(tmp, { recursive: true, force: true });
}

async function main() {
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(path.join(root, 'ProjectSettings'), { recursive: true });
  await fs.writeFile(path.join(root, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.2.6f1\nm_EditorVersionWithRevision: 6000.2.6f1 (sample)\n');
  await textures();
  await models();
  await audio();
  // A material + scene that reference assets by GUID → proves references survive Overwrite.
  await fs.mkdir(A('Materials'), { recursive: true });
  await fs.writeFile(A('Materials', 'Hero.mat'), `%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!21 &2100000\nMaterial:\n  m_Name: Hero\n  m_SavedProperties:\n    m_TexEnvs:\n    - _BaseMap:\n        m_Texture: {fileID: 2800000, guid: ${guids['Art/Textures/hero_albedo_4k.png']}, type: 3}\n    - _BumpMap:\n        m_Texture: {fileID: 2800000, guid: ${guids['Art/Textures/rock_normal.png']}, type: 3}\n`);
  await fs.writeFile(path.join(root, 'guids.json'), JSON.stringify(guids, null, 2));
  console.log(`Sample Unity project created at ${root}`);
  console.table(Object.entries(guids).map(([rel, guid]) => ({ rel, guid })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
