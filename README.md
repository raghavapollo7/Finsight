# FinSight AI

> **LLMOps platform for financial document automation — built for NBFC use cases like loan and credit document processing.**

FinSight AI uses OCR, NLP, and LLM APIs (Google Gemini / OpenAI) to extract structured data from unstructured financial documents — salary slips, bank statements, ITR forms, and credit reports. It was originally built around a placement opportunity with **Aadhar Housing Finance** and has since grown into a full-stack LLMOps pipeline with fraud detection, credit risk analysis, and PDF report generation.

---

## ✨ Features

- 📄 **Document Analysis** — Upload financial PDFs/images; extract key fields automatically via LLM
- 🤖 **LangChain RAG Chat** — Conversational interface to query document contents in natural language
- 🚨 **Fraud Detection** — Rule-based heuristics flagging income anomalies, mismatched employer data, and suspicious patterns
- 📊 **Credit Risk Scoring** — Automated credit assessment with structured output
- 🖨️ **PDF Report Export** — Generate formatted credit summary reports ready for loan officer review
- 🌐 **Deployed** — Frontend on Netlify, Python backend on Render (free tier)

---

## 🏗️ Architecture

```
User
 │
 ▼
index.html  (Vanilla JS + CSS frontend)
 │
 ▼  REST API (JSON)
FastAPI backend  (uvicorn · Python 3.11+)
 ├── main.py          — App entry point, CORS, route registration
 ├── analyzer.py      — Core pipeline: document parsing → LLM extraction
 ├── chat.py          — LangChain RAG conversational endpoint
 └── schema.py        — Pydantic output schemas (structured extraction)
 │
 ▼
LLM API  (Google Gemini  |  OpenAI GPT-4o)
 │
 ▼
Structured JSON output  →  frontend display  +  PDF report
```

**Key design decision:** Document text is pre-processed through a lightweight NLP/parsing pass before reaching the LLM. This reduces token count, cuts API cost, and improves extraction accuracy by giving the model cleaner, structured input.

---

## 🗂️ Repo Structure

```
Finsight/
├── index.html          # Main frontend UI
├── style.css           # Core styles
├── responsive.css      # Mobile-responsive overrides
├── app.js              # Frontend logic — document upload, API calls, UI state
├── fraud.js            # Fraud detection heuristics and flag rendering
├── report-pdf.js       # PDF credit report generation (client-side)
├── config.js           # API endpoint config (local ↔ production switch)
├── local-server.js     # Node.js local dev server (optional)
├── local-server.py     # Python local dev server (optional)
├── start.bat           # Windows one-click startup script
├── netlify.toml        # Netlify frontend deployment config
├── render.yaml         # Render backend deployment config
├── DEPLOY.md           # Step-by-step deployment guide
└── backend/
    ├── main.py             # FastAPI app, CORS, route mounting
    ├── analyzer.py         # Document analysis + LLM extraction pipeline
    ├── chat.py             # LangChain RAG chat endpoint
    ├── schema.py           # Pydantic schemas for structured LLM output
    ├── requirements.txt    # Python dependencies
    ├── Procfile            # Process definition for deployment
    ├── runtime.txt         # Python version pin
    └── .env.example        # Environment variable template
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, Vanilla JS, CSS3 |
| **Backend** | Python 3.11+, FastAPI, Uvicorn |
| **LLM Orchestration** | LangChain (`langchain`, `langchain-core`) |
| **LLM Providers** | Google Gemini API · OpenAI API (configurable) |
| **Data Validation** | Pydantic v2 |
| **PDF Generation** | Client-side JS (`report-pdf.js`) |
| **Frontend Hosting** | Netlify |
| **Backend Hosting** | Render.com |

---

## 🚀 Local Setup

### 1. Clone the repo

```bash
git clone https://github.com/raghavapollo7/Finsight.git
cd Finsight
```

### 2. Set up the backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure your API key
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY or OPENAI_API_KEY
```

### 3. Start the backend

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Start the frontend

From the root `Finsight/` directory:

```bash
# Option A — Windows (one-click)
start.bat

# Option B — Python
python local-server.py

# Option C — Node.js
node local-server.js
```

Open `http://localhost:3000` in your browser.

> **`config.js` controls which backend the frontend talks to.** In local mode it points to `http://localhost:8000`. For production, update it to your Render URL.

---

## 🔑 Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in one of the following:

```env
# Option A — Google Gemini (free tier available)
GEMINI_API_KEY=AIza...your-key...

# Option B — OpenAI
OPENAI_API_KEY=sk-...your-key...
```

> ⚠️ Never commit your `.env` file. It is already in `.gitignore`.

---

## ☁️ Deployment

See [`DEPLOY.md`](DEPLOY.md) for the full step-by-step guide.

| Service | Purpose | Cost |
|---|---|---|
| **Netlify** | Hosts the static frontend (`index.html`, JS, CSS) | Free |
| **Render** | Runs the FastAPI Python backend | Free tier |

Quick summary:
1. Push to GitHub
2. Deploy `backend/` as a Web Service on Render → set your API key in Environment
3. Copy the Render URL → update `config.js` with it
4. Deploy root folder on Netlify

---

## 📌 Key Files to Explore

| File | What it does |
|---|---|
| [`backend/analyzer.py`](backend/analyzer.py) | Core pipeline: text extraction → NLP pre-processing → LLM call → structured output |
| [`backend/chat.py`](backend/chat.py) | LangChain RAG endpoint — conversational Q&A over uploaded documents |
| [`backend/schema.py`](backend/schema.py) | Pydantic schemas defining the structured extraction output format |
| [`fraud.js`](fraud.js) | Fraud flag heuristics — income/EMI ratio checks, employer mismatch, anomaly detection |
| [`report-pdf.js`](report-pdf.js) | PDF credit report generation from extracted JSON data |
| [`app.js`](app.js) | Frontend orchestration — upload flow, API calls, result rendering |

---

## 🔭 Roadmap

- [ ] Extend fraud detection with a trained ML classifier (beyond rule-based heuristics)
- [ ] Support additional document types (rental agreements, property valuation reports)
- [ ] Feedback loop — allow loan officers to mark extractions correct/incorrect to improve prompts
- [ ] Async pipeline — parallelize OCR and parsing stages for lower latency
- [ ] Rate limiting and auth layer for multi-tenant NBFC deployments

---

## 👤 Author

**Raghava** · [github.com/raghavapollo7](https://github.com/raghavapollo7)

Built as part of an exploration into LLMOps for financial services, anchored by a placement opportunity with **Aadhar Housing Finance**.
