import os
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, AIMessage

try:
    from langchain_chroma import Chroma
except ImportError:
    from langchain_community.vectorstores import Chroma

router = APIRouter()

# Global variable to store active in-memory Vector DB
vector_store = None

class ChatRequest(BaseModel):
    query: str
    history: Optional[List[List[str]]] = None

def get_embeddings():
    """Returns embeddings — prefers OpenAI, falls back to Gemini."""
    if os.environ.get("OPENAI_API_KEY"):
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(model="text-embedding-3-small")
    elif os.environ.get("GEMINI_API_KEY"):
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        return GoogleGenerativeAIEmbeddings(model="models/text-embedding-004")
    else:
        raise HTTPException(
            status_code=500,
            detail="No API key found. Set OPENAI_API_KEY or GEMINI_API_KEY in backend/.env"
        )

def get_llm():
    """Returns the best available LLM — prefers OpenAI, falls back to Gemini."""
    if os.environ.get("OPENAI_API_KEY"):
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model="gpt-4o-mini")
    elif os.environ.get("GEMINI_API_KEY"):
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model="gemini-2.0-flash-lite")
    else:
        raise HTTPException(
            status_code=500,
            detail="No API key found. Set OPENAI_API_KEY or GEMINI_API_KEY in backend/.env"
        )

def index_document_text(text: str):
    """
    Called by analyzer.py to split document text and index it into Chroma.
    """
    global vector_store
    try:
        # Split text into manageable chunks for vector embeddings
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        splits = text_splitter.split_text(text)
        
        # Initialize embeddings and Chroma
        embeddings = get_embeddings()
        
        # Reset previous database and build a clean in-memory vector db
        vector_store = Chroma.from_texts(
            texts=splits,
            embedding=embeddings
        )
    except Exception as e:
        print(f"Error during vector DB indexing: {e}")
        # Don't raise so analysis endpoint still returns data even if vector db indexing fails
        vector_store = None

@router.post("/chat")
async def chat_with_document(payload: ChatRequest):
    global vector_store
    if not vector_store:
        return {
            "response": "I don't have access to an analyzed document right now. Please upload a document in the Analyzer tab, and I'll analyze it so we can chat about its details!"
        }
        
    try:
        # 1. Retrieve the context
        retriever = vector_store.as_retriever(search_kwargs={"k": 4})
        retrieved_docs = retriever.invoke(payload.query)
        context = "\n\n".join([doc.page_content for doc in retrieved_docs])
        
        # 2. Formulate Chat History messages
        chat_history = []
        if payload.history:
            for speaker, content in payload.history:
                if speaker.lower() in ("human", "user"):
                    chat_history.append(HumanMessage(content=content))
                else:
                    chat_history.append(AIMessage(content=content))
                    
        # 3. Create prompt templates
        system_prompt = (
            "You are FinSight AI, a financial document assistant. Use the following retrieved sections of "
            "the analyzed financial document to answer the user's question. Be precise, professional, and "
            "cite specific details (like bank names, dates, and amounts) when answering.\n\n"
            "If you cannot find the answer in the document, explain that the information is not in the statement, "
            "but try to answer generic financial terms using your default knowledge.\n\n"
            f"Analyzed Document Context:\n{context}"
        )
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            *chat_history,
            ("human", "{input}"),
        ])
        
        # 4. Invoke LLM
        llm = get_llm()
        chain = prompt | llm
        
        response = chain.invoke({"input": payload.query})
        
        return {"response": response.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversational retrieval failed: {str(e)}")
