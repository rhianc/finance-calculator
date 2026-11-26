// Runs the start-age sweep off the main thread so the knobs stay responsive.
import { startAges } from "./retirement-model.js?v=19";

self.onmessage = (event) => {
  const input = event.data;
  try {
    self.postMessage({ input, ages: startAges(input) });
  } catch (err) {
    self.postMessage({ input, error: String(err && err.message ? err.message : err) });
  }
};
