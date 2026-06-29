import os
import time
import shutil
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)
from fastapi import APIRouter, UploadFile, File, HTTPException
from langchain_core.prompts import ChatPromptTemplate
from schema import FinancialAnalysisResult

# Set up local backend directory for temporary files
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BACKEND_DIR, "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

router = APIRouter()

def get_llm():
    """Returns the best available LLM — prefers OpenAI, falls back to Gemini."""
    if os.environ.get("OPENAI_API_KEY"):
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model="gpt-4o-mini", temperature=0)
    elif os.environ.get("GEMINI_API_KEY"):
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model="gemini-2.0-flash-lite", temperature=0)
    else:
        raise HTTPException(
            status_code=500,
            detail="No API key found. Set OPENAI_API_KEY or GEMINI_API_KEY in backend/.env"
        )

ANALYZE_PROMPT = ChatPromptTemplate.from_messages([
    ("system", (
        "You are an expert financial analyst. Analyze the text content of the provided financial document. "
        "Extract key metrics, calculate a credit risk score (0-100, where 100 is best/lowest risk), "
        "and provide at least 4 detailed qualitative risk insights.\n\n"
        "Generate a structured credit profile mapping exactly to the schema requirements."
    )),
    ("user", "Document Type: {doc_type}\n\nDocument Text Content:\n{text}")
])

@router.post("/analyze")
async def analyze_document(file: UploadFile = File(...), docType: str = "bank_statement"):
    start_time = time.time()
    
    # 1. Save uploaded file to the local workspace temp directory
    temp_file_path = os.path.join(TEMP_DIR, file.filename)
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save temporary file: {str(e)}")

    full_text = ""
    
    # 2. Extract text depending on file type
    try:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext == ".pdf":
            try:
                from langchain_community.document_loaders import PyPDFLoader
            except ImportError:
                from langchain.document_loaders import PyPDFLoader
            loader = PyPDFLoader(temp_file_path)
            docs = loader.load()
            full_text = "\n".join([doc.page_content for doc in docs])
        else:
            # Fallback for txt, csv, or other text documents
            try:
                with open(temp_file_path, "r", encoding="utf-8") as f:
                    full_text = f.read()
            except UnicodeDecodeError:
                # If UTF-8 fails, try latin-1
                with open(temp_file_path, "r", encoding="latin-1") as f:
                    full_text = f.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing document: {str(e)}")
    finally:
        # Clean up temp file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            
    if not full_text.strip():
        raise HTTPException(
            status_code=400,
            detail="The document appeared to have no extractable text. Please ensure it is not a scanned image without OCR."
        )

    # 3. Get LLM and invoke extraction chain
    try:
        llm = get_llm()
        structured_llm = llm.with_structured_output(FinancialAnalysisResult)
        chain = ANALYZE_PROMPT | structured_llm
        
        # Human-readable document type
        doc_type_label = docType.replace("_", " ").title()
        
        result: FinancialAnalysisResult = chain.invoke({
            "doc_type": doc_type_label,
            "text": full_text
        })
        
        # Force correct types and add execution duration
        result.processingTime = round(time.time() - start_time, 2)
        
        # 4. Index text for Conversational RAG in the chat router
        from chat import index_document_text
        index_document_text(full_text)
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LangChain processing failed: {str(e)}")
