from pydantic import BaseModel, ConfigDict, Field
from typing import List, Dict

# ── Frontend-facing model (what /analyze returns) ────────────────────────────
class ExtractedMetric(BaseModel):
    val: str = Field(description="The extracted value of this metric (e.g., '₹18.6L', '2', 'HDFC Bank', 'Net 30')")
    cls: str = Field(default="", description="CSS class style: 'positive' for favorable figures, 'negative' for risks, or empty string '' for neutral")

class RiskFactor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(description="The name of the risk factor analyzed (e.g. 'Cash Flow Consistency', 'Bounce Rate')")
    val: int = Field(description="Score/percentage of this factor from 0 to 100")
    color: str = Field(description="Hex color code matching the status: '#059669' (green/good), '#d97706' (yellow/warning), '#dc2626' (red/danger)")

class CreditInsight(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str = Field(description="Type of insight: 'positive', 'warning', 'info'")
    icon: str = Field(description="A matching emoji: '✅', '📈', '⚠️', '💡'")
    text: str = Field(description="A concise summary of the key insight or observation")

class FinancialAnalysisResult(BaseModel):
    company: str = Field(description="Name of the applicant company, individual, or entity found in the document")
    period: str = Field(description="Period the document covers (e.g., 'Oct 2024 – Mar 2025', 'Q4 2024', 'FY 2024-25')")
    extracted: Dict[str, ExtractedMetric] = Field(
        description=(
            "Key extracted financial metrics — ONLY fields actually present in and relevant to the document. "
            "For a bank statement: balances, monthly credits/debits, bounces, EMI, bank name, account type. "
            "For an invoice: invoice number, dates, buyer/seller, taxable value, GST amounts, total, payment terms. "
            "For a GST return: GSTIN, filing period, outward/inward supplies, ITC, tax payable and paid. "
            "For a balance sheet: assets, liabilities, equity, cash, debt, computed ratios."
        )
    )
    riskScore: int = Field(description="Overall creditworthiness score (0 to 100, where higher is lower risk)")
    riskLabel: str = Field(description="Risk label: 'Low', 'Medium-Low', 'Medium', 'High'")
    riskColor: str = Field(description="Risk color corresponding to label (e.g. '#22c55e' for Low, '#d97706' for Medium, '#dc2626' for High)")
    factors: List[RiskFactor] = Field(description="A breakdown of at least 4 critical risk factors relevant to this document type")
    insights: List[CreditInsight] = Field(description="At least 4 deep qualitative analysis observations grounded in the document's actual content")
    recommendation: str = Field(description="Eligibility status: 'ELIGIBLE', 'REVIEW', or 'DECLINE'")
    processingTime: float = Field(default=0.0, description="Processing time in seconds")


# ── LLM-facing models (strict JSON-schema compatible) ────────────────────────
# Groq's structured outputs (OpenAI strict mode) require additionalProperties:false
# on EVERY object — which a free-form Dict[str, ...] cannot satisfy. So the LLM
# returns metrics as a LIST of named items; analyzer.py converts it to the dict
# shape the frontend expects.
class ExtractedMetricItem(BaseModel):
    # extra="forbid" → emits additionalProperties:false in the JSON schema,
    # required by Groq/OpenAI strict structured outputs.
    model_config = ConfigDict(extra="forbid")

    key: str = Field(description="Metric name, e.g. 'Avg Monthly Credit' or 'GST Amount'")
    val: str = Field(description="The extracted value of this metric (e.g., '₹18.6L', '2', 'HDFC Bank', 'Net 30')")
    cls: str = Field(default="", description="CSS class style: 'positive' for favorable figures, 'negative' for risks, or empty string '' for neutral")

class FinancialAnalysisResultLLM(BaseModel):
    """Strict-mode-safe variant of FinancialAnalysisResult (no free-form dict)."""
    model_config = ConfigDict(extra="forbid")

    company: str = Field(description="Name of the applicant company, individual, or entity found in the document")
    period: str = Field(description="Period the document covers (e.g., 'Oct 2024 – Mar 2025', 'Q4 2024', 'FY 2024-25')")
    extracted: List[ExtractedMetricItem] = Field(
        description=(
            "8-12 extracted financial metrics as named items — ONLY fields actually present in and "
            "relevant to the document. For a bank statement: balances, monthly credits/debits, bounces, "
            "EMI, bank name, account type. For an invoice: invoice number, dates, buyer/seller, taxable "
            "value, GST amounts, total, payment terms. For a GST return: GSTIN, filing period, "
            "outward/inward supplies, ITC, tax payable and paid. For a balance sheet: assets, "
            "liabilities, equity, cash, debt, computed ratios."
        )
    )
    riskScore: int = Field(description="Overall creditworthiness score (0 to 100, where higher is lower risk)")
    riskLabel: str = Field(description="Risk label: 'Low', 'Medium-Low', 'Medium', 'High'")
    riskColor: str = Field(description="Risk color corresponding to label (e.g. '#22c55e' for Low, '#d97706' for Medium, '#dc2626' for High)")
    factors: List[RiskFactor] = Field(description="A breakdown of at least 4 critical risk factors relevant to this document type")
    insights: List[CreditInsight] = Field(description="At least 4 deep qualitative analysis observations grounded in the document's actual content")
    recommendation: str = Field(description="Eligibility status: 'ELIGIBLE', 'REVIEW', or 'DECLINE'")
    # NOTE: no processingTime here — it is computed server-side after the LLM
    # call. Asking the LLM to generate it wasted output tokens and could get
    # truncated mid-JSON (Groq strict mode rejects truncated JSON outright).


def llm_result_to_frontend(r: FinancialAnalysisResultLLM) -> FinancialAnalysisResult:
    """Convert the LLM's list-of-metrics output into the dict shape the frontend renders."""
    extracted: Dict[str, ExtractedMetric] = {}
    for item in r.extracted:
        key = (item.key or "").strip()
        if key:
            extracted[key] = ExtractedMetric(val=item.val, cls=item.cls)
    return FinancialAnalysisResult(
        company=r.company,
        period=r.period,
        extracted=extracted,
        riskScore=r.riskScore,
        riskLabel=r.riskLabel,
        riskColor=r.riskColor,
        factors=r.factors,
        insights=r.insights,
        recommendation=r.recommendation,
        processingTime=0.0,  # set by analyzer.py after the call
    )
