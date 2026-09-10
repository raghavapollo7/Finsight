import os
import time
import shutil
import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning)

from fastapi import APIRouter, UploadFile, File, HTTPException
from langchain_core.messages import HumanMessage

from schema import FinancialAnalysisResult, FinancialAnalysisResultLLM, llm_result_to_frontend
from llm import get_llm, provider_name

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BACKEND_DIR, "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

router = APIRouter()

MAX_TEXT_CHARS = 120_000  # keep LLM input bounded (≈30k tokens)


# ── Document-type specific extraction prompts ────────────────────────────────
# BUG FIX: previously ONE bank-statement prompt was used for every doc type, so
# invoices, GST returns and balance sheets were all force-fitted into the same
# output shape ("extraction gives the same output for any document").
BASE_PROMPT = (
    "You are an expert financial analyst. You are given the text content of ONE "
    "{doc_type} document. Extract the metrics that are ACTUALLY present in this "
    "specific document — do not invent or template generic fields that don't apply.\n\n"
    "Then:\n"
    "1. Compute a credit risk score 0-100 (100 = best / lowest risk) appropriate for this document type.\n"
    "2. Provide at least 4 detailed qualitative insights grounded in the document's real numbers.\n"
    "3. Set 'company' to the applicant/business name found in the document (unknown only if truly absent).\n"
    "4. Set 'period' to the period the document covers.\n"
    "5. 'extracted' must contain ONLY fields relevant to this document type (8-12 entries).\n\n"
    "If the text is corrupted, empty, or not a {doc_type}, set recommendation to 'REVIEW', use a "
    "neutral risk score, and say in the insights that text extraction failed."
)

DOC_TYPE_PROMPTS = {
    "bank_statement": (
        "This is a BANK STATEMENT. Prioritize: opening/closing balances, monthly credits and debits, "
        "net cash flow, cheque/ECS bounce incidents, observed EMI or NACH debits, largest single transactions, "
        "cash deposit/withdrawal share, overdraft usage, and the bank + account type."
    ),
    "invoice": (
        "This is an INVOICE (or a set of invoices). Prioritize: invoice number(s), invoice date(s), "
        "seller and buyer (with GSTIN if present), taxable value, GST amounts (CGST/SGST/IGST split), "
        "total invoice value, payment terms/due date, HSN/SAC codes, and line-item summary (top items)."
    ),
    "gst_return": (
        "This is a GST RETURN (GSTR-1 / GSTR-2A / GSTR-3B / GSTR-9 style filing). Prioritize: GSTIN and "
        "legal/trade name, filing period, outward taxable supplies, inward taxable supplies, ITC claimed, "
        "tax payable (CGST/SGST/IGST), tax actually paid, late fees, and filing status/dates."
    ),
    "balance_sheet": (
        "This is a BALANCE SHEET / financial statement. Prioritize: total assets, current assets, total "
        "liabilities, current liabilities, net worth/equity, cash & equivalents, debt levels, retained "
        "earnings, key ratios you can compute (current ratio, debt-to-equity), and the reporting period."
    ),
}


def build_analyze_prompt(doc_type: str):
    from langchain_core.prompts import ChatPromptTemplate

    focus = DOC_TYPE_PROMPTS.get(doc_type, DOC_TYPE_PROMPTS["bank_statement"])
    return ChatPromptTemplate.from_messages([
        ("system", BASE_PROMPT + "\n\n" + focus),
        ("user", "Document Type: {doc_type}\n\nDocument Text Content:\n{text}"),
    ])


# ── Text extraction ──────────────────────────────────────────────────────────
def extract_text(path: str, ext: str) -> str:
    """
    Multi-strategy text extraction.

    BUG FIX: the old code read images as raw latin-1 bytes (producing the same
    garbage output for every image) and never OCR'd scanned PDFs.
    """
    if ext == ".pdf":
        return _extract_pdf_text(path)
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"):
        return _ocr_image(path)
    if ext == ".docx":
        return _extract_docx_text(path)
    # Plain text-ish formats
    for encoding in ("utf-8", "latin-1"):
        try:
            with open(path, "r", encoding=encoding) as f:
                return f.read()
        except UnicodeDecodeError:
            continue
    return ""


def _extract_pdf_text(path: str) -> str:
    """Try several PDF text layers before falling back to OCR (scanned PDFs)."""
    text = ""

    # 1. PyPDF (already a dependency)
    try:
        from langchain_community.document_loaders import PyPDFLoader
        docs = PyPDFLoader(path).load()
        text = "\n".join(d.page_content for d in docs)
    except Exception as e:
        print(f"[analyzer] PyPDF failed: {e}")

    # 2. pdfplumber (better with tables/statements)
    if len(text.strip()) < 50:
        try:
            import pdfplumber
            with pdfplumber.open(path) as pdf:
                text = "\n".join(p.extract_text() or "" for p in pdf.pages)
        except Exception as e:
            print(f"[analyzer] pdfplumber failed: {e}")

    # 3. PyMuPDF (fastest, handles tricky layouts)
    if len(text.strip()) < 50:
        try:
            import fitz  # pymupdf
            with fitz.open(path) as pdf:
                text = "\n".join(page.get_text() for page in pdf)
        except Exception as e:
            print(f"[analyzer] pymupdf failed: {e}")

    # 4. OCR fallback — scanned PDF (rasterize pages, then OCR)
    if len(text.strip()) < 50:
        try:
            import fitz
            with fitz.open(path) as pdf:
                images = []
                for page in pdf:
                    pix = page.get_pixmap(dpi=200)
                    img_path = os.path.join(TEMP_DIR, f"page_{page.number}.png")
                    pix.save(img_path)
                    images.append(img_path)
                text = "\n".join(_ocr_image(img) for img in images)
                for img in images:
                    try:
                        os.remove(img)
                    except OSError:
                        pass
        except Exception as e:
            print(f"[analyzer] scanned-PDF OCR failed: {e}")

    return text


def _extract_docx_text(path: str) -> str:
    try:
        import docx2txt
        return docx2txt.process(path) or ""
    except Exception:
        return ""


def _ocr_image(path: str) -> str:
    """
    OCR a raster image via pytesseract. Accepts EXTRACTION_MODE=llm_vision to
    send the image to a multimodal LLM instead (better for photos/screenshots).

    BUG FIX: old code opened images as latin-1 TEXT, producing identical
    mojibake 'extraction' for every image file.
    """
    if os.environ.get("EXTRACTION_MODE", "").lower() == "llm_vision" and provider_name() == "gemini":
        return _ocr_image_vision(path)

    try:
        import pytesseract
        from PIL import Image
        return pytesseract.image_to_string(Image.open(path)) or ""
    except Exception as e:
        print(f"[analyzer] tesseract OCR failed: {e}")

    if provider_name() == "gemini":
        return _ocr_image_vision(path)
    return ""


def _ocr_image_vision(path: str) -> str:
    """Gemini multimodal OCR — reads the image directly, no tesseract needed."""
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI

        with open(path, "rb") as f:
            image_bytes = f.read()
        ext = os.path.splitext(path)[1].lstrip(".").lower()
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(ext, f"image/{ext or 'png'}")

        llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
        msg = HumanMessage(content=[
            {"type": "text", "text": "Extract ALL text content from this document image exactly as it appears, preserving numbers, dates, names, and table structure."},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{__import__('base64').b64encode(image_bytes).decode()}"}},
        ])
        resp = llm.invoke([msg])
        return resp.content or ""
    except Exception as e:
        print(f"[analyzer] vision OCR failed: {e}")
        return ""


@router.post("/analyze")
async def analyze_document(file: UploadFile = File(...), docType: str = "bank_statement"):
    start_time = time.time()

    # Clear any previous chat context BEFORE extraction so a failed analysis
    # never leaves the chat answering questions about the previous document.
    from chat import clear_document_index, index_document_text
    clear_document_index()

    # 1. Save upload to temp dir (unique name — avoids concurrent-upload collisions)
    temp_file_path = os.path.join(TEMP_DIR, f"{int(time.time() * 1000)}_{os.path.basename(file.filename)}")
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save temporary file: {e}")

    full_text = ""
    try:
        ext = os.path.splitext(file.filename)[1].lower()
        try:
            full_text = extract_text(temp_file_path, ext)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error parsing document: {e}")
    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except OSError:
                pass

    if not full_text or not full_text.strip():
        raise HTTPException(
            status_code=400,
            detail="No extractable text found. For scanned PDFs/images, install Tesseract OCR "
                   "(https://github.com/UB-Mannheim/tesseract/wiki) or set EXTRACTION_MODE=llm_vision "
                   "with a GEMINI_API_KEY to use AI vision extraction.",
        )

    if len(full_text) > MAX_TEXT_CHARS:
        print(f"[analyzer] truncating {len(full_text)} → {MAX_TEXT_CHARS} chars")
        full_text = full_text[:MAX_TEXT_CHARS]

    # 3. LLM extraction with doc-type-specific prompt
    try:
        # Generous output budget: reasoning models spend tokens thinking before
        # emitting the JSON — if the budget runs out mid-JSON, strict-mode
        # validation rejects the whole response ("missing properties").
        llm = get_llm(temperature=0, max_tokens=8192)
        # Strict-mode-safe schema: metrics as a LIST (Groq/OpenAI strict mode
        # requires additionalProperties:false on every object — impossible with
        # a free-form dict). Converted to the dict shape after the call.
        structured_llm = llm.with_structured_output(FinancialAnalysisResultLLM)
        chain = build_analyze_prompt(docType) | structured_llm

        result_llm: FinancialAnalysisResultLLM = chain.invoke({
            "doc_type": docType.replace("_", " ").title(),
            "text": full_text,
        })

        result = llm_result_to_frontend(result_llm)
        result.processingTime = round(time.time() - start_time, 2)

        # 4. Index text for conversational RAG
        index_document_text(full_text)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LangChain processing failed: {e}")
