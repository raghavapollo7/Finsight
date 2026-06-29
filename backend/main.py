import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load env variables from the local backend directory
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BACKEND_DIR, ".env")
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

app = FastAPI(
    title="FinSight AI - LangChain Backend",
    description="Python API backend using FastAPI and LangChain for credit analysis and conversational RAG.",
    version="1.0.0"
)

# Enable CORS for frontend web browser interface
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and register routers
from analyzer import router as analyzer_router
from chat import router as chat_router

app.include_router(analyzer_router, tags=["Analysis"])
app.include_router(chat_router, tags=["Chat"])

@app.get("/")
def read_root():
    return {
        "status": "online",
        "api": "FinSight AI LangChain Backend",
        "gemini_api_key_configured": bool(os.environ.get("GEMINI_API_KEY")),
        "openai_api_key_configured": bool(os.environ.get("OPENAI_API_KEY"))
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
