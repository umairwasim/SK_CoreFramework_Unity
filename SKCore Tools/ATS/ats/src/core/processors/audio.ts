import { spawn } from 'node:child_process';
import ffmpeg from 'fluent-ffmpeg';
import type { AudioInfo, AudioSettings } from '../../shared/types';
import { tools } from '../tools';

function configure() {
  const t = tools();
  if (!t.ffmpeg) throw new Error('ffmpeg not found (install ffmpeg-static or set ATS_FFMPEG)');
  ffmpeg.setFfmpegPath(t.ffmpeg);
  if (t.ffprobe) ffmpeg.setFfprobePath(t.ffprobe);
}

export function audioInfo(absPath: string): Promise<AudioInfo> {
  configure();
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(absPath, (err, data) => {
      if (err) return reject(err);
      const s = data.streams.find((x) => x.codec_type === 'audio');
      resolve({
        durationSec: Number(data.format.duration ?? s?.duration ?? 0),
        channels: s?.channels ?? 0,
        sampleRate: Number(s?.sample_rate ?? 0),
        codec: s?.codec_name ?? data.format.format_name ?? '?',
        bitRate: data.format.bit_rate ? Number(data.format.bit_rate) : undefined,
      });
    });
  });
}

export interface AudioResult {
  changed: boolean;
  outExt: string;
  notes: string[];
}

/** Is there anything to do at all? Prevents a pointless lossy→lossy re-encode. */
export function audioSourceIsNoop(s: AudioSettings['source'], ext: string, info: AudioInfo | null): boolean {
  const fmtChange = s.outputFormat !== 'keep' && s.outputFormat !== ext;
  const mono = s.forceMono && (info?.channels ?? 2) > 1;
  const rate = s.sampleRate > 0 && (info?.sampleRate ?? 0) > s.sampleRate;
  return !fmtChange && !mono && !rate && !s.normalize && !s.trimSilence;
}

export function processAudio(absIn: string, outPath: string, outExt: string, s: AudioSettings['source'], info: AudioInfo | null, onProgress?: (pct: number) => void): Promise<AudioResult> {
  configure();
  const notes: string[] = [];
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(absIn).noVideo();
    const filters: string[] = [];
    if (s.trimSilence) {
      filters.push('silenceremove=start_periods=1:start_threshold=-50dB', 'areverse', 'silenceremove=start_periods=1:start_threshold=-50dB', 'areverse');
      notes.push('leading/trailing silence trimmed');
    }
    if (s.normalize) {
      filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
      notes.push('loudness normalized to -16 LUFS');
    }
    if (filters.length) cmd.audioFilters(filters);
    if (s.forceMono && (info?.channels ?? 2) > 1) {
      cmd.audioChannels(1);
      notes.push('downmixed to mono');
    }
    const srcRate = info?.sampleRate ?? 0;
    if (s.sampleRate > 0 && (srcRate === 0 || srcRate > s.sampleRate)) {
      cmd.audioFrequency(s.sampleRate);
      notes.push(`resampled ${srcRate || '?'} → ${s.sampleRate} Hz`);
    } else if (s.normalize && srcRate) {
      cmd.audioFrequency(srcRate); // loudnorm upsamples to 192k internally – pin the original rate
    }
    switch (outExt) {
      case 'wav':
        cmd.audioCodec('pcm_s16le').format('wav');
        break;
      case 'ogg':
        cmd.audioCodec('libvorbis').addOutputOptions(['-q:a', String(Math.max(0, Math.min(10, s.quality)))]).format('ogg');
        break;
      case 'mp3':
        cmd.audioCodec('libmp3lame').addOutputOptions(['-q:a', String(Math.max(0, Math.min(9, 10 - s.quality)))]).format('mp3');
        break;
      default:
        return reject(new Error(`Unsupported audio output: ${outExt}`));
    }
    cmd.addOutputOptions(['-map_metadata', '-1']);
    if (onProgress) cmd.on('progress', (p) => p.percent != null && onProgress(p.percent));
    cmd
      .on('error', (e) => reject(e))
      .on('end', () => resolve({ changed: true, outExt, notes }))
      .save(outPath);
  });
}

/** Waveform peaks (0..1) for grid thumbnails – decodes to 8 kHz mono PCM via ffmpeg. */
export function audioPeaks(absIn: string, bins = 96): Promise<number[]> {
  const t = tools();
  if (!t.ffmpeg) return Promise.reject(new Error('ffmpeg not found'));
  return new Promise((resolve, reject) => {
    const p = spawn(t.ffmpeg!, ['-v', 'error', '-i', absIn, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { windowsHide: true });
    const chunks: Buffer[] = [];
    p.stdout.on('data', (d: Buffer) => chunks.push(d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}`));
      const buf = Buffer.concat(chunks);
      const n = Math.floor(buf.length / 2);
      const per = Math.max(1, Math.floor(n / bins));
      const peaks: number[] = [];
      for (let b = 0; b < bins; b++) {
        let max = 0;
        for (let i = b * per; i < Math.min(n, (b + 1) * per); i++) max = Math.max(max, Math.abs(buf.readInt16LE(i * 2)));
        peaks.push(max / 32768);
      }
      resolve(peaks);
    });
  });
}

export function peaksToSvg(peaks: number[]): string {
  const w = 256;
  const h = 128;
  const bw = w / peaks.length;
  const bars = peaks
    .map((p, i) => {
      const ph = Math.max(1.5, p * (h - 16));
      return `<rect x="${(i * bw + bw * 0.15).toFixed(2)}" y="${((h - ph) / 2).toFixed(2)}" width="${(bw * 0.7).toFixed(2)}" height="${ph.toFixed(2)}" rx="1"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><g fill="#38bdf8">${bars}</g></svg>`;
}
