#!/usr/bin/env node
/* Attack pose sanity test: ATTACKS bloğunu app.js'ten çeker, node'da çalıştırır. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const m = src.match(/\/\*==ATTACKS_BEGIN==\*\/([\s\S]*?)\/\*==ATTACKS_END==\*\//);
if (!m) { console.error('ATTACKS block not found'); process.exit(1); }
const { ATTACKS, poseAt } = new Function(m[1] + '\n;return { ATTACKS, poseAt };')();

const P = [0,0,0], R = [0,0,0];
function sample(key, n){
  const att = ATTACKS[key];
  const pts = [];
  for (let i=0;i<=n;i++){
    poseAt(att, i/n, P, R);
    // kabaca kılıç ucunu hesapla: blade +Y lokal, Euler XYZ (R = Rx*Ry*Rz three convention: rotation applied as Rz then Ry then Rx? THREE Euler 'XYZ' means R = Rx*Ry*Rz)
    const [rx,ry,rz] = R;
    // dir = Rx(ry? no) — do full: apply Rz, Ry, Rx to (0,1,0)
    let x=0,y=1,z=0;
    // Rz: x' = x cos - y sin; y' = x sin + y cos
    let c=Math.cos(rz), s=Math.sin(rz);
    let x1 = x*c - y*s, y1 = x*s + y*c, z1 = z;
    // Ry: x' = x cos + z sin; z' = -x sin + z cos
    c=Math.cos(ry); s=Math.sin(ry);
    let x2 = x1*c + z1*s, y2 = y1, z2 = -x1*s + z1*c;
    // Rx: y' = y cos - z sin; z' = y sin + z cos
    c=Math.cos(rx); s=Math.sin(rx);
    let x3 = x2, y3 = y2*c - z2*s, z3 = y2*s + z2*c;
    pts.push({ t:i/n, px:P[0], py:P[1], pz:P[2], dx:x3, dy:y3, dz:z3, ry:ry,
               tip:[P[0]+0.98*x3, P[1]+0.98*y3, P[2]+0.98*z3] });
  }
  return pts;
}
function range(pts, f){ let a=Infinity,b=-Infinity; for(const p of pts){const v=f(p); if(v<a)a=v; if(v>b)b=v;} return [a,b]; }
function prec(v){ return v.toFixed(2); }

let fail = 0;
function check(name, cond, info){ console.log((cond?'PASS':'FAIL')+'  '+name+(info?'  -> '+info:'')); if(!cond) fail++; }

// --- horizontal: yatay süpürme. rec penceresinde tip.x sağdan sola, y ~sabit ---
{
  const att = ATTACKS.horizontal;
  const pts = sample('horizontal', 200).filter(p => p.t>=att.rec[0] && p.t<=att.rec[1]);
  const [xa,xb] = range(pts, p=>p.tip[0]);
  const [ya,yb] = range(pts, p=>p.tip[1]);
  const [za,zb] = range(pts, p=>p.tip[2]);
  check('horizontal: tip sağdan sola geçiyor (x span > 1.2m)', (xb-xa) > 1.2, `x ${prec(xa)}..${prec(xb)}`);
  check('horizontal: y yayı x yayından küçük (yataylık)', (yb-ya) < (xb-xa)*0.55, `y span ${prec(yb-ya)}`);
  check('horizontal: tip yerin altına inmiyor', ya > 0.05, `min y ${prec(ya)}`);
  console.log(`   horizontal tip span: x[${prec(xa)},${prec(xb)}] y[${prec(ya)},${prec(yb)}] z[${prec(za)},${prec(zb)}]`);
}
// --- chop: yukarıdan aşağı. tip y > 1.2m düşüş, z ileri artış ---
{
  const att = ATTACKS.chop;
  const pts = sample('chop', 200).filter(p => p.t>=att.rec[0] && p.t<=att.rec[1]);
  const [ya,yb] = range(pts, p=>p.tip[1]);
  const [za,zb] = range(pts, p=>p.tip[2]);
  check('chop: dikey düşüş > 1.3m', (yb-ya) > 1.3, `y ${prec(yb)}..${prec(ya)}`);
  check('chop: vuruş sonunda tip öne uzanıyor (z > 0.6)', zb > 0.6, `max z ${prec(zb)}`);
  check('chop: tip yerin altına inmiyor', yb > 0.0, `min y ${prec(yb)}`);
  console.log(`   chop tip: y ${prec(yb)}..${prec(ya)}  z ${prec(za)}..${prec(zb)}`);
}
// --- whirl: yaw toplam > 2*pi (tam tur +) ---
{
  const att = ATTACKS.whirl;
  const pts = sample('whirl', 400).filter(p => p.t>=att.rec[0] && p.t<=att.rec[1]);
  const [ra,rb] = range(pts, p=>p.ry);
  check('whirl: saldırı penceresinde >= 360° dönüş', (rb-ra) >= Math.PI*2 - 0.01, `yaw delta ${((rb-ra)/Math.PI).toFixed(2)}π`);
  const ptsAll = sample('whirl', 400);
  const minY = Math.min(...ptsAll.map(p=>p.tip[1]));
  check('whirl: tip yerin altına inmiyor', minY > 0.0, `min y ${prec(minY)}`);
  console.log(`   whirl yaw sweep: ${((rb-ra)/Math.PI).toFixed(2)}π rad`);
}
// --- upper: çapraz. tip soldan-alçaktan sağa-yükseğe ---
{
  const att = ATTACKS.upper;
  const pts = sample('upper', 200).filter(p => p.t>=att.rec[0] && p.t<=att.rec[1]);
  const [xa,xb] = range(pts, p=>p.tip[0]);
  const [ya,yb] = range(pts, p=>p.tip[1]);
  check('upper: soldan sağa (x span > 1.0m)', (xb-xa) > 1.0, `x ${prec(xa)}..${prec(xb)}`);
  check('upper: aşağıdan yukarı (y yükseliş > 1.4m)', (yb-ya) > 1.4, `y ${prec(ya)}..${prec(yb)}`);
  const ptsAll = sample('upper', 300);
  const minY = Math.min(...ptsAll.map(p=>p.tip[1]));
  check('upper: windup dahil tip yerin altına inmiyor', minY > 0.0, `min y ${prec(minY)}`);
  console.log(`   upper tip span: x[${prec(xa)},${prec(xb)}] y[${prec(ya)},${prec(yb)}]`);
}
// --- genel: tüm saldırı süreleri boyunca tip asla yer altına inmiyor ---
for (const k of Object.keys(ATTACKS)){
  const pts = sample(k, 400);
  const minY = Math.min(...pts.map(p=>p.tip[1]));
  check(`${k}: full-cycle min tip y > -0.05`, minY > -0.05, `min y ${prec(minY)}`);
}
// --- süreklilik: t=1 pozu idle'a dönmeli (t=0 ile aynı) ---
for (const k of Object.keys(ATTACKS)){
  const pts = sample(k, 1000);
  const a = pts[0], b = pts[pts.length-1];
  const d = Math.hypot(a.px-b.px, a.py-b.py, a.pz-b.pz);
  // whirl bilinçli olarak 2π kaymış yaw ile biter (aynı yönelim) — pozisyon aynı olmalı
  check(`${k}: animasyon idle'a döner (pos delta < 0.01)`, d < 0.01, `delta ${d.toFixed(4)}`);
}

console.log(fail === 0 ? '\nALL TESTS PASSED ✔' : `\n${fail} TEST(S) FAILED ✘`);
process.exit(fail === 0 ? 0 : 1);
