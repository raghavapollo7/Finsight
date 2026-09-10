/**
 * FinSight AI — API Configuration
 *
 * Auto-detects where the frontend is running:
 *   - localhost / 127.0.0.1  → local uvicorn backend (http://localhost:8000)
 *   - anything else (Netlify) → deployed Render backend
 *
 * To force a specific backend, replace the auto-detection below, e.g.:
 *   window.FINSIGHT_API = "https://finsight-pyjw.onrender.com";
 */

(function () {
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  window.FINSIGHT_API = isLocal
    ? "http://localhost:8000"
    : "https://finsight-pyjw.onrender.com"; // ← your Render service URL
})();
