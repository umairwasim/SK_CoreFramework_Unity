/** Biçimlendirme yardımcıları — panonun her yerinde tutarlı gösterim için. */

export const KB = 1024;
export const MB = 1048576;

export function fmtBytes(b: number | null | undefined, digits = 1): string {
  if (b == null || Number.isNaN(b)) return '—';
  const abs = Math.abs(b);
  if (abs >= 1073741824) return `${(b / 1073741824).toFixed(digits)} GB`;
  if (abs >= MB) return `${(b / MB).toFixed(digits)} MB`;
  if (abs >= KB) return `${(b / KB).toFixed(abs >= 100 * KB ? 0 : 1)} KB`;
  return `${b.toFixed(0)} B`;
}

export function fmtMs(ms: number | null | undefined, digits = 2): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (Math.abs(ms) >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(digits)} ms`;
}

export function fmtUs(us: number | null | undefined): string {
  if (us == null) return '—';
  if (us >= 1000) return `${(us / 1000).toFixed(2)} ms`;
  return `${us.toFixed(0)} µs`;
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 10_000) return `${(n / 1e3).toFixed(0)}k`;
  if (a >= 1_000) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

/** oturum başından geçen saniye -> mm:ss.mmm */
export function fmtClock(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

export function fmtTimeOfDay(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** FPS -> renk (hedef kare bütçesine göre). */
export function fpsColor(fps: number, targetFps = 60): string {
  const budget = 1000 / targetFps;
  const dt = 1000 / Math.max(0.001, fps);
  if (dt <= budget * 1.15) return 'var(--ok)';
  if (dt <= budget * 2) return 'var(--warn)';
  return 'var(--bad)';
}

export function dtColor(dt: number, targetFps = 60): string {
  const budget = 1000 / targetFps;
  if (dt <= budget * 1.15) return 'var(--ok)';
  if (dt <= budget * 2) return 'var(--warn)';
  return 'var(--bad)';
}

export const LEVEL_COLOR: Record<string, string> = {
  log: 'var(--lvl-log)',
  warn: 'var(--lvl-warn)',
  error: 'var(--lvl-error)',
  exception: 'var(--lvl-exception)',
  assert: 'var(--lvl-error)',
};

export const LEVEL_LABEL: Record<string, string> = {
  log: 'LOG', warn: 'WARN', error: 'ERROR', exception: 'EXC', assert: 'ASSERT',
};

export const SEVERITY_COLOR: Record<string, string> = {
  low: 'var(--warn)', medium: 'var(--warn)', high: 'var(--bad)',
};

/** Deterministik isim -> renk (flamegraph ve etiket chip'leri için). */
export function hashHue(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % 360;
}

export function flameColor(name: string, selfShare: number): string {
  const hue = hashHue(name);
  // self payı arttıkça doygunluk ve parlaklık artar (sıcak nokta vurgusu)
  const sat = 45 + Math.min(40, selfShare * 260);
  const light = 38 + Math.min(22, selfShare * 160);
  return `hsl(${hue} ${sat.toFixed(0)}% ${light.toFixed(0)}%)`;
}

export function tagColor(tag: string): string {
  const hue = hashHue(tag);
  return `hsl(${hue} 62% 58%)`;
}

export function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
