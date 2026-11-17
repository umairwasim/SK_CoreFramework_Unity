import path from 'node:path';

export const toPosix = (p: string) => p.split(path.sep).join('/');

/** Absolute → project-relative POSIX path ("Assets/Art/a.png"). */
export function toRel(root: string, abs: string): string {
  return toPosix(path.relative(root, abs));
}

/** Project-relative → absolute, refusing anything that escapes the project root. */
export function safeResolve(root: string, rel: string): string {
  const abs = path.resolve(root, ...rel.split('/'));
  const r = path.relative(root, abs);
  if (r.startsWith('..') || path.isAbsolute(r)) throw new Error(`Path escapes project: ${rel}`);
  return abs;
}

/** Unity ignores these (see "Special folder names" in the Unity manual). */
export function unityIgnored(name: string): boolean {
  return name.startsWith('.') || name.endsWith('~') || name.toLowerCase() === 'cvs' || name.toLowerCase().endsWith('.tmp');
}

export function splitRel(rel: string) {
  const i = rel.lastIndexOf('/');
  const folder = i >= 0 ? rel.slice(0, i) : '';
  const file = i >= 0 ? rel.slice(i + 1) : rel;
  const dot = file.lastIndexOf('.');
  const name = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot + 1).toLowerCase() : '';
  return { folder, file, name, ext };
}
