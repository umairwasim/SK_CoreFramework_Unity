import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

let gltf: GLTFLoader | null = null;
function gltfLoader() {
  if (!gltf) {
    const draco = new DRACOLoader().setDecoderPath(new URL('./draco/', document.baseURI).href);
    gltf = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  }
  return gltf;
}

export interface LoadedModel {
  object: THREE.Object3D;
  animations: THREE.AnimationClip[];
  stats: { meshes: number; vertices: number; triangles: number; materials: number };
}

export async function loadModel(url: string, ext: string): Promise<LoadedModel> {
  let object: THREE.Object3D;
  let animations: THREE.AnimationClip[] = [];
  if (ext === 'glb' || ext === 'gltf') {
    const g = await gltfLoader().loadAsync(url);
    object = g.scene;
    animations = g.animations;
  } else if (ext === 'fbx') {
    const o = await new FBXLoader().loadAsync(url);
    object = o;
    animations = o.animations;
  } else {
    object = await new OBJLoader().loadAsync(url);
    object.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: 0xb8bcc6, roughness: 0.6, metalness: 0.05 });
    });
  }
  let meshes = 0, vertices = 0, triangles = 0;
  const mats = new Set<string>();
  object.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry as THREE.BufferGeometry;
    const n = g.attributes.position?.count ?? 0;
    vertices += n;
    triangles += (g.index ? g.index.count : n) / 3;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x.uuid));
    if (!g.attributes.normal) g.computeVertexNormals();
  });
  return { object, animations, stats: { meshes, vertices, triangles: Math.round(triangles), materials: mats.size } };
}

/** Wrap `object` so it is centered at the origin with a bounding-sphere radius of 1. */
export function normalize(object: THREE.Object3D) {
  const sphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
  const s = sphere.radius > 0 ? 1 / sphere.radius : 1;
  const inner = new THREE.Group();
  inner.add(object);
  inner.scale.setScalar(s);
  inner.position.copy(sphere.center).multiplyScalar(-s); // world = s·(p − c)
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  return wrapper;
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => {
      Object.values(mat).forEach((v) => (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose());
      mat.dispose();
    });
  });
}

// ---------------------------------------------------------------------------
// Grid thumbnails: one shared offscreen renderer, sequential queue, memory cache.
// ---------------------------------------------------------------------------
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let renderer: THREE.WebGLRenderer | null = null;
let chain: Promise<unknown> = Promise.resolve();

function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(256, 256, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }
  return renderer;
}

export function modelThumbnail(key: string, url: string, ext: string): Promise<string> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(key);
  if (p) return p;
  p = new Promise<string>((resolve, reject) => {
    chain = chain.then(async () => {
      try {
        const { object } = await loadModel(url, ext);
        const scene = new THREE.Scene();
        const root = normalize(object);
        root.rotation.y = -Math.PI / 5;
        scene.add(root);
        scene.add(new THREE.HemisphereLight(0xdde6ff, 0x202028, 1.6));
        const key1 = new THREE.DirectionalLight(0xffffff, 2.2);
        key1.position.set(3, 4, 5);
        scene.add(key1);
        const rim = new THREE.DirectionalLight(0x88ccff, 1.2);
        rim.position.set(-4, 2, -3);
        scene.add(rim);
        // subtle wireframe overlay – collect first: adding children during traverse() would recurse forever
        const meshes: THREE.Mesh[] = [];
        object.traverse((c) => (c as THREE.Mesh).isMesh && meshes.push(c as THREE.Mesh));
        for (const m of meshes) m.add(new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.08 })));
        const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
        cam.position.set(0, 0.9, 3.4);
        cam.lookAt(0, 0, 0);
        const r = getRenderer();
        r.setClearColor(0x000000, 0);
        r.render(scene, cam);
        const data = r.domElement.toDataURL('image/png');
        disposeObject(object);
        cache.set(key, data);
        resolve(data);
      } catch (e) {
        reject(e);
      } finally {
        pending.delete(key);
      }
    });
  });
  pending.set(key, p);
  return p;
}
