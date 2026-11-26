// Runs the save-now, need-later search off the main thread so the knobs stay responsive.
import { rampPlan } from "./retirement-model.js?v=21";

self.onmessage = (event) => {
  const input = event.data;
  try {
    self.postMessage({ input, ...rampPlan(input) });
  } catch (err) {
    self.postMessage({ input, error: String(err && err.message ? err.message : err) });
  }
};
