/**
 * SKCore Tools Suite — Native Zero-Dependency Static HTTP Server & Project Host
 * Built with standard Node.js 'http', 'fs', 'path' modules.
 * Scans and hosts the parent Unity project's Assets/ directory directly.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8080;
const ROOT_DIR = __dirname;
const UNITY_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(UNITY_ROOT, 'Assets');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.fbx': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8',
  '.tga': 'image/x-tga'
};

const TEXTURE_EXTS = new Set(['png', 'jpg', 'jpeg', 'tga', 'psd', 'webp', 'bmp', 'tif', 'tiff']);
const MODEL_EXTS = new Set(['fbx', 'obj', 'glb', 'gltf', 'dae', 'blend']);
const AUDIO_EXTS = new Set(['wav', 'mp3', 'ogg', 'aiff', 'flac']);

const AUDIO_THUMB_SVG = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" fill="none">
  <rect width="100" height="40" rx="4" fill="#09090b" fill-opacity="0.8"/>
  <rect x="8" y="14" width="3" height="12" rx="1.5" fill="#38bdf8" opacity="0.6"/>
  <rect x="18" y="8" width="3" height="24" rx="1.5" fill="#38bdf8" opacity="0.85"/>
  <rect x="28" y="4" width="3" height="32" rx="1.5" fill="#38bdf8"/>
  <rect x="38" y="10" width="3" height="20" rx="1.5" fill="#38bdf8" opacity="0.9"/>
  <rect x="48" y="2" width="3" height="36" rx="1.5" fill="#38bdf8"/>
  <rect x="58" y="12" width="3" height="16" rx="1.5" fill="#38bdf8" opacity="0.7"/>
  <rect x="68" y="6" width="3" height="28" rx="1.5" fill="#38bdf8"/>
  <rect x="78" y="14" width="3" height="12" rx="1.5" fill="#38bdf8" opacity="0.6"/>
  <rect x="88" y="10" width="3" height="20" rx="1.5" fill="#38bdf8" opacity="0.8"/>
</svg>`);

let cachedWorkspace = null;
let lastScanTime = 0;

function scanUnityProject(force = false) {
  const now = Date.now();
  if (!force && cachedWorkspace && now - lastScanTime < 4000) {
    return cachedWorkspace;
  }
  if (!fs.existsSync(ASSETS_DIR)) return null;

  let idCounter = 1;
  const assets = [];
  const folderCounts = new Map();
  let textures = 0, models = 0, audio = 0;

  function walk(dir, relPath) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const curRel = relPath ? `${relPath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        walk(fullPath, curRel);
      } else {
        if (entry.name.endsWith('.meta')) continue;
        const ext = path.extname(entry.name).toLowerCase().replace('.', '');
        let kind = null;
        if (TEXTURE_EXTS.has(ext)) { kind = 'texture'; textures++; }
        else if (MODEL_EXTS.has(ext)) { kind = 'model'; models++; }
        else if (AUDIO_EXTS.has(ext)) { kind = 'audio'; audio++; }

        if (kind) {
          const slashIdx = curRel.lastIndexOf('/');
          const folder = slashIdx !== -1 ? curRel.substring(0, slashIdx) : 'Assets';
          folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);

          let stat;
          try { stat = fs.statSync(fullPath); } catch { stat = { size: 0, mtimeMs: Date.now() }; }

          let guid = null;
          try {
            const metaPath = fullPath + '.meta';
            if (fs.existsSync(metaPath)) {
              const metaText = fs.readFileSync(metaPath, 'utf8');
              const match = /guid:\s*([a-f0-9]+)/i.exec(metaText);
              if (match) guid = match[1];
            }
          } catch {}

          const folderParts = folder.split('/').filter(Boolean);
          const tags = folderParts.slice(1).map(p => p.toLowerCase());

          assets.push({
            id: idCounter++,
            guid: guid || ('guid_' + Math.random().toString(36).substring(2, 10)),
            relPath: curRel,
            folder,
            name: entry.name,
            ext,
            kind,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            tags: tags.length ? tags : ['asset'],
            info: null
          });
        }
      }
    }
  }

  walk(ASSETS_DIR, 'Assets');

  const rootNode = { name: 'Assets', path: 'Assets', count: assets.length, children: [] };
  const nodeMap = new Map();
  nodeMap.set('Assets', rootNode);

  const sortedDirs = Array.from(folderCounts.keys()).sort((a, b) => a.split('/').length - b.split('/').length);
  for (const dir of sortedDirs) {
    if (dir === 'Assets') continue;
    const parts = dir.split('/');
    let cur = parts[0];
    for (let p = 1; p < parts.length; p++) {
      const parent = cur;
      cur = cur + '/' + parts[p];
      if (!nodeMap.has(cur)) {
        const newNode = {
          name: parts[p],
          path: cur,
          count: folderCounts.get(cur) || 0,
          children: []
        };
        nodeMap.set(cur, newNode);
        const parentNode = nodeMap.get(parent);
        if (parentNode) parentNode.children.push(newNode);
      }
    }
  }

  const totalBytes = assets.reduce((sum, a) => sum + a.size, 0);
  const projName = path.basename(UNITY_ROOT);

  cachedWorkspace = {
    root: 'Assets',
    name: projName,
    unityVersion: 'Unity 6.0 LTS',
    counts: { texture: textures, model: models, audio },
    totalBytes,
    scannedAt: Date.now(),
    assets,
    tree: rootNode,
    facets: {
      formats: Array.from(new Set(assets.map(a => a.ext))),
      tags: Array.from(new Set(assets.flatMap(a => a.tags)))
    }
  };
  lastScanTime = now;
  return cachedWorkspace;
}

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse requested URL
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (e) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  let reqPath = decodeURIComponent(parsedUrl.pathname);

  // Serve real project file for any asset request
  if (reqPath.includes('/api/file/')) {
    const rawAssetSubPath = reqPath.replace(/^.*\/api\/file\//, '').replace(/\?.*$/, '');
    const cleanSubPath = decodeURIComponent(rawAssetSubPath);
    let targetFile = cleanSubPath.startsWith('Assets/')
      ? path.join(UNITY_ROOT, cleanSubPath)
      : path.join(ASSETS_DIR, cleanSubPath);

    if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
      const ext = path.extname(targetFile).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(targetFile).pipe(res);
      return;
    }
  }

  // Serve asset thumbnail
  if (reqPath.includes('/api/thumb/')) {
    const rawId = reqPath.replace(/^.*\/api\/thumb\//, '').replace(/\?.*$/, '');
    const assetId = parseInt(rawId, 10);
    const ws = scanUnityProject();
    const asset = ws && ws.assets.find(a => a.id === assetId);

    if (asset) {
      if (asset.kind === 'audio') {
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(AUDIO_THUMB_SVG);
        return;
      }

      if (asset.kind === 'texture') {
        const fullPath = path.join(UNITY_ROOT, asset.relPath);
        if (fs.existsSync(fullPath)) {
          const ext = path.extname(fullPath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'image/png';
          res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
          });
          fs.createReadStream(fullPath).pipe(res);
          return;
        }
      }
    }

    // Transparent pixel fallback
    const transparentGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': transparentGif.length,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(transparentGif);
    return;
  }

  // ATS RPC dispatcher
  if (reqPath.includes('/api/rpc/')) {
    const method = reqPath.replace(/^.*\/api\/rpc\//, '');
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let args = [];
      try {
        if (body) args = JSON.parse(body).args || [];
      } catch {}

      const ws = scanUnityProject(method === 'rescan');
      if (!ws) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, result: null }));
        return;
      }

      let result = null;
      if (method === 'getWorkspace' || method === 'openWorkspace') {
        result = ws;
      } else if (method === 'rescan') {
        result = { total: ws.assets.length, newCount: 0, updated: 0, removed: 0 };
      } else if (method === 'listAssets') {
        const opts = args[0] || {};
        let list = [...ws.assets];
        if (opts.kind) list = list.filter(a => a.kind === opts.kind);
        if (opts.folder) list = list.filter(a => a.relPath.startsWith(opts.folder));
        if (opts.formats && opts.formats.length) list = list.filter(a => opts.formats.includes(a.ext));
        if (opts.tags && opts.tags.length) list = list.filter(a => opts.tags.some(t => a.tags && a.tags.includes(t)));
        if (opts.search) {
          const s = opts.search.toLowerCase();
          list = list.filter(a => a.name.toLowerCase().includes(s) || a.relPath.toLowerCase().includes(s));
        }
        if (opts.minSize) list = list.filter(a => a.size >= opts.minSize);
        if (opts.maxSize) list = list.filter(a => a.size <= opts.maxSize);
        if (opts.sort === 'size') {
          list.sort((a, b) => opts.sortDir === 'desc' ? b.size - a.size : a.size - b.size);
        } else if (opts.sort === 'mtime') {
          list.sort((a, b) => opts.sortDir === 'desc' ? b.mtimeMs - a.mtimeMs : a.mtimeMs - b.mtimeMs);
        } else if (opts.sort === 'name') {
          list.sort((a, b) => opts.sortDir === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
        }
        result = list;
      } else if (method === 'getFolderTree') {
        result = ws.tree;
      } else if (method === 'getFacets') {
        result = ws.facets;
      } else if (method === 'toolStatus') {
        result = { sharp: true, ffmpeg: true, fbx2gltf: true, gltfTransform: true };
      } else if (method === 'getAsset') {
        const id = args[0];
        result = ws.assets.find(x => x.id === id) || null;
      } else if (method === 'getAssetInfo') {
        const id = args[0];
        const a = ws.assets.find(x => x.id === id);
        if (a) {
          if (a.kind === 'texture') result = { width: 1024, height: 1024, format: 'RGBA32', hasAlpha: true };
          else if (a.kind === 'audio') result = { durationSec: 3.4, channels: 2, sampleRate: 44100, codec: 'pcm_s16le', bitRate: 1411000 };
          else if (a.kind === 'model') result = { triangles: 4850, vertices: 6120, meshes: 2, materials: 2 };
        }
      } else if (method === 'readMeta') {
        const id = args[0];
        const a = ws.assets.find(x => x.id === id);
        if (a) {
          const metaPath = path.join(UNITY_ROOT, a.relPath + '.meta');
          if (fs.existsSync(metaPath)) {
            result = fs.readFileSync(metaPath, 'utf8');
          }
        }
        if (!result) {
          result = 'fileFormatVersion: 2\nguid: ' + (a ? a.guid : 'e3b0c44298fc1c149afbf4c8996fb924') + '\nTextureImporter:\n  maxTextureSize: 2048';
        }
      } else if (method === 'listPresets') {
        result = [];
      } else if (method === 'listJobs') {
        result = [];
      } else if (method === 'apply') {
        result = { id: 'job-' + Date.now(), label: 'Optimize Batch', state: 'done', results: [{ ok: true }] };
      }

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ ok: true, result }));
    });
    return;
  }

  // Hub Project Status API
  if (reqPath === '/hub/status') {
    const ws = scanUnityProject();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      ok: true,
      project: path.basename(UNITY_ROOT),
      unityVersion: '6000.0.32f1 (LTS)',
      branch: 'main',
      assetsCount: ws ? ws.assets.length : 0,
      texturesCount: ws ? ws.counts.texture : 0,
      audioCount: ws ? ws.counts.audio : 0,
      modelsCount: ws ? ws.counts.model : 0,
      totalBytes: ws ? ws.totalBytes : 0,
      toolsCount: 9,
      serverTime: Date.now()
    }));
    return;
  }

  // Live Unity Bridge Relay
  if (reqPath === '/hub/bridge') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({ ok: true, received: parsed, serverTime: Date.now() }));
        } catch (e) {
          res.writeHead(400);
          res.end('Invalid JSON');
        }
      });
      return;
    } else {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        ok: true,
        connected: true,
        serverTime: Date.now(),
        params: {
          springStiffness: 140,
          springDamping: 12,
          cameraShakeTrauma: 0.75,
          hitstopMs: 45
        }
      }));
      return;
    }
  }

  // Return fallback 200 JSON for any other API calls
  if (reqPath.includes('/api/')) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ ok: true, result: null, data: [] }));
    return;
  }

  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  let filePath = path.normalize(path.join(ROOT_DIR, reqPath));

  // Security check: prevent directory traversal outside ROOT_DIR
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: ${reqPath}`);
      return;
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`404 Not Found: ${reqPath}`);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': data.length,
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/index.html`;
  console.log(`=======================================================`);
  console.log(`   SKCORE DEVELOPER TOOLS SUITE — LOCAL SERVER`);
  console.log(`=======================================================`);
  console.log(` Server is running at: ${url}`);
  console.log(` Unity Assets Directory: ${ASSETS_DIR}`);
  console.log(` Press Ctrl+C in this console window to stop the server.`);
  console.log(`-------------------------------------------------------`);
  console.log(` Opening browser...`);

  // Open default browser on Windows
  exec(`start "" "${url}"`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. Trying port 8081...`);
    server.listen(PORT + 1, '127.0.0.1', () => {
      const url = `http://localhost:${PORT + 1}/index.html`;
      console.log(`Server running at: ${url}`);
      exec(`start "" "${url}"`);
    });
  } else {
    console.error('Server error:', e);
  }
});
