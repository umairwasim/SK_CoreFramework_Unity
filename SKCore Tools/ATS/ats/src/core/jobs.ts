/**
 * Job queue.
 *
 * The spec calls for BullMQ + Redis. For a desktop app that would mean bundling/running a Redis
 * server on every artist's machine, so the MVP ships an in-process queue behind the same shape:
 * FIFO jobs, per-item progress, cancellation, throttled progress events. A BullMQ backend can
 * implement `JobBackend` later without touching the UI or the transform pipeline.
 */
import { randomUUID } from 'node:crypto';
import type { JobItemResult, JobStatus } from '../shared/types';

export interface JobContext {
  readonly cancelled: boolean;
  setCurrent(label: string): void;
}

export interface JobSpec<T> {
  label: string;
  items: T[];
  labelOf: (item: T) => string;
  run: (item: T, ctx: JobContext) => Promise<JobItemResult>;
  onStart?: (job: JobStatus) => Promise<void> | void;
  onFinish?: (job: JobStatus) => Promise<void> | void;
}

export interface JobBackend {
  enqueue<T>(spec: JobSpec<T>): JobStatus;
  cancel(id: string): void;
  list(): JobStatus[];
}

export class InProcessQueue implements JobBackend {
  private jobs = new Map<string, JobStatus>();
  private cancelled = new Set<string>();
  private chain: Promise<void> = Promise.resolve();
  private lastEmit = new Map<string, number>();

  constructor(private emit: (job: JobStatus) => void) {}

  private publish(job: JobStatus, force = false) {
    const now = Date.now();
    if (!force && now - (this.lastEmit.get(job.id) ?? 0) < 80) return;
    this.lastEmit.set(job.id, now);
    this.emit(structuredClone(job));
  }

  enqueue<T>(spec: JobSpec<T>): JobStatus {
    const job: JobStatus = { id: randomUUID(), label: spec.label, state: 'queued', total: spec.items.length, done: 0, results: [] };
    this.jobs.set(job.id, job);
    this.publish(job, true);
    this.chain = this.chain.then(() => this.run(job, spec)).catch(() => undefined);
    return structuredClone(job);
  }

  private async run<T>(job: JobStatus, spec: JobSpec<T>) {
    if (this.cancelled.has(job.id)) {
      job.state = 'cancelled';
      this.publish(job, true);
      return;
    }
    job.state = 'running';
    job.startedAt = Date.now();
    try {
      await spec.onStart?.(job);
    } catch (e) {
      job.state = 'failed';
      job.results.push({ assetId: -1, relPath: '', ok: false, message: (e as Error).message });
      job.finishedAt = Date.now();
      this.publish(job, true);
      return;
    }
    this.publish(job, true);
    for (const item of spec.items) {
      if (this.cancelled.has(job.id)) break;
      job.current = spec.labelOf(item);
      this.publish(job);
      const ctx: JobContext = {
        get cancelled() {
          return false;
        },
        setCurrent: (l) => {
          job.current = l;
          this.publish(job);
        },
      };
      try {
        job.results.push(await spec.run(item, ctx));
      } catch (e) {
        job.results.push({ assetId: -1, relPath: spec.labelOf(item), ok: false, message: (e as Error).message });
      }
      job.done++;
      this.publish(job);
      await new Promise((r) => setImmediate(r)); // let IPC / HTTP breathe between items
    }
    job.current = undefined;
    job.finishedAt = Date.now();
    job.state = this.cancelled.has(job.id) ? 'cancelled' : job.results.some((r) => !r.ok) && job.results.every((r) => !r.ok) ? 'failed' : 'done';
    try {
      await spec.onFinish?.(job);
    } finally {
      this.publish(job, true);
    }
  }

  cancel(id: string) {
    this.cancelled.add(id);
    const j = this.jobs.get(id);
    if (j && j.state === 'queued') {
      j.state = 'cancelled';
      this.publish(j, true);
    }
  }

  list(): JobStatus[] {
    return [...this.jobs.values()].slice(-50).reverse().map((j) => structuredClone(j));
  }
}
