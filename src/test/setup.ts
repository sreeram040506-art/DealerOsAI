import "@testing-library/jest-dom";

// server/services/documentParser.js loads server/.env at import time and, by default,
// dotenv never overwrites a variable that's already present in process.env. Blanking these
// here — before any test file imports that module — guarantees the parser's fallback/regex
// path is what's under test, never a live call to a real, paid LLM API using whatever key
// happens to be in a developer's local .env. Without this, the suite was slow (2-4.5s per
// test that touches extractVehicleInfo), flaky, non-deterministic, and silently billed
// against a real account — and behaved completely differently for anyone running it without
// a key configured locally.
process.env.OPENAI_API_KEY = "";
process.env.NVIDIA_API_KEY = "";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
