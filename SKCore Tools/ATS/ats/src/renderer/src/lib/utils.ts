import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export { formatBytes } from '@shared/defaults';
export const fmtDuration = (s?: number) => {
  if (s == null || !isFinite(s)) return '–';
  if (s < 10) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
export const timeAgo = (t: number) => {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(t).toLocaleString();
};
