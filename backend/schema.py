from pydantic import BaseModel, Field
from typing import List, Dict

class ExtractedMetric(BaseModel):
    val: str = Field(description="The extracted value of this metric (e.g., '₹18.6L', '2', 'HDFC Bank', 'Net 30')")
    cls: str = Field(default="", description="CSS class style: 'positive' for favorable figures, 'negative' for risks, or empty string '' for neutral")

class RiskFactor(BaseModel):
    label: str = Field(description="The name of the risk factor analyzed (e.g. 'Cash Flow Consistency', 'Bounce Rate')")
    val: int = Field(description="Score/percentage of this factor from 0 to 100")
    color: str = Field(description="Hex color code matching the status: '#059669' (green/good), '#d97706' (yellow/warning), '#dc2626' (red/danger)")

class CreditInsight(BaseModel):
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
