/* ============================================================================
   SLASH FORGE — 3D Melee Weapon Trail & Slash VFX Studio
   Single-file Three.js application (three r147 embedded by build step)
   ==========================================================================*/
(() => {
'use strict';

/* ---------------------------------------------------------- 0) UTILS */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const lerp  = (a,b,t) => a+(b-a)*t;
const f2 = v => v.toFixed(2);
const f1 = v => v.toFixed(1);
const fmtK = n => n>=1000 ? (n/1000).toFixed(1)+'k' : String(n|0);

let toastTimer = 0;
function toast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove('show'), 1600);
}

/* ---------------------------------------------------------- 1) STATE */
const PRESETS = {
  katana: {
    label:'Anime Katana Slash', desc:'Razor-thin, hyper-fast cyan-white slice with instant decay.',
    attack:'horizontal',
    lifetime:0.38, wMax:0.30, wMin:0.01, smooth:2, intensity:3.2, pan:2.5, tiling:4, edge:0.35,
    blend:'add', core:['#ffffff',1.0], mid:['#9fe8ff',0.85], fade:['#1e6bff',0.0]
  },
  fiery: {
    label:'Fiery Greatsword', desc:'Broad fiery orange flame & ember trail with smoky dissipation.',
    attack:'chop',
    lifetime:1.50, wMax:0.85, wMin:0.06, smooth:3, intensity:2.4, pan:1.1, tiling:2.5, edge:0.55,
    blend:'alpha', core:['#fff3b0',0.95], mid:['#ff7a18',0.80], fade:['#3a0e00',0.0]
  },
  neon: {
    label:'Cyberpunk Neon Ribbon', desc:'Dual-tone hot magenta & purple glow with rapid UV energy flow.',
    attack:'whirl',
    lifetime:1.00, wMax:0.50, wMin:0.03, smooth:2, intensity:3.8, pan:3.5, tiling:3, edge:0.30,
    blend:'add', core:['#ff2fd6',1.0], mid:['#8a2be2',0.90], fade:['#26075e',0.15]
  },
  void: {
    label:'Dark Magic / Void', desc:'Sinister purple-black wave with slow-churning void energy.',
    attack:'whirl',
    lifetime:1.80, wMax:0.70, wMin:0.04, smooth:3, intensity:1.9, pan:0.8, tiling:2, edge:0.6,
    blend:'alpha', core:['#c084ff',0.9], mid:['#6b21c8',0.75], fade:['#0b0016',0.0]
  },
  holy: {
    label:'Holy Paladin Arc', desc:'Broad radiant gold arc with divine sunburst glow.',
    attack:'horizontal',
    lifetime:1.20, wMax:0.95, wMin:0.05, smooth:3, intensity:2.8, pan:1.6, tiling:2, edge:0.45,
    blend:'add', core:['#fffdf0',1.0], mid:['#ffc93c',0.90], fade:['#b8860b',0.0]
  }
};

const state = {
  ...PRESETS.katana, core:undefined, mid:undefined, fade:undefined, // spread guard
  lifetime:PRESETS.katana.lifetime, wMax:PRESETS.katana.wMax, wMin:PRESETS.katana.wMin,
  smooth:PRESETS.katana.smooth, intensity:PRESETS.katana.intensity, pan:PRESETS.katana.pan,
  tiling:PRESETS.katana.tiling, edge:PRESETS.katana.edge, blend:PRESETS.katana.blend,
  coreC:PRESETS.katana.core[0], coreA:PRESETS.katana.core[1],
  midC:PRESETS.katana.mid[0],   midA:PRESETS.katana.mid[1],
  fadeC:PRESETS.katana.fade[0], fadeA:PRESETS.katana.fade[1],
  attack:'horizontal', speed:1.0, loop:true,
  bloomOn:true, bloomStr:0.9, sparksOn:true, markers:true, glow:true, grid:true,
  backdrop:'void',
  presetKey:'katana'
};

/* ---------------------------------------------------------- 2) THREE SETUP */
let renderer, scene, camera, controls, composer, bloomPass, gammaPass;
let swordRoot, tipMarker, baseMarker, glowLight, grid, stageMat;
const viewportEl = $('#viewport');
let webglOK = true;

try {
  renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
} catch(e) {
  webglOK = false;
}
if (webglOK && !renderer.getContext()) webglOK = false;
if (!webglOK) { $('#glError').style.display='grid'; return; }

renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
viewportEl.insertBefore(renderer.domElement, viewportEl.firstChild);

scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.05);

camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(2.9, 2.0, 3.5);

controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.05, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.4;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.52;

/* ---- environment map (procedural canvas equirect -> PMREM) ---- */
(function makeEnv(){
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0,0,0,256);
  grad.addColorStop(0.0, '#0c1420');
  grad.addColorStop(0.45,'#26364e');
  grad.addColorStop(0.55,'#3d3a44');
  grad.addColorStop(0.7, '#141a24');
  grad.addColorStop(1.0, '#05070b');
  g.fillStyle = grad; g.fillRect(0,0,512,256);
  // softboxes for metallic speculars
  g.fillStyle = 'rgba(255,244,224,0.95)';
  g.fillRect(60,40,110,52);
  g.fillRect(330,66,90,40);
  g.fillStyle = 'rgba(120,190,255,0.55)';
  g.fillRect(210,20,70,30);
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(tex).texture;
  tex.dispose(); pmrem.dispose();
})();

/* ---- lights ---- */
scene.add(new THREE.HemisphereLight(0x445266, 0x0a0c10, 0.55));

const keyLight = new THREE.DirectionalLight(0xfff1dd, 1.15);
keyLight.position.set(4, 6.5, 3.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024,1024);
keyLight.shadow.camera.left = -3.5; keyLight.shadow.camera.right = 3.5;
keyLight.shadow.camera.top = 4;     keyLight.shadow.camera.bottom = -1;
keyLight.shadow.camera.near = 1;    keyLight.shadow.camera.far = 14;
keyLight.shadow.bias = -0.0004;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x3d6bff, 0.75);
rimLight.position.set(-5, 3.5, -4.5);
scene.add(rimLight);

glowLight = new THREE.PointLight(0xffffff, 0, 7, 2);
glowLight.position.set(0, 1.4, 0);
scene.add(glowLight);

/* ---- stage: disc + accent ring + grid ---- */
const stage = new THREE.Mesh(
  new THREE.CircleGeometry(2.35, 72),
  stageMat = new THREE.MeshStandardMaterial({ color:0x0e1118, metalness:0.55, roughness:0.42, envMapIntensity:0.7 })
);
stage.rotation.x = -Math.PI/2;
stage.position.y = 0.02;
stage.receiveShadow = true;
scene.add(stage);

function accentRing(rIn, rOut, color, opacity){
  const m = new THREE.Mesh(
    new THREE.RingGeometry(rIn, rOut, 96),
    new THREE.MeshBasicMaterial({ color, transparent:true, opacity, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, toneMapped:false })
  );
  m.rotation.x = -Math.PI/2;
  m.position.y = 0.035;
  return m;
}
scene.add(accentRing(2.24, 2.30, 0x3fa8ff, 0.55));
scene.add(accentRing(1.10, 1.13, 0x3fa8ff, 0.22));

grid = new THREE.GridHelper(14, 28, 0x32405a, 0x1a2232);
grid.material.transparent = true;
grid.material.opacity = 0.55;
grid.position.y = 0.01;
scene.add(grid);

/* ---------------------------------------------------------- 3) SWORD RIG */
(function buildSword(){
  swordRoot = new THREE.Group();
  scene.add(swordRoot);

  const matSteel = new THREE.MeshStandardMaterial({ color:0xd0d8e2, metalness:0.92, roughness:0.22, envMapIntensity:1.2 });
  const matEdge  = new THREE.MeshStandardMaterial({ color:0xffffff, metalness:0.98, roughness:0.12, envMapIntensity:1.4 });
  const matGuard = new THREE.MeshStandardMaterial({ color:0xcba135, metalness:0.85, roughness:0.35, envMapIntensity:1.0 });
  const matGrip  = new THREE.MeshStandardMaterial({ color:0x1b1f28, roughness:0.85 });

  // Grip
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.020, 0.20, 16), matGrip);
  grip.position.y = -0.02;
  grip.castShadow = true;
  swordRoot.add(grip);

  // Pommel
  const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.016, 0.03, 16), matGuard);
  pommel.position.y = -0.12;
  pommel.castShadow = true;
  swordRoot.add(pommel);

  // Guard (Tsuba)
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.015, 32), matGuard);
  guard.position.y = 0.08;
  guard.castShadow = true;
  swordRoot.add(guard);

  // Habaki (blade collar)
  const habaki = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.035, 0.014), matGuard);
  habaki.position.y = 0.105;
  swordRoot.add(habaki);

  // Blade geometry
  const bladeGeo = new THREE.BufferGeometry();
  const bladeVerts = new Float32Array([
    // front face
    -0.014, 0.12, 0.005,   0.014, 0.12, 0.005,   0.000, 0.12, 0.007,
    -0.012, 0.90, 0.003,   0.012, 0.90, 0.003,   0.000, 0.90, 0.005,
     0.000, 1.00, 0.000,
    // back face
    -0.014, 0.12,-0.005,   0.014, 0.12,-0.005,   0.000, 0.12,-0.007,
    -0.012, 0.90,-0.003,   0.012, 0.90,-0.003,   0.000, 0.90,-0.005
  ]);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.88, 0.008), matSteel);
  blade.position.y = 0.55;
  blade.castShadow = true;
  swordRoot.add(blade);

  // Blade tip taper
  const tipGeo = new THREE.ConeGeometry(0.018, 0.12, 4);
  tipGeo.rotateY(Math.PI/4);
  const bladeTip = new THREE.Mesh(tipGeo, matEdge);
  bladeTip.position.y = 0.985;
  bladeTip.scale.set(1.4, 1, 0.45);
  bladeTip.castShadow = true;
  swordRoot.add(bladeTip);

  // Markers
  const mkMat = c => new THREE.MeshBasicMaterial({ color:c, toneMapped:false });
  tipMarker  = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), mkMat(0xff3b4d));
  tipMarker.position.set(0, 0.985, 0);
  baseMarker = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), mkMat(0x2f8bff));
  baseMarker.position.set(0, 0.075, 0);
  swordRoot.add(tipMarker, baseMarker);
})();

/* ---------------------------------------------------------- 4) ATTACK SYSTEM */
/*==ATTACKS_BEGIN==*/
const EASE = {
  lin:   t => t,
  inOut: t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2,
  out:   t => 1 - Math.pow(1 - t, 4),
  in:    t => t*t*t
};

const ATTACKS = {
  horizontal: {
    name:'Horizontal Slash', dur:1.00, rec:[0.30, 0.64],
    kfs:[
      {t:0.00, p:[ 0.30, 1.30, 0.10], r:[ 0.10, -0.25, -0.12], e:'inOut'},
      {t:0.30, p:[ 0.62, 1.24,-0.16], r:[ 0.00,  0.85, -1.55], e:'out'},
      {t:0.48, p:[-0.42, 1.14, 0.22], r:[ 0.05, -1.95, -1.50], e:'inOut'},
      {t:0.62, p:[-0.55, 1.18, 0.18], r:[ 0.05, -2.05, -1.42], e:'inOut'},
      {t:1.00, p:[ 0.30, 1.30, 0.10], r:[ 0.10, -0.25, -0.12], e:'inOut'}
    ]
  },
  chop: {
    name:'Overhead Chop', dur:1.20, rec:[0.33, 0.64],
    kfs:[
      {t:0.00, p:[ 0.30, 1.30, 0.10], r:[ 0.10, -0.25, -0.12], e:'inOut'},
      {t:0.34, p:[ 0.18, 1.95,-0.30], r:[-1.05,  0.00, -0.18], e:'out'},
      {t:0.50, p:[ 0.08, 0.72, 0.48], r:[ 1.30,  0.05,  0.10], e:'inOut'},
      {t:0.62, p:[ 0.06, 0.66, 0.52], r:[ 1.38,  0.05,  0.12], e:'inOut'},
      {t:1.00, p:[ 0.30, 1.30, 0.10], r:[ 0.10, -0.25, -0.12], e:'inOut'}
    ]
  },
  whirl: {
    name:'360° Whirlwind', dur:1.60, rec:[0.13, 0.82],
    kfs:[
      {t:0.00, p:[ 0.30, 1.30, 0.10], r:[ 0.10, -0.25,             -0.12], e:'inOut'},
      {t:0.13, p:[ 0.42, 1.16, 0.05], r:[ 0.00,  0.45,             -1.58], e:'inOut'},
      {t:0.55, p:[ 0.40, 1.20, 0.05], r:[ 0.00,  0.45 - Math.PI*2*1.25, -1.58], e:'inOut'},
      {t:0.80, p:[ 0.42, 1.14, 0.05], r:[ 0.00,  0.45 - Math.PI*3,      -1.62], e:'out'},
      {t:1.00, p:[ 0.30, 1.30, 0.10], r:[ 0.10, -0.25 - Math.PI*2,     -0.12], e:'inOut'}
    ]
  },
  upper: {
    name:'Diagonal Uppercut', dur:1.10, rec:[0.29, 0.62],
    kfs:[
      {t:0.00, p:[ 0.30, 1.30, 0.10], r:[ 0.10, -0.25, -0.12], e:'inOut'},
      {t:0.30, p:[-0.55, 0.80, 0.22], r:[-0.10, -0.50,  2.35], e:'out'},
      {t:0.46, p:[ 0.48, 1.85, 0.35], r:[ 0.15, -0.35, -1.15], e:'inOut'},
      {t:0.58, p:[ 0.55, 1.92, 0.32], r:[ 0.15, -0.30, -1.05], e:'inOut'},
      {t:1.00, p:[ 0.30, 1.30, 0.10], r:[ 0.10, -0.25, -0.12], e:'inOut'}
    ]
  }
};

function poseAt(att, u, outP, outR){
  u = u < 0 ? 0 : (u > 1 ? 1 : u);
  const k = att.kfs;
  let i = 0;
  while (i < k.length - 2 && u > k[i+1].t) i++;
  const a = k[i], b = k[i+1];
  const span = Math.max(b.t - a.t, 1e-6);
  const lt = EASE[b.e]((u - a.t) / span);
  for (let j = 0; j < 3; j++){
    outP[j] = a.p[j] + (b.p[j] - a.p[j]) * lt;
    outR[j] = a.r[j] + (b.r[j] - a.r[j]) * lt;
  }
}
/*==ATTACKS_END==*/

const tmpP = [0,0,0], tmpR = [0,0,0];
const V_tip = new THREE.Vector3(), V_base = new THREE.Vector3();

const atk = { playing:false, time:0, prevU:0, pause:0, lastEmitAnim:-1 };
let flash = 0;

function setSwordPose(px, py, pz, rx, ry, rz){
  swordRoot.position.set(px, py, pz);
  swordRoot.rotation.set(rx, ry, rz);
}

function startAttack(key, silent){
  if (key) state.attack = key;
  atk.playing = true;
  atk.pause = 0;
  atk.time = 0;
  atk.prevU = 0;
  atk.lastEmitAnim = -1;
  $$('.btn.atk').forEach(b => b.classList.toggle('active', b.dataset.attack === state.attack));
  $('#atkName').textContent = ATTACKS[state.attack].name;
  if (!silent) toast('⚔ ' + ATTACKS[state.attack].name);
}

/* ---------------------------------------------------------- 5) RIBBON TRAIL ENGINE */
const trail = (() => {
  const MAX = 240, MAXSUB = 4;
  const bx=new Float32Array(MAX), by=new Float32Array(MAX), bz=new Float32Array(MAX);
  const tx=new Float32Array(MAX), ty=new Float32Array(MAX), tz=new Float32Array(MAX);
  const ts=new Float32Array(MAX);
  let head = 0, tail = 0, count = 0;

  const rowsMax = (MAX-1)*MAXSUB + 1;
  const posArr = new Float32Array(rowsMax*2*3);
  const uArr   = new Float32Array(rowsMax*2);
  const vArr   = new Float32Array(rowsMax*2);
  const idxArr = new Uint16Array((rowsMax-1)*6);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aU', new THREE.BufferAttribute(uArr, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aV', new THREE.BufferAttribute(vArr, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(idxArr, 1).setUsage(THREE.DynamicDrawUsage));

  const uniforms = {
    uTime:      { value:0 },
    uCore:      { value:new THREE.Color() },
    uMid:       { value:new THREE.Color() },
    uFade:      { value:new THREE.Color() },
    uCoreA:     { value:1 },
    uMidA:      { value:0.85 },
    uFadeA:     { value:0 },
    uIntensity: { value:3.2 },
    uPan:       { value:2.5 },
    uTiling:    { value:4 },
    uEdge:      { value:0.35 }
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aU;
      attribute float aV;
      varying float vU;
      varying float vV;
      void main(){
        vU = aU; vV = aV;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3  uCore, uMid, uFade;
      uniform float uCoreA, uMidA, uFadeA;
      uniform float uIntensity, uPan, uTiling, uEdge, uTime;
      varying float vU;
      varying float vV;
      void main(){
        vec3 col = mix(uCore, uMid, smoothstep(0.0, 0.5, vU));
        col      = mix(col,   uFade, smoothstep(0.5, 1.0, vU));
        float a  = mix(uCoreA, uMidA, smoothstep(0.0, 0.5, vU));
        a        = mix(a,    uFadeA, smoothstep(0.5, 1.0, vU));
        float edge = pow(max(sin(vV * 3.14159265), 0.0), mix(3.5, 0.45, uEdge));
        float flow = vU * uTiling - uTime * uPan;
        float band = 0.74 + 0.26 * sin(flow * 6.2831853 + sin(flow * 12.5663706) * 0.7);
        float fine = 0.90 + 0.10 * sin(flow * 31.4159265);
        float headBoost = 1.0 + 1.7 * exp(-vU * 9.0);
        a *= edge;
        vec3 rgb = col * uIntensity * band * fine * headBoost;
        gl_FragColor = vec4(rgb, a);
      }`
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  scene.add(mesh);

  // Catmull-Rom (uniform) — controlled, zero allocation
  const c0=[0,0,0], c1=[0,0,0], c2=[0,0,0], c3=[0,0,0];
  function cr(o, p0, p1, p2, p3, t){
    const t2=t*t, t3=t2*t;
    for (let j=0;j<3;j++){
      o[j] = 0.5 * ((2*p1[j]) + (-p0[j]+p2[j])*t +
        (2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t2 +
        (-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t3);
    }
  }
  function get(arrX,arrY,arrZ,i,o){ const k=(tail+i)%MAX; o[0]=arrX[k]; o[1]=arrY[k]; o[2]=arrZ[k]; }
  function samp(arrX,arrY,arrZ,i,local,o){
    const n = count;
    const i0=clamp(i-1,0,n-1), i1=clamp(i,0,n-1), i2=clamp(i+1,0,n-1), i3=clamp(i+2,0,n-1);
    get(arrX,arrY,arrZ,i0,c0); get(arrX,arrY,arrZ,i1,c1); get(arrX,arrY,arrZ,i2,c2); get(arrX,arrY,arrZ,i3,c3);
    cr(o, c0, c1, c2, c3, local);
  }

  const pt=[0,0,0], pb=[0,0,0];
  let lastDirX=0, lastDirY=1, lastDirZ=0;

  function pushSample(bxw,byw,bzw, txw,tyw,tzw, time){
    bx[head]=bxw; by[head]=byw; bz[head]=bzw;
    tx[head]=txw; ty[head]=tyw; tz[head]=tzw;
    ts[head]=time;
    head=(head+1)%MAX;
    if (count===MAX) tail=(tail+1)%MAX; else count++;
  }

  function expire(now){
    while (count>0 && now - ts[tail] > state.lifetime){ tail=(tail+1)%MAX; count--; }
  }

  let liveVerts = 0;

  function rebuild(){
    if (count < 2){ mesh.visible=false; liveVerts=0; return; }
    mesh.visible = true;
    const sub = (state.smooth>0 && count>=4) ? state.smooth : 1;
    const M = Math.min((count-1)*sub + 1, rowsMax);
    const inv = 1/(M-1);
    let p=0, wPow;
    for (let r=0; r<M; r++){
      const f = r/sub;
      const i = Math.min(Math.floor(f), count-2);
      const local = f - i;
      const u = r*inv;
      samp(tx,ty,tz,i,local,pt);
      samp(bx,by,bz,i,local,pb);
      let dx = pt[0]-pb[0], dy = pt[1]-pb[1], dz = pt[2]-pb[2];
      const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
      if (len > 1e-6){ dx/=len; dy/=len; dz/=len; lastDirX=dx; lastDirY=dy; lastDirZ=dz; }
      else { dx=lastDirX; dy=lastDirY; dz=lastDirZ; }
      wPow = lerp(state.wMax, state.wMin, Math.pow(u, 0.85));
      const hw = wPow*0.5;
      const cx = (pt[0]+pb[0])*0.5, cy=(pt[1]+pb[1])*0.5, cz=(pt[2]+pb[2])*0.5;
      const o = p*3;
      posArr[o  ] = cx - dx*hw; posArr[o+1] = cy - dy*hw; posArr[o+2] = cz - dz*hw;
      posArr[o+3] = cx + dx*hw; posArr[o+4] = cy + dy*hw; posArr[o+5] = cz + dz*hw;
      uArr[p] = u; uArr[p+1] = u;
      vArr[p] = 0; vArr[p+1] = 1;
      p += 2;
    }
    let q = 0;
    for (let r=0; r<M-1; r++){
      const a = r*2;
      idxArr[q++]=a; idxArr[q++]=a+1; idxArr[q++]=a+2;
      idxArr[q++]=a+1; idxArr[q++]=a+3; idxArr[q++]=a+2;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aU.needsUpdate = true;
    geo.attributes.aV.needsUpdate = true;
    geo.index.needsUpdate = true;
    geo.setDrawRange(0, (M-1)*6);
    liveVerts = M*2;
  }

  function update(now){
    uniforms.uTime.value = now;
    expire(now);
    rebuild();
  }

  function setParams(){
    uniforms.uCore.value.set(state.coreC).convertSRGBToLinear();
    uniforms.uMid.value.set(state.midC).convertSRGBToLinear();
    uniforms.uFade.value.set(state.fadeC).convertSRGBToLinear();
    uniforms.uCoreA.value = state.coreA;
    uniforms.uMidA.value = state.midA;
    uniforms.uFadeA.value = state.fadeA;
    uniforms.uIntensity.value = state.intensity;
    uniforms.uPan.value = state.pan;
    uniforms.uTiling.value = state.tiling;
    uniforms.uEdge.value = state.edge;
    mat.blending = state.blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending;
    glowLight.color.set(state.coreC);
  }

  function clear(){ head=tail=count=0; mesh.visible=false; liveVerts=0; }

  function getExportData(){
    if (count < 2) return null;
    const sub = (state.smooth>0 && count>=4) ? state.smooth : 1;
    const M = Math.min((count-1)*sub + 1, rowsMax);
    const vertCount = M * 2;
    const faceCount = (M - 1) * 2;
    const verts = posArr.slice(0, vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    for (let i = 0; i < vertCount; i++){
      uvs[i * 2]     = uArr[i];
      uvs[i * 2 + 1] = vArr[i];
    }
    const faces = idxArr.slice(0, (M - 1) * 6);
    return { vertCount, faceCount, verts, uvs, faces };
  }

  return { pushSample, update, setParams, clear, getExportData, get verts(){ return liveVerts; }, mesh };
})();

/* ---------------------------------------------------------- 5.1) BLADE TIP SPARKS ENGINE */
const sparks = (() => {
  const MAX = 140;
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  let count = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));

  // Procedural soft round spark texture
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const ctx = cv.getContext('2d');
  const rad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  rad.addColorStop(0,   'rgba(255,255,255,1)');
  rad.addColorStop(0.3, 'rgba(255,240,200,0.85)');
  rad.addColorStop(0.7, 'rgba(255,170,60,0.35)');
  rad.addColorStop(1,   'rgba(255,80,0,0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, 32, 32);
  const sparkTex = new THREE.CanvasTexture(cv);

  const mat = new THREE.PointsMaterial({
    size: 0.09,
    map: sparkTex,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });

  const pMesh = new THREE.Points(geo, mat);
  pMesh.frustumCulled = false;
  pMesh.renderOrder = 15;
  scene.add(pMesh);

  function emit(x, y, z, baseC, countToSpawn = 2){
    if (!state.sparksOn) return;
    const [cr, cg, cb] = hexToRgb(baseC).map(v => v / 255);
    for (let i = 0; i < countToSpawn; i++){
      const idx = count % MAX;
      const o = idx * 3;
      pos[o]     = x + (Math.random() - 0.5) * 0.04;
      pos[o + 1] = y + (Math.random() - 0.5) * 0.04;
      pos[o + 2] = z + (Math.random() - 0.5) * 0.04;

      vel[o]     = (Math.random() - 0.5) * 1.9;
      vel[o + 1] = (Math.random() - 0.2) * 1.5;
      vel[o + 2] = (Math.random() - 0.5) * 1.9;

      col[o]     = Math.min(1, cr * 1.25);
      col[o + 1] = Math.min(1, cg * 1.25);
      col[o + 2] = Math.min(1, cb * 1.25);

      life[idx] = maxLife[idx] = 0.24 + Math.random() * 0.16;
      if (count < MAX) count++;
    }
  }

  function update(dt){
    if (!state.sparksOn && count === 0){ pMesh.visible = false; return; }
    pMesh.visible = true;
    let active = 0;
    for (let i = 0; i < count; i++){
      if (life[i] > 0){
        life[i] -= dt;
        const o = i * 3;
        pos[o]     += vel[o] * dt;
        pos[o + 1] += vel[o + 1] * dt;
        pos[o + 2] += vel[o + 2] * dt;
        vel[o + 1] -= 2.6 * dt; // gravity pull
        const alpha = Math.max(0, life[i] / maxLife[i]);
        col[o]     *= (0.95 * alpha);
        col[o + 1] *= (0.95 * alpha);
        col[o + 2] *= (0.95 * alpha);
        active++;
      } else {
        const o = i * 3;
        pos[o] = 0; pos[o+1] = -999; pos[o+2] = 0;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    if (active === 0) count = 0;
  }

  function clear(){
    count = 0;
    for (let i = 0; i < MAX * 3; i++){ pos[i] = 0; col[i] = 0; }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return { emit, update, clear };
})();

/* ---- emission: fixed 240 Hz sub-step emission (framerate-independent smooth trail) ---- */
function tryEmit(att, animT, dur, now){
  const u = animT/dur;
  if (u < att.rec[0] || u > att.rec[1]) return;
  if (Math.abs(animT - atk.lastEmitAnim) < 1e-6) return;
  atk.lastEmitAnim = animT;
  poseAt(att, u, tmpP, tmpR);
  setSwordPose(tmpP[0],tmpP[1],tmpP[2], tmpR[0],tmpR[1],tmpR[2]);
  swordRoot.updateMatrixWorld(true);
  tipMarker.getWorldPosition(V_tip);
  baseMarker.getWorldPosition(V_base);
  trail.pushSample(V_base.x,V_base.y,V_base.z, V_tip.x,V_tip.y,V_tip.z, now);
  sparks.emit(V_tip.x, V_tip.y, V_tip.z, state.coreC, 2);
}

function emitSamples(att, dur, t0, t1, now){
  const h = 1/240;
  let tt = Math.ceil(t0/h)*h, guard = 0;
  while (tt <= t1 + 1e-9 && guard < 48){ tryEmit(att, tt, dur, now); tt += h; guard++; }
  tryEmit(att, t1, dur, now);
}

/* ---------------------------------------------------------- 6) POST FX */
composer = new THREE.EffectComposer(renderer);
composer.addPass(new THREE.RenderPass(scene, camera));
bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(512,512), state.bloomStr, 0.55, 0.8);
composer.addPass(bloomPass);
gammaPass = new THREE.ShaderPass(THREE.GammaCorrectionShader);
composer.addPass(gammaPass);

/* ---------------------------------------------------------- 7) UI BUILD */
const sliderUpdaters = [];

function makeSlider(parent, cfg){
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <label class="head"><span>${cfg.label}</span><span class="val"></span></label>
    <input type="range" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}">`;
  const input = row.querySelector('input');
  const valEl = row.querySelector('.val');
  const fmt = cfg.fmt || (v => v.toFixed(2));
  function refreshFill(){
    const pct = (parseFloat(input.value)-cfg.min)/(cfg.max-cfg.min)*100;
    input.style.setProperty('--fill', pct+'%');
  }
  function refresh(){
    valEl.textContent = fmt(parseFloat(input.value)) + (cfg.unit||'');
    refreshFill();
  }
  input.addEventListener('input', () => {
    cfg.set(parseFloat(input.value));
    refresh();
    onParamChanged(cfg.regenPreset!==false);
  });
  input.value = cfg.get();
  refresh();
  parent.appendChild(row);
  sliderUpdaters.push(() => { input.value = cfg.get(); refresh(); });
}

/* -- trail sliders -- */
const trailBox = $('#trailSliders');
makeSlider(trailBox, { label:'Trail Lifetime', min:0.05, max:3, step:0.01, unit:' s',
  get:()=>state.lifetime, set:v=>state.lifetime=v });
makeSlider(trailBox, { label:'Max Width (Blade Head)', min:0.02, max:2, step:0.01, unit:' m',
  get:()=>state.wMax, set:v=>state.wMax=v });
makeSlider(trailBox, { label:'Min Width (Tail Tip)', min:0.0, max:1, step:0.01, unit:' m',
  get:()=>state.wMin, set:v=>state.wMin=v });
makeSlider(trailBox, { label:'Spline Smoothing (Subdiv)', min:0, max:4, step:1, unit:'',
  fmt:v=>v.toFixed(0)+'×', get:()=>state.smooth, set:v=>state.smooth=v|0 });
makeSlider(trailBox, { label:'Emissive Intensity (HDR)', min:0, max:6, step:0.05, unit:'×',
  get:()=>state.intensity, set:v=>state.intensity=v });
makeSlider(trailBox, { label:'UV Scroll Speed (Flow)', min:0, max:8, step:0.05, unit:'',
  get:()=>state.pan, set:v=>state.pan=v });
makeSlider(trailBox, { label:'UV Tiling (Streak Scale)', min:0, max:12, step:0.1, unit:'',
  get:()=>state.tiling, set:v=>state.tiling=v });
makeSlider(trailBox, { label:'Edge Softness (Falloff)', min:0, max:1, step:0.01, unit:'',
  get:()=>state.edge, set:v=>state.edge=v });

/* -- attack speed -- */
makeSlider($('#rowSpeed'), { label:'Animation Speed', min:0.1, max:3, step:0.05, unit:'×',
  get:()=>state.speed, set:v=>state.speed=v });
/* -- bloom strength -- */
makeSlider($('#rowBloom'), { label:'Bloom Intensity', min:0, max:2.5, step:0.05, unit:'',
  get:()=>state.bloomStr, set:v=>{ state.bloomStr=v; bloomPass.strength=v; }, regenPreset:false });

/* -- color rows -- */
const colorRows = $('#colorRows');
const colorDefs = [
  ['coreC','coreA','Core Glow (Head u=0.0)'],
  ['midC','midA','Mid Arc (Body u=0.5)'],
  ['fadeC','fadeA','Tail Fade (End u=1.0)']
];
const gradCtx = $('#gradBar').getContext('2d');

function hexToRgb(hex){
  const h = hex.replace('#','');
  return [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)];
}
function drawGradientBar(){
  const w=512, h=18;
  const g = gradCtx;
  g.clearRect(0,0,w,h);
  const gr = g.createLinearGradient(0,0,w,0);
  gr.addColorStop(0.0, `rgba(${hexToRgb(state.coreC).join(',')},${state.coreA})`);
  gr.addColorStop(0.5, `rgba(${hexToRgb(state.midC).join(',')},${state.midA})`);
  gr.addColorStop(1.0, `rgba(${hexToRgb(state.fadeC).join(',')},${state.fadeA})`);
  g.fillStyle = gr;
  g.fillRect(0,0,w,h);
}

colorDefs.forEach(([cKey,aKey,label]) => {
  const row = document.createElement('div');
  row.className = 'colorRow';
  row.innerHTML = `
    <input type="color" value="${state[cKey]}">
    <span class="cname">${label}<small>${state[cKey].toUpperCase()}</small></span>
    <input type="range" min="0" max="1" step="0.01" value="${state[aKey]}">
    <span class="aval">${state[aKey].toFixed(2)}</span>`;
  const cIn = row.querySelector('input[type=color]');
  const aIn = row.querySelector('input[type=range]');
  const hexLab = row.querySelector('.cname small');
  const aVal = row.querySelector('.aval');
  cIn.addEventListener('input', () => {
    state[cKey] = cIn.value;
    hexLab.textContent = cIn.value.toUpperCase();
    trail.setParams(); drawGradientBar(); onParamChanged();
  });
  function fillA(){
    const pct = (parseFloat(aIn.value)-0)/1*100;
    aIn.style.setProperty('--fill', pct+'%');
  }
  aIn.addEventListener('input', () => {
    state[aKey] = parseFloat(aIn.value);
    aVal.textContent = state[aKey].toFixed(2);
    fillA();
    trail.setParams(); drawGradientBar(); onParamChanged();
  });
  fillA();
  colorRows.appendChild(row);
  sliderUpdaters.push(() => {
    cIn.value = state[cKey]; hexLab.textContent = state[cKey].toUpperCase();
    aIn.value = state[aKey]; aVal.textContent = state[aKey].toFixed(2); fillA();
  });
});

/* -- blend segmented -- */
$('#segBlend').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.blend = b.dataset.blend;
  $$('#segBlend button').forEach(x => x.classList.toggle('active', x === b));
  trail.setParams();
  onParamChanged();
  toast(state.blend === 'add' ? '✨ Additive Glow (Emissive)' : '🌫 Alpha Blend (Stylized / Smoke)');
});
function syncBlendSeg(){
  $$('#segBlend button').forEach(x => x.classList.toggle('active', x.dataset.blend === state.blend));
}

/* -- backdrop selector -- */
function setBackdrop(mode){
  state.backdrop = mode;
  let bgHex = 0x05060a, stageHex = 0x0e1118, gridHex = 0x32405a;
  if (mode === 'slate'){
    bgHex = 0x141824; stageHex = 0x1f2738; gridHex = 0x475569;
  } else if (mode === 'navy'){
    bgHex = 0x071124; stageHex = 0x0f1c38; gridHex = 0x1e3a8a;
  }
  scene.background.setHex(bgHex);
  if (scene.fog) scene.fog.color.setHex(bgHex);
  if (stageMat) stageMat.color.setHex(stageHex);
  $$('#segBackdrop button').forEach(b => b.classList.toggle('active', b.dataset.bg === mode));
}
$('#segBackdrop').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  setBackdrop(b.dataset.bg);
  toast('🌌 Backdrop: ' + b.textContent);
});

/* -- presets -- */
const presetsBox = $('#presets');
Object.entries(PRESETS).forEach(([key, p]) => {
  const el = document.createElement('button');
  el.className = 'preset' + (key===state.presetKey ? ' active' : '');
  el.dataset.key = key;
  el.innerHTML = `
    <span class="sw"><i style="background:${p.core[0]}"></i><i style="background:${p.mid[0]}"></i><i style="background:${p.fade[0]}"></i></span>
    <span class="ptxt"><b>${p.label}</b><span>${p.desc}</span></span>
    <span class="go">APPLY ›</span>`;
  el.addEventListener('click', () => applyPreset(key));
  presetsBox.appendChild(el);
});

function applyPreset(key){
  const p = PRESETS[key];
  state.presetKey = key;
  state.lifetime=p.lifetime; state.wMax=p.wMax; state.wMin=p.wMin; state.smooth=p.smooth;
  state.intensity=p.intensity; state.pan=p.pan; state.tiling=p.tiling; state.edge=p.edge;
  state.blend=p.blend;
  state.coreC=p.core[0]; state.coreA=p.core[1];
  state.midC=p.mid[0];   state.midA=p.mid[1];
  state.fadeC=p.fade[0]; state.fadeA=p.fade[1];
  sliderUpdaters.forEach(f => f());
  syncBlendSeg();
  trail.setParams();
  drawGradientBar();
  $$('.preset').forEach(el => el.classList.toggle('active', el.dataset.key === key));
  $('#presetChip').textContent = p.label;
  $('#presetChip').style.display = '';
  regenExport();
  trail.clear();
  sparks.clear();
  startAttack(p.attack, true);
  toast('✨ Preset: ' + p.label + ' — ' + ATTACKS[p.attack].name);
}

function markCustom(){
  if (state.presetKey !== null){
    state.presetKey = null;
    $$('.preset').forEach(el => el.classList.remove('active'));
    $('#presetChip').textContent = 'Custom Parameters';
  }
}

function onParamChanged(updatePreset){
  if (updatePreset !== false) markCustom();
  trail.setParams();
  regenExport();
}

/* -- toggles -- */
$('#chkLoop').addEventListener('change', e => { state.loop = e.target.checked; });
$('#chkBloom').addEventListener('change', e => {
  state.bloomOn = e.target.checked;
  bloomPass.enabled = state.bloomOn;
});
$('#chkSparks').addEventListener('change', e => {
  state.sparksOn = e.target.checked;
  if (!state.sparksOn) sparks.clear();
});
$('#chkMarkers').addEventListener('change', e => {
  state.markers = e.target.checked;
  tipMarker.visible = baseMarker.visible = state.markers;
});
$('#chkGlow').addEventListener('change', e => { state.glow = e.target.checked; });
$('#chkGrid').addEventListener('change', e => { state.grid = e.target.checked; grid.visible = state.grid; });

/* -- attack buttons -- */
$$('.btn.atk').forEach(b => b.addEventListener('click', () => {
  startAttack(b.dataset.attack);
}));
$('#btnSwing').addEventListener('click', () => startAttack());

/* -- keyboard -- */
window.addEventListener('keydown', e => {
  if (e.code === 'Space'){ e.preventDefault(); startAttack(); }
  else if (e.code === 'Digit1') startAttack('horizontal');
  else if (e.code === 'Digit2') startAttack('chop');
  else if (e.code === 'Digit3') startAttack('whirl');
  else if (e.code === 'Digit4') startAttack('upper');
  else if (e.code === 'KeyL'){
    $('#chkLoop').checked = !$('#chkLoop').checked;
    state.loop = $('#chkLoop').checked;
    toast('Loop: ' + (state.loop ? 'ENABLED' : 'DISABLED'));
  }
});

/* ---------------------------------------------------------- 8) UNITY EXPORT GENERATORS */
const C = {
  hex: h => h.toUpperCase(),
  f: v => { const s = v.toFixed(3).replace(/0+$/,'').replace(/\.$/,''); return s === '' ? '0' : s; }
};

function genMeta(){
  return `Lifetime ${f2(state.lifetime)}s  •  Width ${f2(state.wMax)}m → ${f2(state.wMin)}m  •  ` +
         `${state.blend==='add'?'Additive':'Alpha'}  •  ${C.hex(state.coreC)} → ${C.hex(state.midC)} → ${C.hex(state.fadeC)}  •  ` +
         `Intensity ${f2(state.intensity)}×  •  Tiling ${f1(state.tiling)}  •  Pan ${f2(state.pan)}`;
}

function hexLinear(hex){ // sRGB hex -> Unity linear color components
  const [r,g,b] = hexToRgb(hex).map(v => Math.pow(v/255, 2.2));
  return `${r.toFixed(4)}f, ${g.toFixed(4)}f, ${b.toFixed(4)}f, 1f`;
}

function genTabA(){
  const wm = C.f(state.wMin - state.wMax);
  return `// ============================================================================
//  SlashTrailSetup.cs   —   TAB A  (Unity Built-in TrailRenderer Setup)
//  Programmatically configures Unity's TrailRenderer component:
//    • Width taper -> AnimationCurve (Head Max -> Tail Min)
//    • Color gradient -> Gradient (Core / Mid / Fade colors + Alpha keys)
//  SETUP: Attach this script to the Weapon Tip GameObject.
//  Source: SLASH FORGE — 3D Melee Weapon Trail & Slash VFX Studio
// ============================================================================
using UnityEngine;
using UnityEngine.Rendering;

[RequireComponent(typeof(TrailRenderer))]
public class SlashTrailSetup : MonoBehaviour
{
    [Header("Imported Parameters from SLASH FORGE")]
    public float Lifetime  = ${C.f(state.lifetime)}f;   // Trail lifetime in seconds
    public float MaxWidth  = ${C.f(state.wMax)}f;   // Blade side width (m)
    public float MinWidth  = ${C.f(state.wMin)}f;   // Tail taper width (m)
    public float Intensity = ${C.f(state.intensity)}f;   // HDR emissive multiplier
    public Color CoreColor = new Color(${hexLinear(state.coreC)});   // u = 0.0
    public Color MidColor  = new Color(${hexLinear(state.midC)});   // u = 0.5
    public Color FadeColor = new Color(${hexLinear(state.fadeC)});   // u = 1.0
    [Range(0, 1)] public float CoreAlpha = ${C.f(state.coreA)}f;
    [Range(0, 1)] public float MidAlpha  = ${C.f(state.midA)}f;
    [Range(0, 1)] public float FadeAlpha = ${C.f(state.fadeA)}f;

    void Awake()
    {
        Apply(GetComponent<TrailRenderer>());
    }

    public void Apply(TrailRenderer tr)
    {
        tr.time = Lifetime;

        // --- Width Curve: Head -> Tail Taper ---
        tr.widthMultiplier = 1f;
        tr.widthCurve = new AnimationCurve(
            new Keyframe(0f, MaxWidth, 0f, ${wm}f * 1.2f),
            new Keyframe(1f, MinWidth, ${wm}f * 0.6f, 0f));

        // --- Color Gradient: Core -> Mid -> Fade ---
        var grad = new Gradient();
        grad.SetKeys(
            new[] {
                new GradientColorKey(CoreColor, 0f),
                new GradientColorKey(MidColor,  0.5f),
                new GradientColorKey(FadeColor, 1f)
            },
            new[] {
                new GradientAlphaKey(CoreAlpha, 0f),
                new GradientAlphaKey(MidAlpha,  0.5f),
                new GradientAlphaKey(FadeAlpha, 1f)
            });
        tr.colorGradient = grad;

        // --- Quality & Alignment Configuration ---
        tr.minVertexDistance    = 0.015f;
        tr.numCapVertices       = 6;
        tr.numCornerVertices    = 4;
        tr.alignment            = LineAlignment.View;
        tr.textureMode          = LineTextureMode.Stretch;
        tr.generateLightingData = false;
        tr.shadowCastingMode    = ShadowCastingMode.Off;
        tr.receiveShadows       = false;
        tr.autodestruct         = false;
        tr.emitting             = true;
    }
}
`;
}

function genTabB(){
  return `// ============================================================================
//  MeleeWeaponTrail.cs   —   TAB B  (Procedural 2-Point Weapon Ribbon Mesh)
//  Constructs dynamic ribbon geometry between Tip & Base transforms every frame.
//  Zero managed heap allocations at runtime (Fixed 120Hz sub-step ring buffer).
// ----------------------------------------------------------------------------
//  SETUP:
//   1) Attach this component to your weapon root GameObject.
//   2) Assign BaseTransform (hilt) & TipTransform (blade tip).
//   3) Assign TrailMaterial (URP shader from Tab C).
//   4) (Optional) Assign TipSparksEmitter for dynamic collision/swing sparks.
//   5) Trigger via Animator Events: BeginSlash() at start, EndSlash() at finish.
// ============================================================================
using UnityEngine;
using UnityEngine.Rendering;

[DisallowMultipleComponent]
public class MeleeWeaponTrail : MonoBehaviour
{
    [Header("Weapon Transform Rig (Required)")]
    public Transform BaseTransform;   // Blade hilt / base point
    public Transform TipTransform;    // Blade tip point

    [Header("Trail Dimensions")]
    public float Lifetime = ${C.f(state.lifetime)}f;
    public float MaxWidth = ${C.f(state.wMax)}f;   // Current swing width
    public float MinWidth = ${C.f(state.wMin)}f;   // Tail taper width
    [Tooltip("Optional custom width curve. If null, linear lerp is used.")]
    public AnimationCurve WidthCurve = null;

    [Header("Color & Material")]
    public Gradient ColorGradient;
    public Material TrailMaterial;    // Material using VFX/SlashTrail_URP
    [Range(0f, 8f)]  public float ScrollSpeed = ${C.f(state.pan)}f;
    [Range(0f, 12f)] public float Tiling      = ${C.f(state.tiling)}f;
    [Range(0f, 8f)]  public float Intensity   = ${C.f(state.intensity)}f;

    [Header("Sparks Particle Integration (Optional)")]
    public ParticleSystem TipSparksEmitter;

    [Header("Sampling Configuration")]
    [Tooltip("Fixed sub-step interval. Lower value = smoother arc.")]
    public float EmitTimestep = 1f / 120f;
    public bool Emitting = false;

    // ---- Ring Buffer ----
    const int CAP = 256;
    struct Sample { public Vector3 b, t; public float time; }
    readonly Sample[] ring = new Sample[CAP];
    int head, tail, count;

    // ---- Pre-allocated Mesh Buffers (Zero Managed GC) ----
    Mesh mesh;
    readonly Vector3[] verts = new Vector3[CAP * 2];
    readonly Vector2[] uvs   = new Vector2[CAP * 2];
    readonly Color[]   cols  = new Color[CAP * 2];
    readonly int[]     tris  = new int[(CAP - 1) * 6];

    Vector3 prevB, prevT, lastDir = Vector3.up;
    bool hasPrev;
    static readonly int[] Degenerate = { 0, 0, 0, 0, 0, 0 };

    void Awake()
    {
        mesh = new Mesh { name = "MeleeWeaponTrail_Mesh" };
        mesh.MarkDynamic();

        var mf = gameObject.AddComponent<MeshFilter>();
        var mr = gameObject.AddComponent<MeshRenderer>();
        mf.sharedMesh = mesh;
        mr.sharedMaterial = TrailMaterial;
        mr.shadowCastingMode = ShadowCastingMode.Off;
        mr.receiveShadows = false;
        mr.lightProbeUsage = LightProbeUsage.Off;
        mr.reflectionProbeUsage = ReflectionProbeUsage.Off;

        if (ColorGradient == null || ColorGradient.colorKeys.Length < 2)
            ResetGradient();
    }

    void ResetGradient()
    {
        ColorGradient = BuildGradient(
            Hex("#${C.hex(state.coreC).substring(1)}"),
            Hex("#${C.hex(state.midC).substring(1)}"),
            Hex("#${C.hex(state.fadeC).substring(1)}"),
            ${C.f(state.coreA)}f, ${C.f(state.midA)}f, ${C.f(state.fadeA)}f);
    }

    public void BeginSlash()
    {
        Emitting = true;
        hasPrev = false;
        if (TipSparksEmitter != null && !TipSparksEmitter.isPlaying)
            TipSparksEmitter.Play();
    }

    public void EndSlash()
    {
        Emitting = false;
        if (TipSparksEmitter != null)
            TipSparksEmitter.Stop();
    }

    public void ClearTrail()
    {
        head = tail = count = 0;
        hasPrev = false;
        mesh.Clear(false);
    }

    void LateUpdate()
    {
        if (BaseTransform == null || TipTransform == null) return;
        float now = Time.time;

        // 1) SUB-STEP EMISSION (Framerate-independent continuity)
        Vector3 cb = BaseTransform.position;
        Vector3 ct = TipTransform.position;
        if (Emitting)
        {
            if (!hasPrev) { prevB = cb; prevT = ct; hasPrev = true; }
            float dt = Mathf.Max(Time.deltaTime, 1e-5f);
            int steps = Mathf.Clamp(Mathf.CeilToInt(dt / Mathf.Max(EmitTimestep, 1e-4f)), 1, 8);
            for (int s = 1; s <= steps; s++)
            {
                float f = s / (float)steps;
                PushSample(Vector3.Lerp(prevB, cb, f), Vector3.Lerp(prevT, ct, f), now - dt + dt * f);
            }
            prevB = cb; prevT = ct;
        }
        else hasPrev = false;

        // 2) EXPIRE AGED SAMPLES
        while (count > 0 && now - ring[tail].time > Lifetime)
        {
            tail = (tail + 1) % CAP;
            count--;
        }

        // 3) REBUILD RIBBON MESH (Zero Garbage Collection)
        RebuildMesh(now);
    }

    void PushSample(Vector3 b, Vector3 t, float time)
    {
        ring[head].b = b; ring[head].t = t; ring[head].time = time;
        head = (head + 1) % CAP;
        if (count == CAP) tail = (tail + 1) % CAP;
        else count++;
    }

    void RebuildMesh(float now)
    {
        if (count < 2) { mesh.Clear(false); return; }

        float invLife = 1f / Mathf.Max(Lifetime, 1e-4f);
        Vector3 dir = lastDir;

        for (int k = 0; k < count; k++)
        {
            int idx = (tail + k) % CAP;
            float u = Mathf.Clamp01((now - ring[idx].time) * invLife); // 0 = head, 1 = tail

            Vector3 seg = ring[idx].t - ring[idx].b;
            float len = seg.magnitude;
            if (len > 1e-5f) { dir = seg * (1f / len); lastDir = dir; }

            Vector3 center = (ring[idx].b + ring[idx].t) * 0.5f;

            float w = Mathf.Lerp(MaxWidth, MinWidth, u);
            if (WidthCurve != null && WidthCurve.length > 0) w *= WidthCurve.Evaluate(u);
            Vector3 half = dir * (w * 0.5f);

            int v0 = k * 2;
            verts[v0]     = center - half;
            verts[v0 + 1] = center + half;
            uvs[v0]       = new Vector2(u, 0f);
            uvs[v0 + 1]   = new Vector2(u, 1f);
            Color c = ColorGradient != null ? ColorGradient.Evaluate(u) : Color.white;
            cols[v0] = c; cols[v0 + 1] = c;
        }

        int quads = count - 1;
        for (int q = 0; q < quads; q++)
        {
            int i0 = q * 2, o = q * 6;
            tris[o    ] = i0;     tris[o + 1] = i0 + 1; tris[o + 2] = i0 + 2;
            tris[o + 3] = i0 + 1; tris[o + 4] = i0 + 3; tris[o + 5] = i0 + 2;
        }
        for (int q = quads; q < CAP - 1; q++)
            System.Array.Copy(Degenerate, 0, tris, q * 6, 6);

        mesh.Clear(false);
        mesh.vertices  = verts;
        mesh.uv        = uvs;
        mesh.colors    = cols;
        mesh.triangles = tris;
        mesh.RecalculateBounds();
    }

    static Gradient BuildGradient(Color a, Color b, Color c, float aa, float ab, float ac)
    {
        var g = new Gradient();
        g.SetKeys(
            new[] { new GradientColorKey(a, 0f), new GradientColorKey(b, 0.5f), new GradientColorKey(c, 1f) },
            new[] { new GradientAlphaKey(aa, 0f), new GradientAlphaKey(ab, 0.5f), new GradientAlphaKey(ac, 1f) });
        return g;
    }

    static Color Hex(string hex)
    {
        if (ColorUtility.TryParseHtmlString(hex, out var c)) return c;
        return Color.white;
    }

    void OnDrawGizmosSelected()
    {
        if (BaseTransform) { Gizmos.color = new Color(0.2f, 0.55f, 1f);  Gizmos.DrawSphere(BaseTransform.position, 0.03f); }
        if (TipTransform)  { Gizmos.color = new Color(1f, 0.25f, 0.3f);  Gizmos.DrawSphere(TipTransform.position, 0.03f); }
    }
}
`;
}

function genTabC(){
  const blendDst = state.blend === 'add' ? '1  // Additive Glow  -> Blend SrcAlpha One' : '10  // Alpha Blend -> Blend SrcAlpha OneMinusSrcAlpha';
  return `// ============================================================================
//  SlashTrail_URP.shader   —   TAB C  (Unity URP Unlit Slash Trail Shader)
//  Vertex Color (Gradient) + UV Scrolling Streaks + Edge Falloff.
//  Compatible with Universal Render Pipeline (URP).
// ============================================================================
//  MATERIAL CONFIGURATION:
//    Surface Type     : Transparent
//    Blending Mode    : ${state.blend === 'add' ? 'Additive (SrcAlpha, One)' : 'Alpha (SrcAlpha, OneMinusSrcAlpha)'}
//    Depth Write      : Off
//    Cull Mode        : Off (Double-sided)
//    Cast Shadows     : Off
//  STUDIO COLOR VALUES (HDR Picker):
//    Core  (u=0.0)    : #${C.hex(state.coreC)}   alpha ${C.f(state.coreA)}
//    Mid   (u=0.5)    : #${C.hex(state.midC)}   alpha ${C.f(state.midA)}
//    Fade  (u=1.0)    : #${C.hex(state.fadeC)}   alpha ${C.f(state.fadeA)}
//    Intensity (HDR)  : ${C.f(state.intensity)}×
// ============================================================================
Shader "VFX/SlashTrail_URP"
{
    Properties
    {
        [Header(Trail Surface)]
        _BaseMap     ("Streak Texture (R)", 2D) = "white" {}
        _Tiling      ("UV Tiling Along Trail", Float) = ${C.f(state.tiling)}
        _ScrollSpeed ("UV Scroll Speed", Float) = ${C.f(state.pan)}
        _Intensity   ("Emissive Intensity (HDR)", Float) = ${C.f(state.intensity)}
        _EdgePower   ("Edge Softness", Range(0.25, 6)) = ${C.f(lerp(3.5, 0.45, state.edge))}
        [Header(Blending)]
        [Enum(SrcAlpha, 2, One, 1)]            _BlendSrc ("Blend Src", Float) = 2
        [Enum(One, 1, OneMinusSrcAlpha, 10)]   _BlendDst ("Blend Dst", Float) = ${blendDst}
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "RenderPipeline"="UniversalPipeline" "IgnoreProjector"="True" }

        Pass
        {
            Name "TrailUnlit"
            Tags { "LightMode"="UniversalForward" }

            Cull Off
            ZWrite Off
            Blend [_BlendSrc] [_BlendDst]

            HLSLPROGRAM
            #pragma vertex   vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;
                float  _Tiling;
                float  _ScrollSpeed;
                float  _Intensity;
                float  _EdgePower;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv         : TEXCOORD0;   // x: along trail (0=head, 1=tail) | y: width (0..1)
                half4  color      : COLOR;       // vertex color gradient
            };

            struct Varyings
            {
                float4 positionHCS : SV_POSITION;
                float2 uv          : TEXCOORD0;
                half4  color       : TEXCOORD1;
            };

            Varyings vert (Attributes IN)
            {
                Varyings OUT;
                OUT.positionHCS = TransformObjectToHClip(IN.positionOS.xyz);
                OUT.uv    = IN.uv;
                OUT.color = IN.color;
                return OUT;
            }

            half4 frag (Varyings IN) : SV_Target
            {
                // Dynamic streak flow along trail
                float2 flowUV = IN.uv * float2(_Tiling, 1.0) - float2(_Time.y * _ScrollSpeed, 0.0);
                half  tex     = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, flowUV).r;

                // Edge falloff across width
                half  edge    = pow(saturate(sin(IN.uv.y * 3.14159265)), _EdgePower);

                half3 rgb = IN.color.rgb * tex * _Intensity;
                half  a   = IN.color.a * edge * lerp(1.0, tex, 0.35);
                return half4(rgb, a);
            }
            ENDHLSL
        }
    }
}
`;
}

function genTabD(){
  return `// ============================================================================
//  SlashTipSparks.cs   —   TAB D  (Blade Tip Particle Spark Emitter)
//  Lightweight, high-impact particle burst synchronizer for blade tip sparks.
//  Attach this script to a child GameObject with a ParticleSystem component.
// ============================================================================
using UnityEngine;

[RequireComponent(typeof(ParticleSystem))]
public class SlashTipSparks : MonoBehaviour
{
    [Header("Blade Tip Anchor")]
    public Transform TipTransform;

    [Header("Visual Configuration")]
    public Color SparkColor = new Color(${hexLinear(state.coreC)});
    public float SparkSpeed = 2.4f;

    private ParticleSystem ps;
    private ParticleSystem.EmissionModule emission;

    void Awake()
    {
        ps = GetComponent<ParticleSystem>();
        emission = ps.emission;
        emission.enabled = false;

        var main = ps.main;
        main.startColor = SparkColor;
        main.startSpeed = SparkSpeed;
        main.startLifetime = 0.28f;
        main.startSize = 0.08f;
        main.simulationSpace = ParticleSystemSimulationSpace.World;
    }

    void LateUpdate()
    {
        if (TipTransform != null)
        {
            transform.position = TipTransform.position;
        }
    }

    public void StartSparks()
    {
        emission.enabled = true;
        ps.Play();
    }

    public void StopSparks()
    {
        emission.enabled = false;
        ps.Stop(true, ParticleSystemStopBehavior.StopEmitting);
    }
}
`;
}

/* -- code display + tabs -- */
let activeTab = 'a';
const codeOut = $('#codeOut');
const exportMeta = $('#exportMeta');

function highlight(code){
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*")|\b(using|namespace|public|private|protected|void|float|int|bool|class|struct|const|readonly|new|return|if|else|for|while|in|out|ref|null|true|false|static|override|virtual|enum|this|var|Shader|Properties|SubShader|Pass|HLSLPROGRAM|ENDHLSL|CBUFFER_START|CBUFFER_END|half|half2|half3|half4|float2|float3|float4|Float|Range|Enum|Header|Tooltip|Color|Gradient|AnimationCurve|Material|Transform|Vector2|Vector3|Mesh|RequireComponent|DisallowMultipleComponent|Tags|Default|Fixed|ParticleSystem|EmissionModule)\b|(\b\d+\.?\d*f?\b)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(code))){
    out += esc(code.slice(last, m.index));
    if (m[1])      out += '<span class="cm">'  + esc(m[1]) + '</span>';
    else if (m[2]) out += '<span class="str">' + esc(m[2]) + '</span>';
    else if (m[3]) out += '<span class="kw">'  + esc(m[3]) + '</span>';
    else           out += '<span class="num">' + esc(m[4]) + '</span>';
    last = m.index + m[0].length;
  }
  out += esc(code.slice(last));
  return out;
}

function getActiveCode(){
  if (activeTab === 'a') return genTabA();
  if (activeTab === 'b') return genTabB();
  if (activeTab === 'c') return genTabC();
  return genTabD();
}

function regenExport(){
  exportMeta.textContent = genMeta();
  codeOut.innerHTML = highlight(getActiveCode());
}

$$('.tabs button').forEach(b => b.addEventListener('click', () => {
  activeTab = b.dataset.tab;
  $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  regenExport();
}));

$('#btnCopy').addEventListener('click', async () => {
  const code = getActiveCode();
  const labelMap = { a:'TrailRenderer Setup', b:'MeleeWeaponTrail.cs', c:'URP Trail Shader', d:'Tip Sparks Setup' };
  const label = labelMap[activeTab] || 'Code';
  try {
    await navigator.clipboard.writeText(code);
    toast('⧉ Copied: ' + label);
  } catch (err) {
    const ta = document.createElement('textarea');
    ta.value = code;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch(e2){ ok = false; }
    ta.remove();
    toast(ok ? '⧉ Copied: ' + label : '⚠ Copy failed — please select code manually');
  }
});

/* -- OBJ Mesh Exporter -- */
function exportObj(){
  const data = trail.getExportData();
  if (!data || data.verts.length === 0){
    toast('⚠ No ribbon trail geometry active to export.');
    return;
  }
  let obj = `# Slash Forge Ribbon Trail Export\n# Preset: ${state.presetKey || 'Custom'} - Attack: ${state.attack}\n# Vertices: ${data.vertCount}, Faces: ${data.faceCount}\no SlashRibbon\n`;
  for (let i = 0; i < data.verts.length; i += 3){
    obj += `v ${data.verts[i].toFixed(5)} ${data.verts[i+1].toFixed(5)} ${data.verts[i+2].toFixed(5)}\n`;
  }
  for (let i = 0; i < data.uvs.length; i += 2){
    obj += `vt ${data.uvs[i].toFixed(5)} ${data.uvs[i+1].toFixed(5)}\n`;
  }
  for (let i = 0; i < data.faces.length; i += 3){
    const a = data.faces[i] + 1;
    const b = data.faces[i+1] + 1;
    const c = data.faces[i+2] + 1;
    obj += `f ${a}/${a} ${b}/${b} ${c}/${c}\n`;
  }

  const blob = new Blob([obj], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SlashRibbon_${state.presetKey || 'custom'}_${state.attack}.obj`;
  a.click();
  URL.revokeObjectURL(url);
  toast('💾 Exported: ' + a.download);
}
$('#btnExportObj').addEventListener('click', exportObj);

/* ---------------------------------------------------------- 9) RESIZE */
function resize(){
  const w = viewportEl.clientWidth, h = viewportEl.clientHeight;
  if (!w || !h) return;
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  composer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
}
new ResizeObserver(resize).observe(viewportEl);
resize();

/* ---------------------------------------------------------- 10) MAIN LOOP */
const clock = new THREE.Clock();
let elapsed = 0;
let fpsFrames = 0, fpsTime = 0, msAcc = 0;
const chipState = $('#atkState');

function updateAttack(dt, now){
  const att = ATTACKS[state.attack];
  const dur = att.dur / state.speed;

  if (atk.playing){
    if (atk.pause > 0){
      atk.pause -= dt;
      if (atk.pause <= 0) startAttack(state.attack, true);
    } else {
      const prev = atk.time;
      atk.time += dt;
      if (atk.time >= dur){
        if (state.loop){
          emitSamples(att, dur, Math.min(prev,dur), dur, now);
          atk.time = 0;
          atk.lastEmitAnim = -1;
          atk.pause = 0.30;
        } else {
          atk.time = dur;
          atk.playing = false;
        }
      } else {
        emitSamples(att, dur, prev, atk.time, now);
      }
      const uNow = atk.time/dur;
      if (atk.prevU < att.rec[0] && uNow >= att.rec[0]) flash = 1;
      atk.prevU = uNow;
    }
  }

  if (atk.playing && atk.pause <= 0){
    poseAt(att, atk.time/dur, tmpP, tmpR);
    setSwordPose(tmpP[0],tmpP[1],tmpP[2], tmpR[0],tmpR[1],tmpR[2]);
    chipState.textContent = 'SWINGING';
    chipState.style.color = '#38bdf8';
  } else {
    // Idle sword sway animation
    setSwordPose(
      0.30 + Math.sin(elapsed*1.5)*0.006,
      1.30 + Math.sin(elapsed*1.1)*0.012,
      0.10,
      0.10 + Math.sin(elapsed*1.3)*0.010,
      -0.25 + Math.sin(elapsed*0.9)*0.015,
      -0.12 + Math.sin(elapsed*1.7)*0.012
    );
    chipState.textContent = atk.playing ? 'RECOVERING' : 'READY';
    chipState.style.color = '';
  }
  swordRoot.updateMatrixWorld(true);
}

let statTimer = 0;
function tick(){
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  const now = elapsed;

  updateAttack(dt, now);
  trail.update(now);
  sparks.update(dt);

  // Dynamic glow light
  flash *= Math.exp(-dt*5.5);
  if (state.glow){
    tipMarker.getWorldPosition(glowLight.position);
    glowLight.intensity = 0.25 + flash*5.0 + (atk.playing ? 0.3 : 0);
  } else {
    glowLight.intensity = 0;
  }

  renderer.info.reset();
  composer.render();

  // Stats
  fpsFrames++; fpsTime += dt; msAcc += dt*1000; statTimer += dt;
  if (statTimer >= 0.5){
    const fps = fpsFrames/fpsTime;
    const stFps = $('#stFps');
    stFps.textContent = fps.toFixed(0);
    stFps.classList.toggle('fps-good', fps >= 50);
    stFps.classList.toggle('fps-mid', fps < 50 && fps >= 28);
    stFps.classList.toggle('fps-bad', fps < 28);
    $('#stMs').textContent = (msAcc/fpsFrames).toFixed(1) + 'ms';
    $('#stTris').textContent = fmtK(renderer.info.render.triangles);
    $('#stRibbon').textContent = fmtK(trail.verts) + 'v';
    $('#stCalls').textContent = renderer.info.render.calls;
    fpsFrames = 0; fpsTime = 0; msAcc = 0; statTimer = 0;
  }

  controls.update();
}

/* ---------------------------------------------------------- 11) INIT */
trail.setParams();
drawGradientBar();
regenExport();
bloomPass.strength = state.bloomStr;
bloomPass.enabled = state.bloomOn;
tick();

setTimeout(() => startAttack('horizontal', true), 500);

// Global debug exposure
window.__SLASHFORGE__ = { state, ATTACKS, trail, sparks, startAttack, applyPreset, exportObj };
})();
