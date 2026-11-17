#!/usr/bin/env node
/* SLASH FORGE — headless smoke test
   jsdom (fake DOM) + gerçek THREE r147 matematiği ile tüm uygulama akışı:
   boot, saldırı döngüsü, trail örerken vertex üretimi, preset'ler, blend,
   export tab üretimi, kopyalama fallback'i, klavye. */
const fs = require('fs');
const path = require('path');

/* ---- 1) THREE + vendor (gerçek, node'da) ---- */
const THREE = require('./vendor/three.min.js');
global.THREE = THREE;
for (const v of ['CopyShader.js','LuminosityHighPassShader.js','GammaCorrectionShader.js',
  'EffectComposer.js','ShaderPass.js','RenderPass.js','UnrealBloomPass.js','OrbitControls.js']) {
  require('./vendor/' + v); // THREE global'ine eklenir
}

/* ---- 2) WebGL tarafını stub'la (matematik gerçek kalır) ---- */
THREE.PMREMGenerator = class {
  constructor(){ this.disposed = false; }
  compileEquirectangularShader(){}
  fromEquirectangular(){ return { texture: { dispose(){} } }; }
  dispose(){}
};
let renderCount = 0;
THREE.WebGLRenderer = class {
  constructor(){ this.domElement = document.createElement('canvas'); this.shadowMap = {}; this.info = { autoReset:false, reset(){}, render:{ triangles:0, calls:0 } }; }
  setPixelRatio(){} setSize(){} render(){ renderCount++; this.info.render.triangles = 1234; this.info.render.calls = 7; }
  getContext(){ return {}; }
  getOutputEncoding(){ return 3001; } setOutputEncoding(){}
};
THREE.EffectComposer = class {
  constructor(renderer){ this.renderer = renderer; this.passes = []; }
  addPass(p){ this.passes.push(p); }
  setSize(){} setPixelRatio(){}
  render(){ this.renderer.render(); }
};
THREE.RenderPass = class { constructor(){ this.enabled = true; } };
THREE.ShaderPass  = class { constructor(){ this.enabled = true; } };
THREE.UnrealBloomPass = class { constructor(res, strength){ this.strength = strength; this.enabled = true; } };

/* ---- 3) jsdom ---- */
const { JSDOM } = require('jsdom');
const bodyHtml = fs.readFileSync(path.join(__dirname, 'body.html'), 'utf8');
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body>' + bodyHtml + '</body></html>', {
  url: 'http://localhost/', pretendToBeVisual: false, runScripts: 'outside-only'
});
const { window } = dom;
global.window = window;
global.document = window.document;

// canvas 2d stub (jsdom'da node-canvas yok)
window.HTMLCanvasElement.prototype.getContext = function () {
  return {
    createLinearGradient: () => ({ addColorStop(){} }),
    clearRect(){}, fillRect(){},
    fillStyle: ''
  };
};
window.ResizeObserver = class { constructor(cb){} observe(){} };

// rAF kuyruğu
let rafQueue = [];
window.requestAnimationFrame = cb => { rafQueue.push(cb); return rafQueue.length; };

window.THREE = THREE;
const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

let failed = 0;
const check = (name, cond, info) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (info ? '  -> ' + info : '')); if (!cond) failed++; };

try {
  window.eval(appCode);
  check('app boot (IIFE hatasız çalıştı)', true);
} catch (e) {
  check('app boot (IIFE hatasız çalıştı)', false, e.stack.split('\n').slice(0,4).join(' | '));
  process.exit(1);
}

const S = window.__SLASHFORGE__;
check('debug API açıkta (window.__SLASHFORGE__)', !!S && !!S.state && !!S.trail && !!S.ATTACKS);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pumpFrames(n, stepMs = 16){
  for (let i = 0; i < n; i++){
    const q = rafQueue; rafQueue = [];
    q.forEach(cb => cb());
    await sleep(stepMs);
  }
}

(async () => {
  try {
    /* --- saldırı oynatma + trail üretimi --- */
    S.startAttack('horizontal', true);
    await pumpFrames(70); // ~1.1s gerçek zaman
    const vertsDuring = S.trail.verts;
    check('trail ribbon vertex üretiyor (verts > 0)', vertsDuring > 0, vertsDuring + ' verts');
    check('render çağrıları yapılıyor', renderCount > 40, renderCount + ' frames');

    /* --- 4 saldırının tamamı --- */
    for (const key of ['chop', 'whirl', 'upper', 'horizontal']){
      S.startAttack(key, true);
      await pumpFrames(20);
    }
    check('tüm saldırılar çalıştı (exception yok)', true);

    /* --- preset'ler --- */
    for (const key of Object.keys({ katana:1, fiery:1, neon:1, void:1, holy:1 })){
      S.applyPreset(key);
    }
    check('5 preset uygulandı (exception yok)', true);
    check('preset state doğrudu (holy: lifetime 1.2)', Math.abs(S.state.lifetime - 1.2) < 1e-6, 'lifetime=' + S.state.lifetime);

    /* --- blend + slider input event --- */
    const segAlpha = [...window.document.querySelectorAll('#segBlend button')].find(b => b.dataset.blend === 'alpha');
    segAlpha.dispatchEvent(new window.Event('click', { bubbles: true }));
    check('blend mode alpha\'ya geçti', S.state.blend === 'alpha');
    const lifeSlider = window.document.querySelector('#trailSliders input[type=range]');
    lifeSlider.value = '1.5';
    lifeSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
    check('slider input -> state + custom mod', Math.abs(S.state.lifetime - 1.5) < 1e-6 && S.state.presetKey === null, 'lifetime=' + S.state.lifetime);

    /* --- export kod üretimi (3 sekme) --- */
    const tabs = window.document.querySelectorAll('.tabs button');
    let codeA = '', codeB = '', codeC = '';
    tabs[0].dispatchEvent(new window.Event('click', { bubbles: true }));
    codeA = window.document.querySelector('#codeOut').textContent;
    tabs[1].dispatchEvent(new window.Event('click', { bubbles: true }));
    codeB = window.document.querySelector('#codeOut').textContent;
    tabs[2].dispatchEvent(new window.Event('click', { bubbles: true }));
    codeC = window.document.querySelector('#codeOut').textContent;
    const okA = /class SlashTrailSetup/.test(codeA) && /new AnimationCurve/.test(codeA) && /Lifetime\s+= 1\.5f/.test(codeA);
    check('Tab A: TrailRenderer C# üretildi', okA, okA ? '' : 'lifetime=' + S.state.lifetime + ' | ' + String((codeA.match(/Lifetime.{0,14}/) || ['NO-LIFETIME-LINE'])[0]));
    check('Tab B: MeleeWeaponTrail.cs üretildi', /class MeleeWeaponTrail/.test(codeB) && /RebuildMesh/.test(codeB) && /PushSample/.test(codeB) && !/\.Substring\(/.test(codeB));
    check('Tab B: "deg" yerine statik Degenerate (GC yok)', /static readonly int\[\] Degenerate/.test(codeB));
    check('Tab C: URP shader üretildi', /Shader "VFX\/SlashTrail_URP"/.test(codeC) && /Blend \[_BlendSrc\] \[_BlendDst\]/.test(codeC) && /_BlendDst \("Blend Dst", Float\) = 10/.test(codeC));

    /* --- kopyalama fallback (clipboard yok) --- */
    window.document.querySelector('#btnCopy').dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(30);
    check('copy fallback çalıştı (exception yok)', true);

    /* --- klavye --- */
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Digit3', bubbles: true }));
    check('Space + Digit3 çalıştı (attack=whirl)', S.state.attack === 'whirl');

    /* --- loop ile uzun koşu (wrap + pause + yeniden başlama) --- */
    S.state.loop = true;
    const chk = window.document.querySelector('#chkLoop');
    chk.checked = true;
    S.startAttack('whirl', true);
    await pumpFrames(110);
    check('loop uzun koşu (exception yok, render devam)', renderCount > 150, renderCount + ' frames');

    /* --- export canlı güncelleme (param değişince kod değişmeli) --- */
    S.state.intensity = 5.5;
    tabs[1].dispatchEvent(new window.Event('click', { bubbles: true }));
    const codeB2 = window.document.querySelector('#codeOut').textContent;
    check('export canlı güncelleme (Intensity = 5.5f)', /Intensity   = 5\.5f/.test(codeB2));

    console.log(failed === 0 ? '\nALL SMOKE TESTS PASSED ✔' : `\n${failed} SMOKE TEST(S) FAILED ✘`);
    process.exit(failed === 0 ? 0 : 1);
  } catch (e) {
    console.error('SMOKE TEST CRASH:', e.stack);
    process.exit(1);
  }
})();
