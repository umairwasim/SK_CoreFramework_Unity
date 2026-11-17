/**
 * Web preview server – runs the exact same AtsService behind HTTP so the UI can be used in a browser
 * (handy for development and for the live preview). Electron is the real target.
 *   ATS_WORKSPACE=/path/to/UnityProject PORT=5178 npm run web
 * ⚠ Dev tool: it can open any folder the process can read. Don't expose it publicly.
 */
import express from 'express';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AtsService } from '../core/service';
import { RPC_METHODS, type RpcMethod } from '../shared/rpc';
import type { AtsEvent } from '../shared/types';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 5178);
const service = new AtsService({ appDataDir: process.env.ATS_DATA ?? path.join(os.homedir(), '.ats') });
const app = express();
app.use(express.json({ limit: '5mb' }));

app.post('/api/rpc/:method', async (req, res) => {
  const method = req.params.method as RpcMethod;
  if (!RPC_METHODS.includes(method)) return void res.status(404).json({ error: `Unknown method ${method}` });
  try {
    const result = await (service[method] as (...a: unknown[]) => Promise<unknown>)(...(req.body?.args ?? []));
    res.json({ result: result ?? null });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

const clients = new Set<express.Response>();
service.on((e: AtsEvent) => {
  const data = `data: ${JSON.stringify(e)}\n\n`;
  for (const c of clients) c.write(data);
});
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(': connected\n\n');
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

app.get('/api/file/*splat', async (req, res) => {
  try {
    const parts = (req.params as { splat: string[] }).splat;
    const r = await service.resolveFile(parts.join('/'), typeof req.query.as === 'string' ? req.query.as : undefined);
    res.set('Cache-Control', 'no-cache');
    if (r.buffer) return void res.type(r.mime).send(r.buffer);
    res.type(r.mime).sendFile(r.path!, { dotfiles: 'allow' });
  } catch (e) {
    res.status(404).send((e as Error).message);
  }
});

app.get('/api/thumb/:id', async (req, res) => {
  try {
    const t = await service.getThumbnail(Number(req.params.id));
    if (!t) return void res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(t.mime).sendFile(t.path, { dotfiles: 'allow' });
  } catch (e) {
    res.status(500).send((e as Error).message);
  }
});

const webRoot = path.resolve(here, '../../dist-web');
if (existsSync(webRoot)) {
  app.use(express.static(webRoot));
  app.get('/*splat', (_req, res) => res.sendFile(path.join(webRoot, 'index.html')));
}

app.listen(port, '0.0.0.0', async () => {
  console.log(`ATS web preview → http://0.0.0.0:${port}`);
  const ws = process.env.ATS_WORKSPACE;
  if (ws) {
    try {
      const info = await service.openWorkspace(ws);
      console.log(`Workspace: ${info.root} (${info.counts.texture} textures, ${info.counts.model} models, ${info.counts.audio} audio)`);
    } catch (e) {
      console.error(`Could not open ATS_WORKSPACE: ${(e as Error).message}`);
    }
  }
});
