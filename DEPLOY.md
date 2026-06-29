# 🚀 FinSight Deployment Guide

## Architecture
```
Netlify  →  static frontend  (free)
Render   →  Python backend   (free tier)
```

---

## Step 1 — Push code to GitHub

Make sure your latest code is on GitHub.

```bash
# In the Finsight folder:
git add .
git commit -m "Add LangChain backend + deployment config"
git push
```

---

## Step 2 — Deploy Backend to Render

> **Get a free API key first:**
> Gemini (no credit card): https://aistudio.google.com/app/apikey

### 2a. Create a Render account
Go to **https://render.com** and sign up with GitHub.

### 2b. Create a new Web Service

1. Click **New → Web Service**
2. Connect your **GitHub repo** (`Finsight`)
3. Render detects `render.yaml` automatically — click **Apply**
4. Fill in settings if prompted:
   - **Name:** `finsight-api`
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** Free

### 2c. Add your API key

In Render dashboard → your service → **Environment**:

| Key | Value |
|-----|-------|
| `GEMINI_API_KEY` | `AIza...your-key...` |

*(or use `OPENAI_API_KEY` if using OpenAI)*

Click **Save Changes** — Render restarts the service.

### 2d. Copy your backend URL

Once deployed, Render gives you a URL like:
```
https://finsight-api.onrender.com
```
**Copy this** — you need it in Step 3.

---

## Step 3 — Connect frontend to backend

Open **`config.js`** and update the URL:

```js
// Change this line:
window.FINSIGHT_API = "https://finsight-api.onrender.com";
```

Then commit and push:
```bash
git add config.js
git commit -m "Point frontend to Render backend"
git push
```

---

## Step 4 — Deploy Frontend to Netlify

### Option A — Auto-deploy (if GitHub is linked)
The push in Step 3 triggers Netlify automatically. Done!

### Option B — Manual drag & drop
1. Go to https://app.netlify.com → your site → **Deploys**
2. Drag the entire `Finsight` folder onto the deploy zone
3. Wait ~30 seconds

---

## Step 5 — Test it!

Open https://timely-cassata-1648a6.netlify.app, go to **Document Analyzer**,
upload a real PDF, and the LangChain + AI analysis runs for real.

---

## Notes

**Render free-tier cold starts:** The free service sleeps after 15 min idle.
First request wakes it up (~30-50 sec). Normal for free hosting.

**Switching environments:**

| Environment | config.js value |
|-------------|-----------------|
| Local dev   | `http://127.0.0.1:8000` |
| Production  | `https://finsight-api.onrender.com` |

**Run locally:**
```bat
REM Double-click start.bat — OR manually in two terminals:
cd backend && venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
python local-server.py
REM Then open http://127.0.0.1:3000
```
