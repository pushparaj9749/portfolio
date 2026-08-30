/* =========================================================
   Bench — worker entry
   One message = one file. The heavy canvas encode happens here so
   the main thread never drops a frame while a batch runs.
   ========================================================= */

import { run, errorMessage } from "./core/pipeline.js";

self.onmessage = async (e) => {
  const { id, file, spec } = e.data || {};
  try {
    const res = await run(file, spec);
    // transferable where possible; Blobs are structured-cloned cheaply
    self.postMessage({ id, ok: true, res });
  } catch (err) {
    self.postMessage({ id, ok: false, error: errorMessage(err) });
  }
};

self.postMessage({ ready: true });
