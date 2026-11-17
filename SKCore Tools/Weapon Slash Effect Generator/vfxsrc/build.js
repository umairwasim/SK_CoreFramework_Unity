#!/usr/bin/env node
/* SLASH FORGE — single-file builder
   vendor (three.js r147 UMD + postprocessing + OrbitControls) + css + body + app
   -> tek HTML dosyası (offline çalışır) */
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const OUT = path.join(SRC, '..', '3D-Melee-Trail-Slash-VFX-Studio.html');

const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

const css   = read('style.css');
const body  = read('body.html');
const app   = read('app.js');

const vendorOrder = [
  'three.min.js',
  'CopyShader.js',
  'LuminosityHighPassShader.js',
  'GammaCorrectionShader.js',
  'EffectComposer.js',
  'ShaderPass.js',
  'RenderPass.js',
  'UnrealBloomPass.js',
  'OrbitControls.js'
];

const guard = js => js.replace(/<\/script>/gi, '<\\/script>'); // güvenlik: inline script kırılmasın

const parts = [];
parts.push('<!DOCTYPE html>\n<html lang="tr">\n<head>\n<meta charset="UTF-8">');
parts.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
parts.push('<title>SLASH FORGE — 3D Melee Weapon Trail &amp; Slash VFX Studio</title>');
parts.push('<style>\n' + css + '\n</style>');
parts.push('\n</head>\n<body>\n' + body);
for (const v of vendorOrder){
  parts.push('\n<!-- ===== embedded vendor: ' + v + ' (three.js r147, MIT) ===== -->');
  parts.push('<script>\n' + guard(read(path.join('vendor', v))) + '\n</script>');
}
parts.push('\n<!-- ===== SLASH FORGE application ===== -->');
parts.push('<script>\n' + guard(app) + '\n</script>');
parts.push('\n</body>\n</html>');

fs.writeFileSync(OUT, parts.join('\n'));
console.log('BUILT:', OUT, (fs.statSync(OUT).size/1024).toFixed(1) + ' KB');
