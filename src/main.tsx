import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Enforce Light Mode or use system preference
document.documentElement.classList.remove('dark');

// After a new deploy, a tab that was already open still points at page files that no longer exist
// ("Failed to fetch dynamically imported module"). Reload once to pick up the new version; the
// timestamp stops it looping if the failure is something else (e.g. the network is down).
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    const last = Number(sessionStorage.getItem('chunkReloadAt') || 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem('chunkReloadAt', String(Date.now()));
  } catch { /* storage unavailable: reload anyway, once per page load */ }
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
