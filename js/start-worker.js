// Runs the yearly-reset plan off the main thread so the knobs stay responsive.
import { adaptivePlan } from "./retirement-model.js?v=22";

self.onmessage = (event) => {
  const input = event.data;
  try {
    self.postMessage({ input, ...adaptivePlan(input) });
  } catch (err) {
    self.postMessage({ input, error: String(err && err.message ? err.message : err) });
  }
};
