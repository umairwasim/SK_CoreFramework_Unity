/**
 * Sol Panel — Akıllı Log Akışı
 *
 * İki görünüm modu:
 *   • GRUP : agregatörün ürettiği parmak izi grupları. "NullReferenceException (x412)"
 *            tek satırdır; Unity Console'da bu 412 satır olurdu.
 *   • HAM  : her log ayrı satır (klasik akış hissi).
 *
 * Her iki mod da SANALLAŞTIRILMIŞ (virtualized) listedir: DOM'da yalnızca
 * görünür satırlar (+ overscan) bulunur. 100.000 log da gelse render maliyeti
 * sabittir. (Spec'te xterm.js öneriliyordu; xterm satır yüksekliğini sabit
 * varsayar ve zengin bağlam/stack trace bloklarını render edemez. Bu yüzden
 * ölçülmüş yükseklikli kendi sanal listemiz kullanıldı — aynı performans
 * hedefi, daha zengin içerik. Gerçek Electron sürümünde "düz metin terminal"
 * modu istenirse bu bileşenin yerine xterm takılabilir.)
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, type LogGroup, type LogLevel } from '../lib/store';
import { LEVEL_COLOR, LEVEL_LABEL, fmtInt, fmtTimeOfDay, tagColor } from '../lib/format';
import { apiRequest as api } from '../lib/transport';

const ROW_BASE = 46;      // kapalı satır yüksekliği (px)
const OVERSCAN = 8;

const LEVELS: LogLevel[] = ['error', 'exception', 'warn', 'log'];

function StackView({ stack, culprit }: { stack?: string | null; culprit?: LogGroup['culprit'] }) {
  if (!stack) return null;
  // Suçlu kareyi (ilk kullanıcı kodu) vurgula
  const lines = stack.split('\n');
  return (
    <div className="stack">
      {lines.map((l, i) => {
        const hit = culprit && l.includes(`${culprit.file}:${culprit.line}`);
        return <div key={i} className={hit ? 'hit' : undefined}>{l}{hit ? '   ← suçlu kare' : ''}</div>;
      })}
    </div>
  );
}

function ContextPills({ ctx }: { ctx?: LogGroup['context'] }) {
  if (!ctx) return null;
  return (
    <div className="ctx-row">
      {ctx.fps != null && <span className="ctx-pill">FPS <b>{ctx.fps}</b></span>}
      {ctx.dtMs != null && <span className="ctx-pill">dt <b>{ctx.dtMs} ms</b></span>}
      {ctx.monoUsedMB != null && <span className="ctx-pill">Mono <b>{ctx.monoUsedMB} MB</b></span>}
      {ctx.gcAllocKB != null && <span className="ctx-pill">GC <b>{ctx.gcAllocKB} KB</b></span>}
      {ctx.drawCalls != null && <span className="ctx-pill">DC <b>{ctx.drawCalls}</b></span>}
      {ctx.scene && <span className="ctx-pill">Sahne <b>{ctx.scene}</b></span>}
    </div>
  );
}

function GroupRow({ g, expanded, onToggle, onSelectFrame }: {
  g: LogGroup; expanded: boolean; onToggle: () => void; onSelectFrame: (id: number) => void;
}) {
  const color = LEVEL_COLOR[g.level] ?? 'var(--fg-2)';
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
      <button className="btn sm ghost" style={{ padding: '1px 4px', color: 'var(--fg-3)' }} onClick={onToggle} title={expanded ? 'Daralt' : 'Genişlet'}>
        {expanded ? '▾' : '▸'}
      </button>
      <span className="log-level" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
        {LEVEL_LABEL[g.level] ?? g.level}
      </span>
      {g.tag ? <span className="tag-pill" style={{ color: tagColor(g.tag) }}>{g.tag}</span> : null}
      <div className="log-main">
        <div className="log-msg" style={{ color: g.level === 'log' ? 'var(--fg-1)' : undefined }}>
          {g.title}
          {g.count > 1 ? <span style={{ color, fontWeight: 800 }}>  (x{fmtInt(g.count)})</span> : null}
        </div>
        <div className="log-meta">
          {g.count > 1 ? (
            <>
              <span>İlk: <b style={{ color: 'var(--fg-2)' }}>{fmtTimeOfDay(g.firstTs)}</b> (kare {g.firstFrame})</span>
              <span>Son: <b style={{ color: 'var(--fg-2)' }}>{fmtTimeOfDay(g.lastTs)}</b> (kare {g.lastFrame})</span>
            </>
          ) : (
            <span>{fmtTimeOfDay(g.lastTs)} · kare {g.lastFrame}</span>
          )}
          {g.isSpam ? <span className="cnt">SPAM GRUBU</span> : null}
          {g.culprit ? (
            <span className="culprit" onClick={() => onSelectFrame(g.lastFrame)} style={{ cursor: 'pointer' }} title="Bu kareyi incele">
              {g.culprit.file.split('/').pop()}:{g.culprit.line} · {g.culprit.fn}
            </span>
          ) : null}
        </div>
        {expanded ? (
          <>
            <ContextPills ctx={g.context} />
            <StackView stack={g.stack} culprit={g.culprit} />
            {g.instances && g.instances.length > 1 ? (
              <div className="instances">
                {g.instances.slice(-6).reverse().map((i, k) => (
                  <div className="inst" key={k}>
                    <span>{fmtTimeOfDay(i.ts)}</span>
                    <span>kare {i.frame}</span>
                    <span>{i.msg}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="row tight" style={{ marginTop: 6 }}>
              <button className="btn sm" onClick={() => onSelectFrame(g.firstFrame)}>İlk kareye git</button>
              <button className="btn sm" onClick={() => onSelectFrame(g.lastFrame)}>Son kareye git</button>
              <span className="hint" style={{ marginLeft: 4 }}>fingerprint: <span className="mono">{g.id}</span></span>
            </div>
          </>
        ) : (
          <ContextPills ctx={g.context} />
        )}
      </div>
    </div>
  );
}

export default function LogPanel() {
  const groups = useStore((s) => s.groups);
  const rawLogs = useStore((s) => s.rawLogs);
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const expanded = useStore((s) => s.expanded);
  const toggleExpanded = useStore((s) => s.toggleExpanded);
  const tags = useStore((s) => s.tags);
  const logStats = useStore((s) => s.logStats);
  const selectFrame = useStore((s) => s.selectFrame);
  const clearLogs = useStore((s) => s.clearLogs);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  const [detailCache, setDetailCache] = useState<Record<string, LogGroup>>({});
  const [autoScroll, setAutoScroll] = useState(true);

  /* --- filtreleme (React.memo dostu, saf hesaplama) --- */
  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const lv = new Set(filters.levels);
    const tg = new Set(filters.tags);
    if (filters.mode === 'raw') {
      return rawLogs
        .filter((l) => {
          if (lv.size && !lv.has(l.level)) return false;
          if (tg.size && !(l.tag && tg.has(l.tag))) return false;
          if (q && !`${l.msg} ${l.tag ?? ''}`.toLowerCase().includes(q)) return false;
          return true;
        })
        .slice(-filters.maxRows)
        .reverse();
    }
    return groups
      .filter((g) => {
        if (lv.size && !lv.has(g.level)) return false;
        if (tg.size && !(g.tag && tg.has(g.tag))) return false;
        if (filters.spamOnly && !g.isSpam) return false;
        if (q) {
          const hay = `${g.title} ${g.tag ?? ''} ${g.culprit?.file ?? ''} ${g.culprit?.fn ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .slice(0, filters.maxRows);
  }, [groups, rawLogs, filters]);

  /* --- sanallaştırma: satır yükseklikleri --- */
  const heights = useMemo(() => {
    return rows.map((r: any) => {
      const id = filters.mode === 'raw' ? `${r.fingerprint}-${r.ts}` : r.id;
      const isOpen = !!expanded[id];
      if (!isOpen) return ROW_BASE + (r.context ? 18 : 0) + (r.count > 1 ? 14 : 0);
      const stackLines = r.stack ? String(r.stack).split('\n').length : 0;
      const inst = filters.mode === 'raw' ? 0 : Math.min(6, r.instances?.length ?? 0);
      return ROW_BASE + (r.context ? 18 : 0) + (r.count > 1 ? 14 : 0) + 34 + stackLines * 16 + inst * 15 + 28;
    });
  }, [rows, expanded, filters.mode]);

  const offsets = useMemo(() => {
    const o = new Array(heights.length + 1);
    o[0] = 0;
    for (let i = 0; i < heights.length; i++) o[i + 1] = o[i] + heights[i];
    return o;
  }, [heights]);

  const total = offsets[offsets.length - 1] ?? 0;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewport({ top: el.scrollTop, height: el.clientHeight }));
    ro.observe(el);
    setViewport({ top: el.scrollTop, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // yeni satır gelince alta kaydır (kullanıcı yukarı kaydırdıysa dur)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !autoScroll || filters.paused) return;
    el.scrollTop = el.scrollHeight;
  }, [rows.length, autoScroll, filters.paused]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewport({ top: el.scrollTop, height: el.clientHeight });
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const startIdx = Math.max(0, searchIdx(offsets, viewport.top) - OVERSCAN);
  const endIdx = Math.min(rows.length, searchIdx(offsets, viewport.top + viewport.height) + OVERSCAN + 1);
  const visible = rows.slice(startIdx, endIdx);

  const toggleLevel = (l: LogLevel) => {
    const has = filters.levels.includes(l);
    setFilters({ levels: has ? filters.levels.filter((x) => x !== l) : [...filters.levels, l] });
  };
  const toggleTag = (t: string) => {
    const has = filters.tags.includes(t);
    setFilters({ tags: has ? filters.tags.filter((x) => x !== t) : [...filters.tags, t] });
  };

  const loadDetail = async (id: string) => {
    if (detailCache[id]) return;
    try {
      const d = await api<LogGroup>(`/logs/${encodeURIComponent(id)}`);
      setDetailCache((c) => ({ ...c, [id]: d }));
      // grup listesini de zenginleştir
      const gs = useStore.getState().groups.map((g) => (g.id === id ? { ...g, ...d } : g));
      useStore.setState({ groups: gs });
    } catch { /* yoksay */ }
  };

  return (
    <div className="panel logs">
      <div className="panel-head">
        <span className="panel-title">Log Akışı</span>
        <div className="seg">
          <button className={filters.mode === 'grouped' ? 'on' : ''} onClick={() => setFilters({ mode: 'grouped' })}>Grup</button>
          <button className={filters.mode === 'raw' ? 'on' : ''} onClick={() => setFilters({ mode: 'raw' })}>Ham</button>
        </div>
        <div className="spacer" />
        <button className={`btn sm ${filters.paused ? 'on' : ''}`} onClick={() => setFilters({ paused: !filters.paused })} title="Akışı dondur">
          {filters.paused ? '▶ Devam' : '❚❚ Dondur'}
        </button>
        <button className="btn sm ghost" onClick={clearLogs} title="Listeyi temizle">Temizle</button>
      </div>

      <div className="filters">
        {LEVELS.map((l) => {
          const on = filters.levels.includes(l);
          const c = LEVEL_COLOR[l];
          return (
            <button key={l} className={`chip ${on ? 'on' : ''}`} style={on ? { background: c, color: '#05080e' } : { color: c }} onClick={() => toggleLevel(l)}>
              {LEVEL_LABEL[l]} {l === 'error' || l === 'exception' ? '' : ''}
            </button>
          );
        })}
        <button className={`chip ${filters.spamOnly ? 'on' : ''}`} style={filters.spamOnly ? { background: 'var(--bad)', color: '#05080e' } : undefined} onClick={() => setFilters({ spamOnly: !filters.spamOnly })} title="Yalnızca spam grupları (x5 ve üzeri tekrar)">
          SPAM x5+
        </button>
        {tags.slice(0, 12).map((t) => {
          const on = filters.tags.includes(t);
          const c = tagColor(t);
          return (
            <button key={t} className={`chip tag ${on ? 'on' : ''}`} style={on ? { background: c, color: '#05080e' } : { color: c }} onClick={() => toggleTag(t)}>
              [{t}]
            </button>
          );
        })}
      </div>

      <div className="search-row">
        <input className="inp" placeholder="Ara: mesaj, dosya, fonksiyon…" value={filters.search} onChange={(e) => setFilters({ search: e.target.value })} />
        <select className="inp" value={filters.maxRows} onChange={(e) => setFilters({ maxRows: Number(e.target.value) })} title="Gösterilecek en fazla satır">
          {[200, 500, 2000, 10000].map((n) => <option key={n} value={n}>{n} satır</option>)}
        </select>
      </div>

      <div className="logstats">
        <span>ham <b>{fmtInt(logStats.raw)}</b></span>
        <span>satır <b>{fmtInt(logStats.groups)}</b></span>
        <span>bastırılan <b>{fmtInt(logStats.suppressed)}</b></span>
        <span>spam grubu <b style={{ color: 'var(--bad)' }}>{fmtInt(logStats.spamGroups)}</b></span>
        <span>sıkıştırma <b style={{ color: 'var(--ok)' }}>%{((logStats.ratio ?? 0) * 100).toFixed(1)}</b></span>
        <span className="spacer" />
        <span>görünen <b>{fmtInt(rows.length)}</b></span>
      </div>

      <div className="panel-body" ref={scrollRef} onScroll={onScroll} style={{ overflow: 'auto' }}>
        {!rows.length ? (
          <div className="empty">
            Log yok.<br />
            <span className="hint">Ajan bağlıysa ve oyun çalışıyorsa loglar burada gruplanmış olarak belirir.</span>
          </div>
        ) : (
          <div className="vlist" style={{ height: total }}>
            {visible.map((r: any, i) => {
              const idx = startIdx + i;
              const id = filters.mode === 'raw' ? `${r.fingerprint}-${r.ts}` : r.id;
              const isOpen = !!expanded[id];
              return (
                <div key={id + ':' + idx} className={`vrow${isOpen ? ' open' : ''}${r.isSpam ? ' spam' : ''}`} style={{ top: offsets[idx], height: heights[idx] }}>
                  {filters.mode === 'raw' ? (
                    <RawRow r={r} />
                  ) : (
                    <GroupRow
                      g={detailCache[r.id] ? { ...r, ...detailCache[r.id] } : r}
                      expanded={isOpen}
                      onToggle={() => {
                        if (!isOpen) loadDetail(r.id);
                        toggleExpanded(id);
                      }}
                      onSelectFrame={(fid) => selectFrame(fid)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RawRow({ r }: { r: any }) {
  const color = LEVEL_COLOR[r.level] ?? 'var(--fg-2)';
  return (
    <>
      <span className="log-level" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>{LEVEL_LABEL[r.level] ?? r.level}</span>
      {r.tag ? <span className="tag-pill" style={{ color: tagColor(r.tag) }}>{r.tag}</span> : null}
      <div className="log-main">
        <div className="log-msg">{r.msg}</div>
        <div className="log-meta">
          <span>{fmtTimeOfDay(r.ts)}</span>
          <span>kare {r.frame}</span>
          {r.culprit ? <span className="culprit">{r.culprit.file.split('/').pop()}:{r.culprit.line}</span> : null}
        </div>
      </div>
    </>
  );
}

/** offsets dizisinde binary search: y pozisyonuna denk gelen satır indeksi. */
function searchIdx(offsets: number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid; else hi = mid - 1;
  }
  return Math.max(0, lo);
}
