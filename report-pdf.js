// ═══════════════════════════════════════════════════════════════════════════════
// report-pdf.js — FinSight AI Credit Risk Score Report PDF Export Engine
// NEW FILE — adds PDF preview modal, download button, toast, and PDF generation
//
// Dependencies (CDN scripts added to index.html head):
//   jsPDF  v2.5.1      →  window.jspdf.jsPDF
//   html2canvas v1.4.1 →  window.html2canvas
//
// Public entry points (called from index.html):
//   openReportModal()  — validates state, builds template, opens preview modal
//   closeReportModal() — closes the modal with slide-down animation
//   downloadReport()   — html2canvas → jsPDF → saves file to disk
//   pulseDwnldBtn()    — called from showResults() hook to pulse the button
//   showToast(msg,t)   — standalone top-right toast notification
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ─── 1. Report ID Generator ──────────────────────────────────────────────────
// Produces unique IDs like: FSA-2026-X7K2
function generateReportId() {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `FSA-${year}-${rand}`;
}

// ─── 2. IST Timestamp ────────────────────────────────────────────────────────
function getISTTimestamp() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' IST';
}

// CHANGED: Centralized PDF data shaping so the report pulls from dashboard state once.
function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// CHANGED: Color-code the report gauge by creditworthiness, independent of source labels.
function getCreditScoreColor(score) {
  if (score >= 70) return '#16A34A';
  if (score >= 45) return '#D97706';
  return '#DC2626';
}

function findExtractedValue(data, labels, fallback = 'Pending') {
  const extracted = data.extracted || {};
  for (const label of labels) {
    if (extracted[label]) return extracted[label].val;
  }
  const fuzzy = Object.entries(extracted).find(([key]) =>
    labels.some(label => key.toLowerCase().includes(label.toLowerCase()))
  );
  return fuzzy ? fuzzy[1].val : fallback;
}

function findFactorScore(data, labels, fallback = null) {
  const factor = (data.factors || []).find(item =>
    labels.some(label => item.label.toLowerCase().includes(label.toLowerCase()))
  );
  return factor ? factor.val : fallback;
}

function parseLakhs(value) {
  if (!value) return null;
  const raw = String(value).replace(/,/g, '');
  const match = raw.match(/([\d.]+)/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  if (/cr|crore/i.test(raw)) return amount * 100;
  if (/l|lakh/i.test(raw)) return amount;
  if (/k/i.test(raw)) return amount / 100;
  return amount / 100000;
}

function formatRatio(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : 'Pending';
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : 'Pending';
}

function getApprovalRecommendation(data) {
  const raw = String(data.recommendation || '').toUpperCase();
  if (raw === 'ELIGIBLE' || raw === 'APPROVED') return 'APPROVED';
  if (raw === 'DECLINE' || raw === 'REJECTED') return 'REJECTED';
  if (data.riskScore >= 70) return 'APPROVED';
  if (data.riskScore >= 45) return 'REVIEW';
  return 'REJECTED';
}

// CHANGED: Normalizes required credit KPIs from current dashboard data, with derived values.
function deriveCreditReportKPIs(data) {
  const monthlyIncome = findExtractedValue(data, ['Monthly Income', 'Avg Monthly Credit', 'Total Invoice Value']);
  const monthlyExpenses = findExtractedValue(data, ['Monthly Expenses', 'Avg Monthly Debit', 'Overdue Amount']);
  const emiObligations = findExtractedValue(data, ['EMI Obligations', 'EMI Observed']);
  const netCashFlow = findExtractedValue(data, ['Net Cash Flow']);
  const incomeL = parseLakhs(monthlyIncome);
  const expenseL = parseLakhs(monthlyExpenses);
  const emiL = parseLakhs(emiObligations);
  const netL = parseLakhs(netCashFlow);
  const stability = findFactorScore(data, ['Cash Flow Consistency', 'Transaction Velocity'], 0);
  const approval = getApprovalRecommendation(data);

  return [
    { label: 'Monthly Income', value: monthlyIncome, cls: 'positive' },
    { label: 'Monthly Expenses', value: monthlyExpenses, cls: '' },
    { label: 'EMI Obligations', value: emiObligations, cls: '' },
    { label: 'Cash Flow Ratio', value: incomeL && expenseL ? formatRatio(incomeL / expenseL) : 'Pending', cls: incomeL && expenseL && incomeL >= expenseL ? 'positive' : '' },
    { label: 'Savings Rate', value: incomeL && netL !== null ? formatPercent((netL / incomeL) * 100) : 'Pending', cls: incomeL && netL > 0 ? 'positive' : 'negative' },
    { label: 'Transaction Stability Score', value: `${stability}/100`, cls: stability >= 70 ? 'positive' : stability >= 45 ? '' : 'negative' },
    { label: 'Debt-to-Income Ratio', value: incomeL && emiL !== null ? formatPercent((emiL / incomeL) * 100) : 'Pending', cls: incomeL && emiL / incomeL <= 0.5 ? 'positive' : 'negative' },
    { label: 'KYC Status', value: data.kycStatus || (findExtractedValue(data, ['Bank'], '') ? 'Verified' : 'Pending Verification'), cls: 'positive' },
    { label: 'SME Eligibility', value: approval === 'APPROVED' ? 'Eligible' : approval === 'REVIEW' ? 'Review Required' : 'Not Eligible', cls: approval === 'APPROVED' ? 'positive' : approval === 'REJECTED' ? 'negative' : '' },
    { label: 'Net Cash Flow', value: netCashFlow, cls: netL > 0 ? 'positive' : 'negative' },
  ];
}

// ─── 3. SVG Gauge (semicircle) ───────────────────────────────────────────────
// score 0-100, color = hex string
// Math: arc from left endpoint (π) sweeping clockwise by (score/100)*π radians
function buildGaugeSVG(score, color) {
  const cx = 100, cy = 105, r = 78;
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return `
    <svg viewBox="0 0 200 130" width="200" height="130" style="display:block;margin:0 auto">
      <path d="${arcPath}"
        stroke="#E5E7EB" stroke-width="13" fill="none" stroke-linecap="round"/>
      <!-- CHANGED: Use pathLength + dasharray so the score arc always follows the top semicircle. -->
      <path d="${arcPath}" pathLength="100"
        stroke="${color}" stroke-width="13" fill="none" stroke-linecap="round"
        stroke-dasharray="${safeScore} 100" stroke-dashoffset="0"/>
      <text x="${cx}" y="${cy - 12}" text-anchor="middle"
        font-family="Plus Jakarta Sans,Inter,sans-serif"
        font-size="40" font-weight="800" fill="${color}">${safeScore}</text>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle"
        font-family="Inter,sans-serif" font-size="12" fill="#6B7280">/ 100</text>
    </svg>`;
}

// ─── 4. PDF HTML Template Builder ────────────────────────────────────────────
// Populates #pdf-tpl with a fully-inlined A4 (794 × 1123px) credit report.
// ⚠️ SWAP POINT: Replace state.analysisResult with your real OCR pipeline data.
function buildPDFContent(reportId, timestamp) {
  const d = state.analysisResult;
  if (!d) return false;

  // Fraud data (may not exist if document type doesn't trigger fraud engine)
  const fraudScore = (typeof state.fraudScore !== 'undefined') ? state.fraudScore : null;
  const fraudFlags  = (typeof state.fraudFlags !== 'undefined' && Array.isArray(state.fraudFlags))
                      ? state.fraudFlags : [];

  // CHANGED: Use normalized KPI, score, and approval helpers for the PDF surface.
  const riskColor = getCreditScoreColor(Number(d.riskScore) || 0);
  const appRec    = getApprovalRecommendation(d);
  const kpis      = deriveCreditReportKPIs(d);
  const approveMap = {
    APPROVED: { label: 'APPROVED',        bg: '#16A34A', lbg: '#DCFCE7', border: '#86EFAC' },
    REVIEW:   { label: 'REVIEW REQUIRED', bg: '#D97706', lbg: '#FEF3C7', border: '#FCD34D' },
    REJECTED: { label: 'REJECTED',        bg: '#DC2626', lbg: '#FEE2E2', border: '#FCA5A5' },
  };
  const appr   = approveMap[appRec] || approveMap['REVIEW'];
  const fColor = fraudScore === null ? '#6B7280'
               : fraudScore <= 30   ? '#16A34A'
               : fraudScore <= 60   ? '#D97706' : '#DC2626';
  const fLabel = fraudScore === null ? 'Not Analyzed'
               : fraudScore <= 30   ? 'Low Risk'
               : fraudScore <= 60   ? 'Medium Risk' : 'High Risk';

  // ── AI Summary paragraph from insights ──
  const aiSummaryRaw = d.insights && d.insights.length
    ? d.insights.map(i => i.text).join(' ')
    : 'Financial analysis is complete. Please review the KPI summary and risk factor breakdown for a detailed assessment of the applicant\'s creditworthiness.';
  const aiSummary = aiSummaryRaw.length > 520 ? `${aiSummaryRaw.slice(0, 517)}...` : aiSummaryRaw;

  // CHANGED: KPI table now contains the required 9+ credit KPIs in a stable order.
  const kpiRows = kpis.map((item, i) => {
    const bg  = i % 2 === 0 ? '#F9FAFB' : '#FFFFFF';
    const vc  = item.cls === 'positive' ? '#16A34A' : item.cls === 'negative' ? '#DC2626' : '#111827';
    return `<tr style="background:${bg}">
      <td style="padding:6px 16px;font-size:12px;color:#374151;border-bottom:1px solid #F3F4F6">${escapeHTML(item.label)}</td>
      <td style="padding:6px 16px;font-size:12px;font-weight:700;color:${vc};text-align:right;border-bottom:1px solid #F3F4F6">${escapeHTML(item.value)}</td>
    </tr>`;
  }).join('');

  // ── Risk factor progress bars ──
  const factorBars = (d.factors || []).map(f => `
    <div style="margin-bottom:7px">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:11px;color:#374151">${escapeHTML(f.label)}</span>
        <span style="font-size:12px;font-weight:700;color:${f.color}">${f.val}/100</span>
      </div>
      <div style="height:5px;background:#E5E7EB;border-radius:10px;overflow:hidden">
        <div style="height:100%;width:${f.val}%;background:${f.color};border-radius:10px"></div>
      </div>
    </div>`).join('');

  // ── Fraud flags list ──
  const shownFraudFlags = fraudFlags.slice(0, 3);
  const extraFraudCount = Math.max(fraudFlags.length - shownFraudFlags.length, 0);
  const fraudFlagsList = fraudFlags.length
    ? shownFraudFlags.map(f => {
        const fc = f.severity === 'high' ? '#DC2626' : '#D97706';
        const fbg = f.severity === 'high' ? '#FEF2F2' : '#FFFBEB';
        return `<div style="display:flex;align-items:center;gap:8px;padding:5px 9px;background:${fbg};border-radius:7px;border-left:3px solid ${fc};margin-bottom:5px">
          <span style="font-size:12px">${escapeHTML(f.icon || '')}</span>
          <span style="font-size:11px;color:#374151;flex:1">${escapeHTML(f.name)}</span>
          <span style="font-size:10px;font-weight:700;color:${fc};padding:2px 8px;background:white;border:1px solid ${fc};border-radius:10px">${f.severity === 'high' ? 'HIGH' : 'MEDIUM'}</span>
        </div>`;
      }).join('') + (extraFraudCount ? `<p style="font-size:11px;color:#64748B;margin:4px 0 0">+${extraFraudCount} additional flag(s) summarized in dashboard.</p>` : '')
    : `<p style="font-size:12px;color:#16A34A;font-weight:600;margin:0">No fraud flags detected. Statement appears clean.</p>`;

  // ── Doc type label ──
  const docLabel = (state.selectedDocType || 'bank_statement')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  // ── Approval eligibility text ──
  const eligText = appRec === 'APPROVED' ? 'Eligible for Credit' :
                   appRec === 'REVIEW' ? 'Manual Review Required' : 'High Risk - Decline';

  const gaugeSVG = buildGaugeSVG(d.riskScore, riskColor);

  // ── Assemble full A4 HTML ──
  const html = `
  <div style="width:794px;height:1123px;background:#FFFFFF;overflow:hidden;
    font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    color:#111827;box-sizing:border-box;display:flex;flex-direction:column">

    <!-- ── HEADER ── -->
    <div style="background:#2563EB;padding:18px 42px;
      display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:40px;height:40px;background:rgba(255,255,255,0.2);
          border-radius:10px;display:flex;align-items:center;justify-content:center">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <div style="color:white;font-size:20px;font-weight:800;line-height:1.1;
            font-family:'Plus Jakarta Sans',Inter,sans-serif">FinSight AI</div>
          <div style="color:rgba(255,255,255,0.72);font-size:9.5px;font-weight:700;
            letter-spacing:0.12em;text-transform:uppercase">Enterprise Credit Analysis Report</div>
        </div>
      </div>
      <div style="text-align:right">
        <div style="color:white;font-size:13px;font-weight:700;
          font-family:'Courier New',Courier,monospace">${reportId}</div>
        <div style="color:rgba(255,255,255,0.7);font-size:11px;margin-top:3px">${timestamp}</div>
      </div>
    </div>

    <!-- ── BODY ── -->
    <div style="padding:20px 42px;display:flex;flex-direction:column;gap:10px;flex:1">

      <!-- Applicant Info -->
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px 18px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;
          color:#64748B;margin-bottom:8px;border-bottom:1px solid #E2E8F0;padding-bottom:6px">
          Applicant Details
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px 28px">
          <div>
            <div style="font-size:11px;color:#94A3B8;margin-bottom:2px">Applicant Name</div>
            <div style="font-size:16px;font-weight:800;color:#1E293B;
              font-family:'Plus Jakarta Sans',Inter,sans-serif">${escapeHTML(d.company || '-')}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#94A3B8;margin-bottom:2px">Analysis Period</div>
            <div style="font-size:15px;font-weight:700;color:#1E293B">${escapeHTML(d.period || '-')}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#94A3B8;margin-bottom:2px">Document Type</div>
            <div style="font-size:14px;font-weight:600;color:#374151">${escapeHTML(docLabel)}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#94A3B8;margin-bottom:2px">Date of Analysis</div>
            <div style="font-size:14px;font-weight:600;color:#374151">
              ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      <!-- Credit Score + Risk Factors (2-col) -->
      <div style="display:grid;grid-template-columns:210px 1fr;gap:12px">

        <!-- Gauge -->
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;
          padding:11px 12px;text-align:center">
          <div style="font-size:9.5px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;
            color:#64748B;margin-bottom:10px">Credit Risk Score</div>
          ${gaugeSVG}
          <div style="font-size:16px;font-weight:800;color:${riskColor};margin-top:4px;
            font-family:'Plus Jakarta Sans',Inter,sans-serif">${escapeHTML(d.riskLabel)}</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:4px">${eligText}</div>
        </div>

        <!-- Factors -->
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:13px 16px">
          <div style="font-size:9.5px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;
            color:#64748B;margin-bottom:14px">Risk Factor Breakdown</div>
          ${factorBars}
        </div>
      </div>

      <!-- KPI Table -->
      <div style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden">
        <div style="background:#2563EB;padding:9px 16px">
          <span style="font-size:9.5px;font-weight:700;letter-spacing:0.09em;
            text-transform:uppercase;color:white">KPI Summary — Extracted Metrics</span>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <colgroup><col style="width:55%"><col style="width:45%"></colgroup>
          <thead>
            <tr style="background:#F1F5F9">
              <th style="padding:7px 16px;text-align:left;font-size:10px;color:#64748B;
                font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Metric</th>
              <th style="padding:7px 16px;text-align:right;font-size:10px;color:#64748B;
                font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Value</th>
            </tr>
          </thead>
          <tbody>${kpiRows}</tbody>
        </table>
      </div>

      <!-- Fraud Risk Assessment -->
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:11px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:9.5px;font-weight:700;letter-spacing:0.09em;
            text-transform:uppercase;color:#64748B">🛡️ Fraud Risk Assessment</div>
          ${fraudScore !== null
            ? `<div style="display:flex;align-items:center;gap:9px">
                <span style="font-size:20px;font-weight:800;color:${fColor};
                  font-family:'Plus Jakarta Sans',Inter,sans-serif">${fraudScore}/100</span>
                <span style="font-size:11px;font-weight:700;color:${fColor};padding:3px 10px;
                  background:white;border:1px solid ${fColor};border-radius:20px">${fLabel}</span>
               </div>`
            : `<span style="font-size:12px;color:#94A3B8">Not analyzed</span>`}
        </div>
        ${fraudScore !== null
          ? `<div style="height:7px;background:#E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:12px">
               <div style="height:100%;width:${fraudScore}%;background:${fColor};border-radius:10px"></div>
             </div>`
          : ''}
        ${fraudFlagsList}
      </div>

      <!-- AI Risk Assessment -->
      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:12px 18px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;
          color:#2563EB;margin-bottom:9px">🤖 AI-Generated Risk Assessment</div>
        <p style="font-size:12px;line-height:1.55;color:#1E40AF;margin:0">${escapeHTML(aiSummary)}</p>
      </div>

      <!-- Approval Recommendation -->
      <div style="background:${appr.lbg};border:2px solid ${appr.border};
        border-radius:12px;padding:13px;text-align:center">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
          color:${appr.bg};margin-bottom:8px">Approval Recommendation</div>
        <div style="display:inline-block;background:${appr.bg};color:white;font-size:16px;
          font-weight:800;padding:9px 34px;border-radius:10px;letter-spacing:0.04em;
          font-family:'Plus Jakarta Sans',Inter,sans-serif">${appr.label}</div>
      </div>

    </div><!-- /body -->

    <!-- ── FOOTER ── -->
    <div style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:12px 42px;
      display:flex;align-items:center;justify-content:space-between;flex-shrink:0;margin-top:auto">
      <span style="font-size:11px;color:#94A3B8">
        Report ID: <strong style="color:#374151;font-family:'Courier New',monospace">${reportId}</strong>
      </span>
      <span style="font-size:11px;color:#94A3B8;font-weight:600">
        Powered by FinSight AI — Enterprise Credit Intelligence
      </span>
      <span style="font-size:11px;color:#94A3B8">Generated: ${timestamp}</span>
    </div>

  </div>`;

  const tpl = document.getElementById('pdf-tpl');
  if (tpl) tpl.innerHTML = html;
  return true;
}

// ─── 5. Open Preview Modal ────────────────────────────────────────────────────
let _reportId  = null;
let _reportTs  = null;

function setReportButtonLoading(isLoading) {
  const btn = document.getElementById('rpt-dl-btn');
  if (!btn) return;
  if (isLoading) {
    btn.dataset.originalHtml = btn.dataset.originalHtml || btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="rpt-spinner"></span>&nbsp; Preparing preview...';
  } else {
    btn.disabled = false;
    if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
  }
}

async function openReportModal() {
  if (!state || !state.analysisResult) {
    showToast('⚠️ Please run an analysis first.', 'error');
    return;
  }

  setReportButtonLoading(true);
  await new Promise(resolve => requestAnimationFrame(resolve));

  _reportId = generateReportId();
  _reportTs = getISTTimestamp();

  if (!buildPDFContent(_reportId, _reportTs)) {
    showToast('Could not build report — no data found.', 'error');
    setReportButtonLoading(false);
    return;
  }

  // Clone template into scaled preview pane
  const tplEl   = document.getElementById('pdf-tpl');
  const prevPane = document.getElementById('rpt-preview-frame');
  if (tplEl && prevPane) {
    const inner = tplEl.querySelector('div');
    if (inner) {
      const SCALE = 0.50;
      prevPane.innerHTML = '';
      const clone = inner.cloneNode(true);
      // Apply scale via transform
      clone.style.cssText += `;transform:scale(${SCALE});transform-origin:top left;
        position:absolute;top:0;left:0;`;
      prevPane.style.position = 'relative';
      prevPane.style.width  = Math.round(794 * SCALE) + 'px';
      prevPane.style.height = Math.round(1123 * SCALE) + 'px';
      prevPane.style.overflow = 'hidden';
      prevPane.appendChild(clone);
    }
  }

  const modal = document.getElementById('rpt-modal');
  if (modal) {
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('rpt-modal-open'));
  }
  setReportButtonLoading(false);
}

// ─── 6. Close Modal ──────────────────────────────────────────────────────────
function closeReportModal() {
  const modal = document.getElementById('rpt-modal');
  if (!modal) return;
  modal.classList.remove('rpt-modal-open');
  modal.classList.add('rpt-modal-closing');
  setTimeout(() => {
    modal.style.display = 'none';
    modal.classList.remove('rpt-modal-closing');
  }, 340);
}

// ─── 7. Download PDF ─────────────────────────────────────────────────────────
async function downloadReport() {
  // Guard: check libraries
  if (typeof html2canvas === 'undefined') {
    showToast('⚠️ html2canvas library is still loading. Please wait.', 'error');
    return;
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('⚠️ jsPDF library is still loading. Please wait.', 'error');
    return;
  }

  const dlBtn = document.getElementById('rpt-modal-dl-btn');
  if (dlBtn) {
    dlBtn.disabled = true;
    dlBtn.innerHTML = '<span class="rpt-spinner"></span>&nbsp; Generating…';
  }

  const tplEl = document.getElementById('pdf-tpl');
  const inner = tplEl ? tplEl.querySelector('div') : null;

  if (!inner) {
    showToast('Report template is missing. Please reopen the modal.', 'error');
    if (dlBtn) { dlBtn.disabled = false; dlBtn.innerHTML = 'Download PDF'; }
    return;
  }

  try {
    const canvas = await html2canvas(inner, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#FFFFFF',
      width: 794,
      windowWidth: 794,
    });

    const { jsPDF } = window.jspdf;
    const pdf  = new jsPDF('p', 'mm', 'a4');
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgD = canvas.toDataURL('image/png');
    const imgH = (canvas.height * pdfW) / canvas.width;

    pdf.addImage(imgD, 'PNG', 0, 0, pdfW, Math.min(imgH, pdfH));
    pdf.save(`FinSight_Report_${_reportId || 'export'}.pdf`);

    closeReportModal();
    showToast('Report downloaded successfully', 'success');
    // CHANGED: Feed successful exports into the topbar notification center when present.
    if (typeof addNotification === 'function') {
      addNotification({
        type: 'success',
        title: 'Report downloaded',
        body: `Credit Risk PDF ${_reportId || ''} was saved successfully.`,
        action: 'reports',
      });
    }

  } catch (err) {
    console.error('[ReportPDF] Error:', err);
    showToast('❌ PDF generation failed. Please try again.', 'error');
  } finally {
    if (dlBtn) { dlBtn.disabled = false; dlBtn.innerHTML = 'Download PDF'; }
  }
}

// ─── 8. Toast Notification ───────────────────────────────────────────────────
// Appears top-right, auto-dismisses after 3 seconds
// type: 'success' | 'error'
function showToast(msg, type = 'success') {
  let toast = document.getElementById('rpt-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = '';
  toast.classList.add('rpt-toast', `rpt-toast-${type}`, 'rpt-toast-in');
  toast.style.display = 'block';

  clearTimeout(toast._dismiss);
  toast._dismiss = setTimeout(() => {
    toast.classList.replace('rpt-toast-in', 'rpt-toast-out');
    setTimeout(() => { toast.style.display = 'none'; }, 420);
  }, 3000);
}

// ─── 9. Pulse Download Button After Analysis ─────────────────────────────────
// Called from showResults() hook. Shows the button bar and pulses the button.
function pulseDwnldBtn() {
  const bar = document.getElementById('rpt-btn-bar');
  const btn = document.getElementById('rpt-dl-btn');
  if (bar) bar.style.display = 'flex';
  if (btn) {
    btn.classList.remove('rpt-btn-pulse');
    void btn.offsetWidth; // reset animation
    btn.classList.add('rpt-btn-pulse');
    setTimeout(() => btn.classList.remove('rpt-btn-pulse'), 4200);
  }
}
