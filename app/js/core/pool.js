/* =========================================================
   Bench — job scheduler
   A small Worker pool when available; otherwise the exact same
   pipeline runs on the main thread. Callers never care which host
   they got — they just await submit().
   ========================================================= */

import { run, errorMessage } from "./pipeline.js";

const WORKER_URL = new URL("../bench.worker.js", import.meta.url).href;
const MAX_RETRIES = 1; // a job that kills every worker is the job's fault
const MAIN_CONCURRENCY = 2; // stop the fallback allocating the whole batch at once

export function createPool(size) {
  const cap = Math.max(1, Math.min(size || 4, 8));
  let workers = [];
  const queue = [];
  const active = new Set(); // dispatched jobs: in a worker, or on the main thread
  let broken = false;
  let dead = false;
  let mainActive = 0;

  /** Settle a job exactly once. The `done` flag is what keeps a late result
      from a terminated worker (or a job already cancelled by destroy()) from
      ever double-settling — callers may still be awaiting it, so we always
      settle, we just never settle twice. */
  function settle(job, ok, value) {
    if (!job || job.done) return;
    job.done = true;
    active.delete(job);
    if (ok) job.resolve(value);
    else job.reject(value);
  }

  function spawn() {
    if (broken || workers.length >= cap) return null;
    let worker;
    try {
      worker = new Worker(WORKER_URL, { type: "module" });
    } catch {
      // Old browser, or a host that blocks module workers — fall back for good.
      broken = true;
      return null;
    }
    const entry = { worker, job: null };

    worker.onmessage = (e) => {
      const data = e.data || {};
      const job = entry.job;
      if (data.ready || !job) return; // handshake, or a late reply after a reset
      entry.job = null;
      if (data.ok) settle(job, true, data.res);
      else settle(job, false, new Error(data.error || "Processing failed"));
      if (!dead) drain();
    };

    worker.onerror = () => finishWith(entry, false);
    worker.onunhandledrejection = () => finishWith(entry, false);

    workers.push(entry);
    return entry;
  }

  /** A worker died: requeue its job, or fail it for good. */
  function finishWith(entry, ok) {
    const job = entry.job;
    entry.job = null;
    if (job) active.delete(job);
    try {
      entry.worker.terminate();
    } catch {
      /* already gone */
    }
    workers = workers.filter((w) => w !== entry);

    if (job && !ok && !job.done) {
      job.retries = (job.retries || 0) + 1;
      if (job.retries > MAX_RETRIES || dead) {
        settle(
          job,
          false,
          new Error("This file crashed the image decoder (it may be corrupt, or too large for this device).")
        );
      } else {
        queue.unshift(job); // retry on a fresh worker
      }
    }
    if (!dead) drain();
  }

  function submit(job) {
    if (dead) return Promise.reject(new Error("Pool is shut down"));
    return new Promise((resolve, reject) => {
      queue.push({ file: job.file, spec: job.spec, resolve, reject, retries: 0, done: false });
      drain();
    });
  }

  function drain() {
    if (dead) return;
    let guard = queue.length + cap + MAIN_CONCURRENCY + 2; // bounded: never spins
    while (queue.length && guard-- > 0) {
      if (broken) {
        if (mainActive >= MAIN_CONCURRENCY) return;
        runOnMainThread(queue.shift());
        continue;
      }
      const free = workers.find((w) => !w.job);
      if (free) {
        const job = queue.shift();
        free.job = job;
        active.add(job);
        free.worker.postMessage({ id: job.spec.id, file: job.file, spec: job.spec });
        continue;
      }
      if (workers.length < cap) {
        spawn(); // may flip `broken`; the loop re-checks next pass
        continue;
      }
      return; // every worker is busy
    }
  }

  function runOnMainThread(job) {
    mainActive++;
    active.add(job);
    Promise.resolve()
      .then(() => run(job.file, job.spec))
      .then(
        (res) => settle(job, true, res),
        (err) => settle(job, false, new Error(errorMessage(err)))
      )
      .then(() => {
        mainActive--;
        if (!dead) drain();
      });
  }

  return {
    get mode() {
      return broken ? "main-thread" : "workers";
    },
    get size() {
      return broken ? MAIN_CONCURRENCY : Math.max(workers.length, 1);
    },
    get pending() {
      return queue.length;
    },
    get inflight() {
      return active.size;
    },
    submit,
    /** Pre-spawn the pool so the first batch doesn't pay worker startup. */
    warm() {
      while (workers.length < cap && !broken) {
        if (!spawn()) break;
      }
      drain();
    },
    destroy() {
      dead = true;
      const cancelled = new Error("Cancelled");
      // In-flight jobs have to be released as well, or their promises never settle
      // and anything awaiting the batch hangs forever.
      workers.forEach((entry) => {
        if (entry.job) settle(entry.job, false, cancelled);
        entry.job = null;
      });
      queue.splice(0).forEach((job) => settle(job, false, cancelled));
      Array.from(active).forEach((job) => settle(job, false, cancelled));
      active.clear();
      workers.forEach(({ worker }) => {
        try {
          worker.terminate();
        } catch {
          /* ignore */
        }
      });
      workers = [];
    },
  };
}
