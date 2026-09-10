import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning)

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from langchain_core.messages import AIMessage, HumanMessage
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel

try:
    from langchain_chroma import Chroma
except ImportError:
    from langchain_community.vectorstores import Chroma

from llm import GEMINI_EMBED_MODEL, OPENAI_EMBED_MODEL, embeddings_available, get_embeddings, get_llm, provider_name

router = APIRouter()

# In-memory vector DB + raw text of the last analyzed document.
# NOTE: this is per-process memory — a Render free-tier restart clears it,
# which is exactly why /chat must degrade gracefully (see no_document_reply).
vector_store = None
document_text = ""


class ChatRequest(BaseModel):
    query: str
    history: Optional[List[List[str]]] = None


def index_document_text(text: str) -> bool:
    """
    Called by analyzer.py after extraction: chunk the document and build a
    retriever — vector search (Chroma) when embeddings are available, otherwise
    BM25 keyword search (Groq-only setups, where no embedding API exists).
    Returns True on success. On failure it keeps the raw text so the chat can
    still answer from context inline instead of dying entirely.
    """
    global vector_store, document_text
    document_text = text or ""

    try:
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        splits = text_splitter.split_text(text)
        if not splits:
            vector_store = None
            return False

        if embeddings_available():
            try:
                embeddings = get_embeddings()
                # Rebuild from scratch so an old document never leaks into the next chat.
                vector_store = Chroma.from_texts(texts=splits, embedding=embeddings)
                return True
            except Exception as e:
                print(f"[chat] vector index failed, falling back to BM25: {e}")

        # Groq-only (or embeddings failed) → BM25 keyword retriever.
        from bm25_retriever import build_bm25_retriever
        vector_store = build_bm25_retriever(splits)
        print("[chat] using BM25 keyword retriever (no embedding provider)")
        return True
    except Exception as e:
        print(f"[chat] index failed (raw-text fallback stays active): {e}")
        vector_store = None
        return False


def clear_document_index() -> None:
    """Forget the current document (used when a new analysis starts)."""
    global vector_store, document_text
    vector_store = None
    document_text = ""


def _retrieve_context(query: str, k: int = 4) -> str:
    retriever = vector_store.as_retriever(search_kwargs={"k": k})
    docs = retriever.invoke(query)
    return "\n\n".join(d.page_content for d in docs)


def _chat_history_messages(history: Optional[List[List[str]]]) -> list:
    msgs = []
    if history:
        for speaker, content in history[-10:]:
            if not content:
                continue
            if speaker.lower() in ("human", "user"):
                msgs.append(HumanMessage(content=content))
            else:
                msgs.append(AIMessage(content=content))
    return msgs


GENERAL_SYSTEM_PROMPT = (
    "You are FinSight AI, an assistant for financial document analysis, SME lending, "
    "and NBFC credit assessment. Answer the user's question helpfully and professionally. "
    "If a financial document has been analyzed in this session, its details may be discussed "
    "if the user asks about 'the document' — but no document content is available to you right now, "
    "so never invent specific figures, companies, or statement values."
)

RAG_SYSTEM_PROMPT = (
    "You are FinSight AI, a financial document assistant. Use ONLY the retrieved sections of "
    "the analyzed financial document below to answer questions about the document — be precise "
    "and cite specific details (bank names, dates, amounts) from it.\n\n"
    "If the answer is not in the document, say so explicitly, then answer the general finance "
    "part of the question from your own knowledge, clearly separating what came from the document "
    "and what is general guidance.\n\n"
    "Analyzed Document Context:\n{context}"
)

_NO_DOC_REPLY = (
    "I don't have access to an analyzed document right now. Please upload a document in the "
    "Analyzer tab — once analyzed, I can answer detailed questions about its contents."
)


@router.post("/chat")
async def chat_with_document(payload: ChatRequest):
    global vector_store

    if not (payload.query or "").strip():
        raise HTTPException(status_code=400, detail="Query must not be empty.")

    # ── Path 1: document indexed → real RAG answer ──────────────────────────
    if vector_store is not None:
        try:
            context = _retrieve_context(payload.query)
            llm = get_llm()
            prompt = [
                ("system", RAG_SYSTEM_PROMPT.format(context=context)),
                *_chat_history_messages(payload.history),
                ("human", payload.query),
            ]
            response = await llm.ainvoke(prompt)
            return {"response": response.content, "source": "document"}

        except HTTPException:
            raise
        except Exception as e:
            # Surface the real error (e.g. retired model name, bad API key)
            # instead of silently returning the same canned message forever.
            detail = str(e)
            print(f"[chat] RAG failed: {detail}")
            raise HTTPException(status_code=500, detail=f"Chat failed: {detail}")

    # ── Path 2: no document, but an API key exists → general LLM answer ────
    # Old behavior: always return the same canned sentence — this is the exact
    # "one response for every question" bug. Now we actually answer.
    if provider_name() is not None:
        try:
            llm = get_llm()
            prompt = [
                ("system", GENERAL_SYSTEM_PROMPT),
                *_chat_history_messages(payload.history),
                ("human", payload.query),
            ]
            response = await llm.ainvoke(prompt)
            return {
                "response": response.content,
                "source": "general",
                "note": "No document is currently indexed — this is a general-knowledge answer. Upload and analyze a document for document-specific answers.",
            }

        except HTTPException:
            raise
        except Exception as e:
            detail = str(e)
            print(f"[chat] general LLM failed: {detail}")
            raise HTTPException(status_code=500, detail=f"Chat failed: {detail}")

    # ── Path 3: no document AND no API key ──────────────────────────────────
    raise HTTPException(
        status_code=503,
        detail="LLM backend is not configured: no OPENAI_API_KEY or GEMINI_API_KEY is set on the server. "
               "Add a key (locally in backend/.env, or on Render under Environment) and restart.",
    )


@router.get("/chat/status")
async def chat_status():
    """Lets the frontend show an accurate banner instead of guessing."""
    return {
        "documentIndexed": vector_store is not None,
        "documentChars": len(document_text),
        "llmConfigured": provider_name() is not None,
        "embeddingModel": (
            OPENAI_EMBED_MODEL if provider_name() == "openai"
            else GEMINI_EMBED_MODEL if provider_name() == "gemini"
            else "bm25-keyword" if not embeddings_available()
            else None
        ),
    }

