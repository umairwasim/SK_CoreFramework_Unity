/**
 * Unity .meta handling.
 *
 * Golden rules (spec §2.1):
 *  - The `guid:` line is NEVER rewritten by the editor (MetaEditor refuses to touch it).
 *  - We never regenerate a .meta from scratch – we patch individual scalar lines in place,
 *    preserving indentation, key order, unknown keys, line endings and trailing newline.
 *  - After every patch the caller verifies `readGuid(before) === readGuid(after)`.
 */
import { randomBytes } from 'node:crypto';

const GUID_RE = /^guid:[ \t]*([0-9a-fA-F]{32})[ \t]*$/m;

export function readGuid(metaText: string | null | undefined): string | null {
  if (!metaText) return null;
  const m = GUID_RE.exec(metaText);
  return m ? m[1].toLowerCase() : null;
}

/** Unity GUIDs are 128-bit values rendered as 32 lower-case hex chars. */
export function newGuid(): string {
  return randomBytes(16).toString('hex');
}

/** Only used for "Save as New": the copy must get its own identity. */
export function replaceGuid(metaText: string, guid: string): string {
  if (!/^[0-9a-f]{32}$/.test(guid)) throw new Error(`Invalid GUID "${guid}"`);
  if (!GUID_RE.test(metaText)) throw new Error('No guid line found in .meta');
  return metaText.replace(GUID_RE, `guid: ${guid}`);
}

/** Unity asset labels: top-level `labels:` block sequence (or inline `labels: [a, b]`). */
export function readLabels(metaText: string | null | undefined): string[] {
  if (!metaText) return [];
  const lines = metaText.split(/\r?\n/);
  const i = lines.findIndex((l) => /^labels:/.test(l));
  if (i < 0) return [];
  const inline = /^labels:\s*\[(.*)\]\s*$/.exec(lines[i]);
  if (inline) return inline[1].split(',').map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (let j = i + 1; j < lines.length; j++) {
    const m = /^-\s+(.+?)\s*$/.exec(lines[j]);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

export function readImporterType(metaText: string | null | undefined): string | null {
  if (!metaText) return null;
  const m = /^([A-Za-z]+Importer):\s*$/m.exec(metaText);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------

interface LineInfo {
  raw: string;
  indent: number; // column of the dash (if any) or the key
  dash: boolean;
  key: string | null;
  value: string | null; // null when the line is not a `key: value` line
  path: string[]; // full key path (sequence items are transparent)
}

const KEY_RE = /^(\s*)(- )?([A-Za-z0-9_][^:]*?):(?:([ \t])(.*))?$/;

export class MetaEditor {
  private lines: LineInfo[] = [];
  private eol: string;
  readonly original: string;
  readonly changes: string[] = [];

  constructor(text: string) {
    this.original = text;
    this.eol = text.includes('\r\n') ? '\r\n' : '\n';
    this.reparse(text.split(/\r?\n/));
  }

  private reparse(rawLines: string[]) {
    const stack: { indent: number; key: string }[] = [];
    this.lines = rawLines.map((raw) => {
      const m = KEY_RE.exec(raw);
      if (!m) {
        return { raw, indent: raw.length - raw.trimStart().length, dash: raw.trimStart().startsWith('- '), key: null, value: null, path: [] };
      }
      const indent = m[1].length;
      const dash = !!m[2];
      const eff = indent + (dash ? 2 : 0);
      while (stack.length && stack[stack.length - 1].indent >= eff) stack.pop();
      const key = m[3];
      const path = [...stack.map((s) => s.key), key];
      stack.push({ indent: eff, key });
      return { raw, indent, dash, key, value: m[5] ?? '', path };
    });
  }

  get importerType(): string | null {
    for (const l of this.lines) if (l.path.length === 1 && l.key && /Importer$/.test(l.key)) return l.key;
    return null;
  }

  private find(path: string[]): number {
    return this.lines.findIndex((l) => l.key !== null && l.path.length === path.length && l.path.every((p, i) => p === path[i]));
  }

  get(path: string[]): string | undefined {
    const i = this.find(path);
    return i >= 0 ? (this.lines[i].value ?? undefined) : undefined;
  }

  has(path: string[]): boolean {
    return this.find(path) >= 0;
  }

  private setLine(i: number, value: string, label: string): boolean {
    const l = this.lines[i];
    if (l.key === 'guid') throw new Error('Refusing to modify guid');
    const old = l.value ?? '';
    if (old.trim() === value.trim()) return false;
    const prefix = l.raw.slice(0, l.raw.indexOf(':') + 1);
    l.raw = `${prefix} ${value}`;
    l.value = value;
    this.changes.push(`${label}: ${old.trim() || '∅'} → ${value}`);
    return true;
  }

  /** Set a scalar at an exact path. Returns false if the key doesn't exist (we never invent keys). */
  set(path: string[], value: string | number): boolean {
    if (path[path.length - 1] === 'guid') throw new Error('Refusing to modify guid');
    const i = this.find(path);
    if (i < 0) return false;
    this.setLine(i, String(value), path.slice(1).join('.'));
    return true;
  }

  /** Set the first occurrence of `key` anywhere below `root` (fallback for keys whose parent moved between Unity versions). */
  setFirst(root: string, key: string, value: string | number, preferPaths: string[][] = []): boolean {
    for (const p of preferPaths) if (this.set(p, value)) return true;
    const i = this.lines.findIndex((l) => l.key === key && l.path[0] === root && l.path.length > 1 && !l.dash);
    if (i < 0) return false;
    this.setLine(i, String(value), this.lines[i].path.slice(1).join('.'));
    return true;
  }

  // --- TextureImporter.platformSettings -----------------------------------

  private platformItems(root: string): { header: number; items: { start: number; end: number; target: string | null }[] } | null {
    const header = this.find([root, 'platformSettings']);
    if (header < 0) return null;
    const hIndent = this.lines[header].indent;
    const items: { start: number; end: number; target: string | null }[] = [];
    let i = header + 1;
    for (; i < this.lines.length; i++) {
      const l = this.lines[i];
      const trimmed = l.raw.trim();
      if (trimmed === '') continue;
      if (l.dash && l.indent >= hIndent && l.indent <= hIndent + 2) {
        if (items.length) items[items.length - 1].end = i;
        items.push({ start: i, end: i + 1, target: null });
        continue;
      }
      if (l.indent <= hIndent && !l.dash) break; // next sibling key → sequence finished
    }
    if (items.length) items[items.length - 1].end = i;
    for (const it of items) {
      for (let j = it.start; j < it.end; j++) if (this.lines[j].key === 'buildTarget') it.target = this.lines[j].value?.trim() ?? null;
    }
    return { header, items };
  }

  listPlatforms(root = 'TextureImporter'): string[] {
    return (this.platformItems(root)?.items ?? []).map((i) => i.target ?? '?');
  }

  /** Set a field in every platform entry (e.g. maxTextureSize). */
  setAllPlatforms(field: string, value: string | number, root = 'TextureImporter'): number {
    const p = this.platformItems(root);
    if (!p) return 0;
    let n = 0;
    for (const it of p.items) {
      for (let j = it.start; j < it.end; j++) {
        const l = this.lines[j];
        if (l.key === field && l.path[l.path.length - 2] === 'platformSettings') {
          if (this.setLine(j, String(value), `platformSettings[${it.target}].${field}`)) n++;
        }
      }
    }
    return n;
  }

  /**
   * Patch (or create by cloning DefaultTexturePlatform) the override entry for `target`.
   * Returns 'patched' | 'added' | 'unchanged' | 'missing'.
   */
  setPlatformOverride(target: string, fields: Record<string, string | number>, root = 'TextureImporter'): 'patched' | 'added' | 'unchanged' | 'missing' {
    const p = this.platformItems(root);
    if (!p || !p.items.length) return 'missing';
    const existing = p.items.find((i) => i.target === target);
    if (existing) {
      let changed = false;
      for (const [k, v] of Object.entries(fields)) {
        for (let j = existing.start; j < existing.end; j++) {
          const l = this.lines[j];
          if (l.key === k && l.path[l.path.length - 2] === 'platformSettings') {
            changed = this.setLine(j, String(v), `platformSettings[${target}].${k}`) || changed;
          }
        }
      }
      return changed ? 'patched' : 'unchanged';
    }
    const tmpl = p.items.find((i) => i.target === 'DefaultTexturePlatform') ?? p.items[0];
    const last = p.items[p.items.length - 1];
    const cloned = this.lines.slice(tmpl.start, tmpl.end).map((l) => l.raw).filter((r) => r.trim() !== '');
    const patched = cloned.map((raw) => {
      const m = KEY_RE.exec(raw);
      if (!m) return raw;
      const key = m[3];
      const prefix = raw.slice(0, raw.indexOf(':') + 1);
      if (key === 'buildTarget') return `${prefix} ${target}`;
      if (key in fields) return `${prefix} ${fields[key]}`;
      return raw;
    });
    const raws = this.lines.map((l) => l.raw);
    raws.splice(last.end, 0, ...patched);
    this.reparse(raws);
    this.changes.push(`platformSettings[${target}] added (${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(', ')})`);
    return 'added';
  }

  toString(): string {
    return this.lines.map((l) => l.raw).join(this.eol);
  }

  get changed(): boolean {
    return this.toString() !== this.original;
  }
}

/** Throws if the GUID differs between two .meta texts. */
export function assertSameGuid(before: string, after: string): void {
  const a = readGuid(before);
  const b = readGuid(after);
  if (!a || a !== b) throw new Error(`GUID mismatch after patch (${a} → ${b}). Aborted.`);
}
