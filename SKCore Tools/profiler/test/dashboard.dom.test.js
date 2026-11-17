/**
 * OmniProfiler — Panel (renderer) DOM testleri.
 *
 * Doğrulanan performans/davranış iddiaları:
 *   • 5.000 log grubu geldiğinde DOM'da yalnızca görünür satırlar olur (sanallaştırma)
 *   • Filtre/arama satır sayısını gerçekten azaltır
 *   • Agregatör çıktısı "(x50) · İlk … · Son …" biçiminde tek satırda görünür
 *   • 30.000 kare + oturum sıfırlama senaryosunda grafikler çökmeden
 *     append-only akışı sürdürür (zaman ekseni geri giderse rebuild tetiklenir)
 *   • Flamegraph düz pre-order diziden doğru geometriyi üretir
 */
import './setup-dom.js';
import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { render, cleanup } from '@testing-library/react';

import { useStore } from '../client/lib/store.ts';
import { sink } from '../client/lib/sink.ts';
import LogPanel from '../client/components/LogPanel.tsx';
import ChartsPanel from '../client/components/ChartsPanel.tsx';
import FlameGraph from '../client/components/FlameGraph.tsx';
import TopBar from '../client/components/TopBar.tsx';
import SidePanel from '../client/components/SidePanel.tsx';
import BottomPanel from '../client/components/BottomPanel.tsx';

afterEach(() => { cleanup(); vi.useRealTimers(); });

/* --------------------------------- yardımcılar ------------------------------ */

const DEFAULT_FILTERS = { levels: [], tags: [], search: '', spamOnly: false, mode: 'grouped', paused: false, maxRows: 500 };

function resetStore() {
  useStore.setState({
    groups: [], rawLogs: [], events: [], findings: [], leaks: [], expanded: {},
    filters: { ...DEFAULT_FILTERS }, tags: [],
    logStats: { raw: 0, suppressed: 0, groups: 0, spamGroups: 0, ratio: 0 },
    wire: { sentFrames: 0, sentBytes: 0, sentMessages: 0, clients: 1, dbWrites: 0 },
    stats: {}, snapshot: null, selectedFrameId: null, compareA: null, compareB: null,
    connected: true, lastError: null,
    session: { id: 'x', startedAt: Date.now(), app: 'NeonDrift', platform: 'editor', unity: '2023.2', device: 'dev', targetFps: 60, deepProfile: true },
    agent: { connected: true, lastSeq: 900, seqGaps: 3, packets: 903, bytes: 88000, lostRatio: 0.0033, lastSeen: Date.now(), transport: 'udp' },
  });
}

function seedLogGroups(n) {
  resetStore();
  const groups = [];
  const TAGS = ['Physics', 'UI', 'Network', 'Audio', 'GC'];
  for (let i = 0; i < n; i++) {
    // Seviye (7) ve etiket (5) FARKLI periyotlarla döner: böylece
    // "yalnızca EXC + Network" gibi çoklu filtre kesişimleri boş küme
    // üretmez ve filtreleme mantığı gerçekten test edilmiş olur.
    const level = i % 7 === 0 ? 'exception' : i % 3 === 0 ? 'error' : 'warn';
    const tag = TAGS[i % 5];
    groups.push({
      id: `fp${i}`, level,
      tag,
      title: `${tag} hatası #${i} — Player ${i} health ${i % 100}`,
      count: 1 + (i % 60), isSpam: i % 4 === 0,
      firstTs: Date.now() - 60000 + i, lastTs: Date.now() - i,
      firstFrame: 1000 + i, lastFrame: 1100 + i,
      culprit: { fn: 'Foo.Bar', file: `Assets/Scripts/Foo${i}.cs`, line: 10 + i, internal: false },
      context: { fps: 58.1, dtMs: 17.2, monoUsedMB: 148.2, gcAllocKB: 3.1, drawCalls: 181, scene: 'Level_01' },
      stack: `Foo.Bar () (at Assets/Scripts/Foo${i}.cs:${10 + i})\nUnityEngine.Debug:Log()`,
      instances: [{ ts: Date.now() - i, frame: 1100 + i, msg: `Hata mesajı #${i}` }],
    });
  }
  useStore.setState({
    groups, tags: TAGS,
    logStats: { raw: n * 12, suppressed: n * 11, groups: n, spamGroups: Math.floor(n / 4), ratio: 0.97 },
  });
}

function seedFrames(n, { startId = 1000, spikeEvery = 240, tOffset = 0 } = {}) {
  sink.clear();
  for (let i = 0; i < n; i++) {
    const spike = i % spikeEvery === 0 && i > 0;
    sink.push({
      t: tOffset + i / 60, frameId: startId + i,
      dt: spike ? 95 : 15 + (i % 7) * 0.6, fps: spike ? 10.5 : 66 - (i % 7) * 2,
      gc: spike ? 1_400_000 : 2000 + (i % 11) * 900,
      mono: (150 + i * 0.004) * 1048576, heap: 256 * 1048576, res: 420 * 1048576, gfx: 96 * 1048576,
      dc: 180 + (i % 23), batches: 120 + (i % 13), sp: 55 + (i % 9),
      tri: 600000 + i * 30, vert: 400000 + i * 20,
      main: spike ? 88 : 8 + (i % 5) * 0.4, rend: 4 + (i % 3) * 0.3, gpu: 6 + (i % 4) * 0.5,
      phys: 1.5, anim: 1.2,
      scene: i < n / 2 ? 'Level_01_Forest' : 'Boss_Arena', samples: i % 2 === 0 ? 1 : 0,
    });
  }
}

/** Panel altındaki "görünen N" istatistiğini okur. */
function readShownCount() {
  const el = [...document.querySelectorAll('.logstats span')].find((s) => s.textContent.startsWith('görünen'));
  return el ? Number(el.textContent.replace(/[^0-9]/g, '')) : -1;
}

/** jsdom CSS değerlerini normalize eder ('100.000%' -> '100%'); sayıya çevir. */
function pct(v) { return Number(String(v).replace('%', '')); }

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ---------------------------------- testler -------------------------------- */

describe('Panel: Log akışı (sanallaştırma)', () => {
  it("5.000 log grubu varken DOM'da yalnızca görünür satırlar bulunur", async () => {
    seedLogGroups(5000);
    await act(async () => { render(React.createElement(LogPanel)); });

    const rows = document.querySelectorAll('.vrow');
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.length).toBeLessThan(120);              // kritik: 5.000 değil, görünür + overscan
    expect(document.querySelectorAll('.log-msg').length).toBeLessThan(60);

    const list = document.querySelector('.vlist');
    const h = Number(list.style.height.replace('px', ''));
    expect(h).toBeGreaterThan(500 * 40);                // maxRows=500 satırlık liste yüksekliği
    expect(h).toBeLessThan(5000 * 40);
    expect(readShownCount()).toBe(500);
  });

  it("filtre chip'leri ve arama satır sayısını azaltır", async () => {
    seedLogGroups(600);
    await act(async () => { render(React.createElement(LogPanel)); });
    const shownAll = readShownCount();
    expect(shownAll).toBe(500);                         // maxRows tavanı

    const excChip = [...document.querySelectorAll('.chip')].find((c) => c.textContent.trim().startsWith('EXC'));
    expect(excChip).toBeTruthy();
    await act(async () => { excChip.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const shownExc = readShownCount();
    expect(shownExc).toBeGreaterThan(0);
    expect(shownExc).toBeLessThan(shownAll);            // seviye filtresi daralttı

    await act(async () => { setInputValue(document.querySelector('.search-row input'), 'Network'); });
    const shownSearch = readShownCount();
    expect(shownSearch).toBeGreaterThan(0);
    expect(shownSearch).toBeLessThan(shownExc);         // arama daha da daralttı
    // yalnızca Network etiketli gruplar görünmeli
    const tags = [...document.querySelectorAll('.tag-pill')].map((t) => t.textContent);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((t) => t === 'Network')).toBe(true);

    // spam filtresi
    await act(async () => { setInputValue(document.querySelector('.search-row input'), ''); });
    const spamChip = [...document.querySelectorAll('.chip')].find((c) => c.textContent.includes('SPAM'));
    await act(async () => { spamChip.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(readShownCount()).toBeGreaterThan(0);
    expect(readShownCount()).toBeLessThan(shownAll);
  });

  it('spam grubu tek satırda sayaç + ilk/son zaman + bağlam gösterir', async () => {
    seedLogGroups(50);
    await act(async () => { render(React.createElement(LogPanel)); });
    const body = document.querySelector('.panel-body');
    const text = body.textContent;
    expect(text).toMatch(/\(x\d+\)/);                   // "(x50)" biçiminde agregasyon
    expect(text).toContain('İlk:');
    expect(text).toContain('Son:');
    expect(text).toContain('SPAM GRUBU');
    expect(text).toContain('FPS');                      // bağlam enjeksiyonu chip'i
    expect(text).toContain('Mono');
    // suçlu kare (dosya:satır) gösteriliyor
    expect(text).toMatch(/Foo\d+\.cs:\d+/);
  });

  it('grubu genişletince stack trace ve suçlu kare vurgusu gelir', async () => {
    seedLogGroups(12);
    await act(async () => { render(React.createElement(LogPanel)); });
    const caret = document.querySelector('.vrow button');
    await act(async () => { caret.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const stack = document.querySelector('.stack');
    expect(stack).toBeTruthy();
    expect(stack.textContent).toContain('Foo');
    expect(stack.querySelector('.hit')).toBeTruthy();   // suçlu kare vurgulandı
  });

  it('HAM mod her logu ayrı satır olarak gösterir', async () => {
    seedLogGroups(4);
    useStore.setState({
      rawLogs: Array.from({ length: 300 }, (_, i) => ({
        ts: Date.now() - i, frame: 2000 + i, level: i % 2 ? 'log' : 'error', tag: 'Physics',
        msg: `Ham log satırı ${i}`, stack: null, fingerprint: `fp${i}`, culprit: null, context: null,
      })),
    });
    await act(async () => { render(React.createElement(LogPanel)); });
    const rawBtn = [...document.querySelectorAll('.seg button')].find((b) => b.textContent === 'Ham');
    await act(async () => { rawBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(document.querySelectorAll('.vrow').length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('Ham log satırı');
  });
});

describe('Panel: Grafikler (Lightweight Charts v5)', () => {
  it('30.000 kare + oturum sıfırlama senaryosunda append-only akış çökmez', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date'] });
    resetStore();
    seedFrames(30000);
    useStore.setState({
      snapshot: { latest: sink.last(), low: { avg: 60, p01: 22, p001: 10, min: 9 }, window: 600, gcPerSec: 42000, durationSec: 500, frames: 30000, scene: 'Boss_Arena', agent: {} },
      events: [{ ts: Date.now(), tRel: 120, frame: 8200, name: 'PlayerDied', kind: 'bad', payload: { Score: 100, Level: 5 } }],
    });

    const errors = [];
    const onErr = (e) => errors.push(e.reason ?? e.error ?? e);
    window.addEventListener('unhandledrejection', onErr);

    await act(async () => { render(React.createElement(ChartsPanel)); });
    await act(async () => { vi.advanceTimersByTime(1500); });     // flush + işaretleyici tick'leri
    expect(document.querySelectorAll('.chart-canvas canvas').length).toBeGreaterThanOrEqual(5);

    // yeni kareler eklenir (canlı akış)
    await act(async () => {
      for (let i = 0; i < 240; i++) {
        sink.push({ ...sink.frames[sink.length - 1], t: sink.frames[sink.length - 1].t + (i + 1) / 60, frameId: 40000 + i });
      }
      vi.advanceTimersByTime(400);
    });

    // oturum sıfırlanır: zaman ekseni 0'a döner -> rebuild tetiklenmeli, çökme olmamalı
    await act(async () => { seedFrames(120, { startId: 1, tOffset: 0 }); vi.advanceTimersByTime(600); });
    expect(document.querySelectorAll('.chart-canvas canvas').length).toBeGreaterThanOrEqual(5);

    // geçmiş başa eklenir (bağlantı koptuktan sonra geri doldurma)
    await act(async () => { sink.prependHistory([{ ...sink.frames[0], t: -5, frameId: -5 }, { ...sink.frames[0], t: -4, frameId: -4 }]); vi.advanceTimersByTime(600); });

    window.removeEventListener('unhandledrejection', onErr);
    const chartErrors = errors.filter((e) => /Cannot update oldest data|oldest/.test(String(e?.message ?? e)));
    expect(chartErrors).toHaveLength(0);
    expect(errors.filter((e) => e instanceof Error)).toHaveLength(0);

    const legend = document.body.textContent;
    for (const label of ['Frame Time', '1% / 0.1% Low', 'Bellek', 'GC Alloc', 'Draw Calls', 'Özel Olaylar']) {
      expect(legend).toContain(label);
    }
  });
});

describe('Panel: Flamegraph geometrisi', () => {
  const flat = [
    ['PlayerLoop', 100, 10000, 2, 0],
    ['Update', 2000, 6000, 2, 1],
    ['PlayerController', 5500, 5500, 0, 2],
    ['EnemyAI x12', 500, 500, 0, 2],
    ['Render', 3900, 3900, 0, 1],
  ];

  it('düz pre-order diziden doğru satır/genişlik yerleşimi üretir', async () => {
    resetStore();
    await act(async () => { render(React.createElement(FlameGraph, { flat, totalUs: 10000 })); });
    const rows = document.querySelectorAll('.flame-row');
    expect(rows.length).toBe(3);                        // derinlik 0,1,2

    const blocks = [...document.querySelectorAll('.flame-block')];
    expect(blocks.length).toBe(5);
    const find = (name) => blocks.find((b) => b.textContent === name);
    expect(pct(find('PlayerLoop').style.width)).toBeCloseTo(100, 3);
    expect(pct(find('Update').style.width)).toBeCloseTo(60, 3);  // 6000/10000
    expect(pct(find('Update').style.left)).toBeCloseTo(0, 3);
    expect(pct(find('Render').style.left)).toBeCloseTo(60, 3);   // Update'ın hemen yanı
    expect(pct(find('Render').style.width)).toBeCloseTo(39, 3);
    expect(pct(find('PlayerController').style.width)).toBeCloseTo(55, 3);
    expect(pct(find('EnemyAI x12').style.left)).toBeCloseTo(55, 3);

    expect(document.body.textContent).toContain('Self Time');
    expect(document.body.textContent).toContain('PlayerController');
    expect(document.body.textContent).toContain('5 düğüm');
  });

  it('bloğa tıklayınca zoom yapılır, Esc ile sıfırlanır', async () => {
    resetStore();
    await act(async () => { render(React.createElement(FlameGraph, { flat, totalUs: 10000 })); });
    const update = [...document.querySelectorAll('.flame-block')].find((b) => b.textContent === 'Update');
    await act(async () => { update.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(document.body.textContent).toContain('zoom: Update');
    // zoom sonrası Update kök kabul edilir -> genişliği %100'e çıkar
    const zoomed = [...document.querySelectorAll('.flame-block')].find((b) => b.textContent === 'Update');
    expect(pct(zoomed.style.width)).toBeGreaterThan(99);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.body.textContent).not.toContain('zoom: Update');
  });

  it('boş veriyle zarifçe "örneklem yok" mesajı gösterir', async () => {
    resetStore();
    await act(async () => { render(React.createElement(FlameGraph, { flat: [], totalUs: 0 })); });
    expect(document.body.textContent).toContain('örneklem ağacı yok');
  });
});

describe('Panel: Üst bar, bulgular ve alt panel', () => {
  it('üst bar canlı metrikleri, low değerlerini ve ajan sağlığını gösterir', async () => {
    resetStore();
    seedFrames(1200);
    useStore.setState({
      snapshot: { latest: sink.last(), low: { avg: 61, p01: 24, p001: 11, min: 10 }, window: 600, gcPerSec: 61000, durationSec: 20, frames: 1200, scene: 'Boss_Arena', agent: {} },
      wire: { sentFrames: 1200, sentBytes: 420000, sentMessages: 900, clients: 1, dbWrites: 18000 },
      logStats: { raw: 4200, suppressed: 3900, groups: 9, spamGroups: 4, ratio: 0.997 },
    });
    await act(async () => { render(React.createElement(TopBar)); });
    const t = document.body.textContent;
    expect(t).toContain('OmniProfiler');
    expect(t).toContain('NeonDrift');
    expect(t).toContain('1% / 0.1% Low');
    expect(t).toContain('Boss_Arena');
    expect(t).toMatch(/kayıp %0\.33/);
    expect(t).toContain('4.2k log → 9 satır');
    expect(t).toContain('18k SQLite satırı');
  });

  it('bulgular önem derecesine göre sıralanır, tıklama kareye atlar', async () => {
    resetStore();
    useStore.setState({
      findings: [
        { id: '1', ts: Date.now(), kind: 'gc', severity: 'medium', title: 'GC spike: 320 KB', detail: { frameId: 1200, gcAllocBytes: 320000 }, tRel: 12, frameId: 1200 },
        { id: '2', ts: Date.now(), kind: 'leak', severity: 'high', title: 'Olası bellek sızıntısı: GameObject (BulletPrefab)', detail: { live: 412, destroyRatio: 0.03, slopePerSec: 9.2, hint: 'Destroy çağrılmıyor.' }, tRel: 40, frameId: 2600 },
        { id: '3', ts: Date.now(), kind: 'logspam', severity: 'high', title: 'Log spam: "NullReferenceException" x4120', detail: { count: 4120 }, tRel: 55, frameId: 3300 },
      ],
      leaks: [{ type: 'GameObject', prefab: 'BulletPrefab', spawned: 900, destroyed: 27, live: 873, peak: 873, destroyRatio: 0.03, slopePerSec: 9.2 }],
      logStats: { raw: 10, suppressed: 0, groups: 2, spamGroups: 1, ratio: 0.8 },
    });
    await act(async () => { render(React.createElement(SidePanel)); });
    const items = [...document.querySelectorAll('.finding')];
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('sızıntısı');      // high önce
    expect(document.body.textContent).toContain('canlı 873');

    await act(async () => { items[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(useStore.getState().selectedFrameId).toBe(2600);
    expect(useStore.getState().inspectorTab).toBe('leak');

    // detay aç/kapa
    const detailBtn = [...items[0].querySelectorAll('button')].find((b) => b.textContent === 'detay');
    await act(async () => { detailBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(document.body.textContent).toContain('Destroy çağrılmıyor.');
  });

  it('alt panel sekmeleri arasında geçiş yapılabilir', async () => {
    resetStore();
    seedFrames(600);
    useStore.setState({ selectedFrameId: 1200, compareA: 1100, compareB: 1200, events: [] });
    await act(async () => { render(React.createElement(BottomPanel)); });
    expect(document.body.textContent).toContain('Frame Inspector');
    const tabs = [...document.querySelectorAll('.tab')];
    expect(tabs.length).toBe(5);

    await act(async () => { tabs[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(useStore.getState().inspectorTab).toBe('compare');
    await act(async () => { tabs[2].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(useStore.getState().inspectorTab).toBe('leak');
    await act(async () => { tabs[3].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(useStore.getState().inspectorTab).toBe('events');
    await act(async () => { tabs[4].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(useStore.getState().inspectorTab).toBe('history');
    await act(async () => { tabs[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(useStore.getState().inspectorTab).toBe('flame');
  });
});

describe('Sink: arama ve tavan davranışı', () => {
  it('frameId ve zaman ile arama doğru kareyi bulur', () => {
    seedFrames(10);
    expect(sink.length).toBe(10);
    expect(sink.byFrameId(1005).frameId).toBe(1005);
    expect(sink.byFrameId(9999)).toBe(null);
    expect(sink.nearestByTime(0.05).frameId).toBe(1003);
    expect(sink.indexOfFrameId(1009)).toBe(9);
  });

  it('geçmiş başa eklendiğinde indeks tutarlı kalır', () => {
    seedFrames(100);
    const mk = (t, id) => ({ t, frameId: id, dt: 16, fps: 60, gc: 0, mono: 0, heap: 0, res: 0, gfx: 0, dc: 0, batches: 0, sp: 0, tri: 0, vert: 0, main: 0, rend: 0, gpu: 0, phys: 0, anim: 0, scene: 'S', samples: 0 });
    sink.prependHistory([mk(-2 / 60, 998), mk(-1 / 60, 999)]);
    expect(sink.length).toBe(102);
    expect(sink.frames[0].frameId).toBe(998);
    expect(sink.byFrameId(1000).frameId).toBe(1000);
    expect(sink.indexOfFrameId(1000)).toBe(2);
  });
});
