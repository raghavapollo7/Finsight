"""
Shared LLM + embeddings factory.

Why this file exists:
The old code hardcoded "text-embedding-004" (retired by Google on Jan 14, 2026)
and "gemini-2.0-flash-lite" (retired June 1, 2026). Even with a valid API key,
every LLM call returned 404 "model not found" — which made the chatbot feel
like it had only one canned response and made extraction return the same
error-shaped output for every document.

Providers, in priority order:
  1. Groq        (GROQ_API_KEY)   — FREE tier, OpenAI-compatible endpoint,
                                    open-weight models (gpt-oss). No card needed.
  2. OpenAI      (OPENAI_API_KEY) — paid
  3. Google      (GEMINI_API_KEY) — has a free tier, but needs a billing-enabled
                                    Google project for some accounts
NOTE: Groq does NOT host embedding models. When Groq is the only provider, the
chat retriever falls back to BM25 keyword search (see chat.py).

Model names live HERE and nowhere else. Update them in one place.
"""
import os

from fastapi import HTTPException

# ── Provider configuration (single source of truth) ──────────────────────────
GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
GROQ_CHAT_MODEL = os.environ.get("GROQ_CHAT_MODEL", "openai/gpt-oss-20b")
GEMINI_CHAT_MODEL = os.environ.get("GEMINI_CHAT_MODEL", "gemini-2.5-flash")
GEMINI_EMBED_MODEL = os.environ.get("GEMINI_EMBED_MODEL", "gemini-embedding-001")
OPENAI_CHAT_MODEL = os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o-mini")
OPENAI_EMBED_MODEL = os.environ.get("OPENAI_EMBED_MODEL", "text-embedding-3-small")


def provider_name() -> str | None:
    """Which provider will be used: 'groq', 'openai', 'gemini', or None."""
    if os.environ.get("GROQ_API_KEY"):
        return "groq"
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    if os.environ.get("GEMINI_API_KEY"):
        return "gemini"
    return None


def embeddings_available() -> bool:
    """Groq has no embedding API — embeddings need OpenAI or Gemini."""
    return bool(os.environ.get("OPENAI_API_KEY") or os.environ.get("GEMINI_API_KEY"))


def get_llm(temperature: float = 0, max_tokens: int | None = None):
    """Returns the best available chat LLM — prefers Groq (free), then OpenAI, then Gemini.

    max_tokens: raise it for structured extraction — reasoning models spend
    output budget thinking before the JSON, and truncated JSON fails strict
    schema validation outright.
    """
    if os.environ.get("GROQ_API_KEY"):
        try:
            from langchain_openai import ChatOpenAI
            extra = {"reasoning_effort": "low"} if GROQ_CHAT_MODEL.startswith("openai/gpt-oss") else {}
            return ChatOpenAI(
                model=GROQ_CHAT_MODEL,
                temperature=temperature,
                api_key=os.environ["GROQ_API_KEY"],
                base_url=GROQ_BASE_URL,
                max_tokens=max_tokens,
                extra_body=extra,
            )
        except ImportError:
            pass  # fall through to OpenAI/Gemini
    if os.environ.get("OPENAI_API_KEY"):
        try:
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(model=OPENAI_CHAT_MODEL, temperature=temperature, max_tokens=max_tokens)
        except ImportError:
            pass  # fall through to Gemini
    if os.environ.get("GEMINI_API_KEY"):
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            kwargs = {"max_output_tokens": max_tokens} if max_tokens else {}
            return ChatGoogleGenerativeAI(model=GEMINI_CHAT_MODEL, temperature=temperature, **kwargs)
        except ImportError:
            pass
    raise HTTPException(
        status_code=500,
        detail="No LLM API key found. Set GROQ_API_KEY (free), OPENAI_API_KEY, or GEMINI_API_KEY "
               "in backend/.env (or in Render Environment settings).",
    )


def get_embeddings():
    """Returns embeddings for the best available provider — prefers OpenAI.

    Raises if only Groq is configured (Groq hosts no embedding models);
    chat.py catches this and uses BM25 keyword retrieval instead.
    """
    if os.environ.get("OPENAI_API_KEY"):
        try:
            from langchain_openai import OpenAIEmbeddings
            return OpenAIEmbeddings(model=OPENAI_EMBED_MODEL)
        except ImportError:
            pass  # fall through to Gemini
    if os.environ.get("GEMINI_API_KEY"):
        try:
            from langchain_google_genai import GoogleGenerativeAIEmbeddings
            return GoogleGenerativeAIEmbeddings(model=GEMINI_EMBED_MODEL)
        except ImportError:
            pass
    raise HTTPException(
        status_code=500,
        detail=(
            "No embedding provider available. Groq (the active LLM provider) does not host "
            "embedding models. Add OPENAI_API_KEY or GEMINI_API_KEY for vector search, or keep "
            "Groq-only and the app will automatically use BM25 keyword retrieval."
        ),
    )
