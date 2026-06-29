/**
 * FinSight AI — API Configuration
 *
 * This file controls which backend the frontend talks to.
 *
 * LOCAL  → keep this file as-is (points to local uvicorn server)
 * PROD   → change FINSIGHT_API to your Render.com service URL, e.g.:
 *           window.FINSIGHT_API = "https://finsight-api.onrender.com";
 *
 * After deploying to Render, update this line and push/re-deploy to Netlify.
 */

window.FINSIGHT_API = "https://finsight-pyjw.onrender.com";
