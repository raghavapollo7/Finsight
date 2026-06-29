from pydantic import BaseModel, Field
from typing import List, Dict, Optional

class ExtractedMetric(BaseModel):
    val: str = Field(description="The extracted value of this metric (e.g., '₹18.6L', '2', 'HDFC Bank')")
    cls: str = Field(default="", description="CSS class style: 'positive' for favorable figures, 'negative' for risks, or empty string '' for neutral")

class RiskFactor(BaseModel):
    label: str = Field(description="The name of the risk factor analyzed (e.g. 'Cash Flow Consistency', 'Bounce Rate')")
    val: int = Field(description="Score/percentage of this factor from 0 to 100")
    color: str = Field(description="Hex color code or CSS color matching the status: '#059669' (green/good), '#d97706' (yellow/warning), '#dc2626' (red/danger)")

class CreditInsight(BaseModel):
    type: str = Field(description="Type of insight: 'positive', 'warning', 'info'")
    icon: str = Field(description="A matching emoji: '✅', '📈', '⚠️', '💡'")
    text: str = Field(description="A concise summary of the key insight or observation")

class FinancialAnalysisResult(BaseModel):
    company: str = Field(description="Name of the applicant company or individual")
    period: str = Field(description="Statement period covered (e.g., 'Oct 2024 – Mar 2025')")
    extracted: Dict[str, ExtractedMetric] = Field(
        description="Key extracted financial metrics. Must include: 'Avg Monthly Credit', 'Avg Monthly Debit', 'Net Cash Flow', 'Closing Balance', 'Bounce Incidents', 'EMI Observed', 'Bank', and 'Account Type'."
    )
    riskScore: int = Field(description="Overall creditworthiness score (0 to 100, where higher is lower risk)")
    riskLabel: str = Field(description="Risk label: 'Low', 'Medium-Low', 'Medium', 'High'")
    riskColor: str = Field(description="Risk color corresponding to label (e.g. '#22c55e' for Low, '#d97706' for Medium, '#dc2626' for High)")
    factors: List[RiskFactor] = Field(description="A breakdown of at least 4 critical risk factors")
    insights: List[CreditInsight] = Field(description="At least 4 deep qualitative analysis observations")
    recommendation: str = Field(description="Eligibility status: 'ELIGIBLE', 'REVIEW', or 'DECLINE'")
    processingTime: float = Field(default=0.0, description="Processing time in seconds")
