// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  selectedDocType: 'bank_statement',
  selectedFile: null,
  analysisResult: null,
  reports: [],
  docsProcessed: 0,
  avgTime: 0,
  chatContext: null,
};

// ─── Theme Toggle ─────────────────────────────────────────────────────────────
// ADDED: Dark/light mode toggle per Stitch design spec
// Persists preference to localStorage, swaps sun/moon icon, 300ms CSS transition
function toggleTheme() {
  const html    = document.documentElement;
  const moon    = document.getElementById('icon-moon');
  const sun     = document.getElementById('icon-sun');
  const isDark  = html.classList.contains('dark');

  if (isDark) {
    html.classList.remove('dark');
    html.classList.add('light');
    moon.style.display = 'none';
    sun.style.display  = 'block';
    localStorage.setItem('finsight-theme', 'light');
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
    moon.style.display = 'block';
    sun.style.display  = 'none';
    localStorage.setItem('finsight-theme', 'dark');
  }
}

// ADDED: Restore saved theme on page load
(function restoreTheme() {
  const saved = localStorage.getItem('finsight-theme');
  const html  = document.documentElement;
  const moon  = document.getElementById('icon-moon');
  const sun   = document.getElementById('icon-sun');
  if (saved === 'light') {
    html.classList.remove('dark');
    html.classList.add('light');
    if (moon) moon.style.display = 'none';
    if (sun)  sun.style.display  = 'block';
  }
})();


// ─── Navigation ──────────────────────────────────────────────────────────────
function showSection(name, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  if (el) el.classList.add('active');
  const titles = { dashboard: 'Dashboard', analyzer: 'Document Analyzer', chatbot: 'AI Assistant', reports: 'Reports' };
  const crumbs = { dashboard: 'Overview', analyzer: 'Analyze Document', chatbot: 'Chat', reports: 'All Reports' };
  document.getElementById('page-title').textContent = titles[name] || name;
  document.getElementById('breadcrumb-current').textContent = crumbs[name] || name;
}

// ─── Charts ──────────────────────────────────────────────────────────────────
function initCharts() {
  const cfCtx = document.getElementById('cashflowChart').getContext('2d');
  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  new Chart(cfCtx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Credits (₹ Lakh)',
          // UPDATED: Color from purple to Stitch blue
          data: [12.4, 15.8, 11.2, 18.6, 14.3, 19.1],
          backgroundColor: 'rgba(59,130,246,0.55)',
          borderRadius: 6,
        },
        {
          label: 'Debits (₹ Lakh)',
          // UPDATED: Color from sky-blue to Stitch green
          data: [9.1, 11.2, 8.8, 13.4, 10.9, 14.5],
          backgroundColor: 'rgba(34,197,94,0.35)',
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#8B949E', font: { family: 'Inter', size: 11 } } } },
      scales: {
        x: { ticks: { color: '#6E7681' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#6E7681' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });

  const rkCtx = document.getElementById('riskChart').getContext('2d');
  new Chart(rkCtx, {
    type: 'doughnut',
    data: {
      labels: ['Low Risk', 'Medium Risk', 'High Risk'],
      datasets: [{
        data: [0, 0, 0],
        // UPDATED: Colors to Stitch semantic palette
        backgroundColor: ['rgba(34,197,94,0.65)', 'rgba(245,158,11,0.65)', 'rgba(248,81,73,0.65)'],
        borderColor:     ['#22C55E', '#F59E0B', '#F85149'],
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: { legend: { labels: { color: '#8b91b0', font: { family: 'Inter', size: 11 } } } },
    },
  });
  window._riskChart = rkCtx.canvas.__chart__ || Chart.getChart(rkCtx.canvas);
}

// ─── File Upload ─────────────────────────────────────────────────────────────
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.add('drag-over');
}
function handleDragLeave() {
  document.getElementById('upload-zone').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  handleDragLeave();
  const file = e.dataTransfer.files[0];
  if (file) setSelectedFile(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) setSelectedFile(file);
}
function setSelectedFile(file) {
  state.selectedFile = file;
  document.getElementById('file-name-display').textContent = file.name;
  document.getElementById('file-size-display').textContent = formatBytes(file.size);
  document.getElementById('selected-file-info').style.display = 'flex';
}
function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}
function selectChip(el, type) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  state.selectedDocType = type;
}

// ─── Demo Data ────────────────────────────────────────────────────────────────
const DEMO_DATASETS = {
  bank_statement: {
    company: 'Sharma Textiles Pvt Ltd',
    period: 'Oct 2024 – Mar 2025',
    extracted: {
      'Avg Monthly Credit': { val: '₹18.6L', cls: 'positive' },
      'Avg Monthly Debit': { val: '₹13.4L', cls: '' },
      'Net Cash Flow': { val: '₹5.2L', cls: 'positive' },
      'Closing Balance': { val: '₹22.3L', cls: 'positive' },
      'Bounce Incidents': { val: '2', cls: '' },
      'EMI Observed': { val: '₹1.2L/mo', cls: '' },
      'Peak Credit Month': { val: 'Jan 2025', cls: '' },
      'Bank': { val: 'HDFC Bank', cls: '' },
      'Account Type': { val: 'Current', cls: '' },
    },
    riskScore: 72,
    riskLabel: 'Medium-Low',
    riskColor: '#d97706',
    factors: [
      { label: 'Cash Flow Consistency', val: 78, color: '#059669' },
      { label: 'Bounce Rate', val: 15, color: '#dc2626' },
      { label: 'Average Balance', val: 82, color: '#059669' },
      { label: 'Debt Servicing', val: 65, color: '#d97706' },
      { label: 'Transaction Velocity', val: 70, color: '#d97706' },
    ],
    insights: [
      { type: 'positive', icon: '✅', text: 'Strong positive cash flow of ₹5.2L/month indicates healthy business operations. Business generates consistent surplus.' },
      { type: 'positive', icon: '📈', text: 'Credits show 18% growth trend over 6 months. Peak credits in Jan 2025 suggest seasonal business cycles aligned with textile industry norms.' },
      { type: 'warning', icon: '⚠️', text: '2 cheque bounces detected in the analysis period. While within acceptable range, recommend verification of reasons before sanctioning.' },
      { type: 'info', icon: '💡', text: 'EMI outflow of ₹1.2L/month suggests existing loan obligations. Debt-to-income ratio is 6.4% — well within 50% safe threshold.' },
      { type: 'positive', icon: '🏦', text: 'HDFC Bank current account with consistent 6-month history. Relationship banking pattern observed — favorable for credit assessment.' },
    ],
    recommendation: 'ELIGIBLE',
    processingTime: 3.2,
  },
  invoice: {
    company: 'Global Exports Ltd',
    period: 'Q4 2024',
    extracted: {
      'Total Invoice Value': { val: '₹84.5L', cls: 'positive' },
      'GST Amount': { val: '₹15.2L', cls: '' },
      'Number of Invoices': { val: '47', cls: '' },
      'Avg Invoice Value': { val: '₹1.79L', cls: '' },
      'Largest Invoice': { val: '₹12.3L', cls: 'positive' },
      'Overdue Amount': { val: '₹3.2L', cls: 'negative' },
      'Payment Terms': { val: 'Net 30', cls: '' },
      'Top Customer': { val: 'ABC Corp', cls: '' },
      'Category': { val: 'B2B Export', cls: '' },
    },
    riskScore: 58,
    riskLabel: 'Medium',
    riskColor: '#d97706',
    factors: [
      { label: 'Revenue Concentration', val: 55, color: '#d97706' },
      { label: 'Payment Timeliness', val: 72, color: '#059669' },
      { label: 'Invoice Diversity', val: 80, color: '#059669' },
      { label: 'Overdue Ratio', val: 28, color: '#dc2626' },
      { label: 'GST Compliance', val: 90, color: '#059669' },
    ],
    insights: [
      { type: 'positive', icon: '✅', text: 'Strong invoice volume of ₹84.5L in Q4 2024. 47 invoices demonstrate diversified client base.' },
      { type: 'warning', icon: '⚠️', text: 'Overdue receivables of ₹3.2L (3.8% of total) need monitoring. Recommend follow-up collections process.' },
      { type: 'info', icon: '💡', text: 'GST collected of ₹15.2L indicates 18% GST applicability, consistent with declared turnover — compliance looks sound.' },
      { type: 'warning', icon: '🎯', text: 'High revenue concentration from top 3 clients (62%). Customer concentration risk is moderate.' },
    ],
    recommendation: 'REVIEW',
    processingTime: 2.8,
  },
};

// ─── Analysis Engine ─────────────────────────────────────────────────────────
function runDemoAnalysis() {
  const data = DEMO_DATASETS[state.selectedDocType] || DEMO_DATASETS['bank_statement'];
  showProcessing(data);
}

function startAnalysis() {
  if (!state.selectedFile) return;
  const data = DEMO_DATASETS[state.selectedDocType] || DEMO_DATASETS['bank_statement'];
  data.company = state.selectedFile.name.replace(/\.[^.]+$/, '');
  showProcessing(data);
}

function showProcessing(data) {
  document.getElementById('placeholder-card').style.display = 'none';
  document.getElementById('results-content').style.display = 'none';
  const pc = document.getElementById('processing-card');
  pc.style.display = 'block';

  const steps = [
    { label: 'Extracting document text (OCR)', delay: 600 },
    { label: 'Identifying document type & structure', delay: 1200 },
    { label: 'Running NLP entity extraction', delay: 1800 },
    { label: 'Computing financial ratios', delay: 2600 },
    { label: 'AI risk model inference', delay: 3400 },
    { label: 'Generating insights report', delay: 4000 },
  ];

  const container = document.getElementById('processing-steps');
  container.innerHTML = '';
  steps.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'proc-step';
    el.id = 'step-' + i;
    el.innerHTML = `<span class="step-icon">○</span><span>${s.label}</span>`;
    container.appendChild(el);
  });

  steps.forEach((s, i) => {
    setTimeout(() => {
      // Mark previous done
      if (i > 0) {
        const prev = document.getElementById('step-' + (i - 1));
        if (prev) { prev.className = 'proc-step done'; prev.querySelector('.step-icon').textContent = '✓'; }
      }
      const el = document.getElementById('step-' + i);
      if (el) {
        el.className = 'proc-step active';
        el.querySelector('.step-icon').innerHTML = '<div class="step-spinner"></div>';
      }
    }, s.delay);
  });

  setTimeout(() => {
    const last = document.getElementById('step-' + (steps.length - 1));
    if (last) { last.className = 'proc-step done'; last.querySelector('.step-icon').textContent = '✓'; }
    setTimeout(() => showResults(data), 600);
  }, 4600);
}

function showResults(data) {
  document.getElementById('processing-card').style.display = 'none';
  document.getElementById('results-content').style.display = 'flex';
  document.getElementById('results-content').style.flexDirection = 'column';
  document.getElementById('results-content').style.gap = '18px';
  state.analysisResult = data;
  state.docsProcessed++;
  state.chatContext = data;

  // Extracted data grid
  const grid = document.getElementById('extracted-data-grid');
  grid.innerHTML = '';
  Object.entries(data.extracted).forEach(([k, v]) => {
    grid.innerHTML += `<div class="data-item"><div class="data-key">${k}</div><div class="data-val ${v.cls || ''}">${v.val}</div></div>`;
  });

  // Risk badge
  const badge = document.getElementById('risk-badge');
  badge.textContent = data.riskLabel;
  badge.style.background = hexToRgba(data.riskColor, 0.15);
  badge.style.color = data.riskColor;
  badge.style.borderColor = hexToRgba(data.riskColor, 0.3);

  // Gauge score
  const gsEl = document.getElementById('gauge-score');
  gsEl.textContent = data.riskScore;
  gsEl.style.color = data.riskColor;

  // Risk factors
  const rfEl = document.getElementById('risk-factors');
  rfEl.innerHTML = '';
  data.factors.forEach(f => {
    rfEl.innerHTML += `
      <div class="risk-factor">
        <span class="rf-label">${f.label}</span>
        <div class="rf-bar-wrap"><div class="rf-bar" style="width:${f.val}%;background:${f.color}"></div></div>
        <span class="rf-val" style="color:${f.color}">${f.val}</span>
      </div>`;
  });

  // Insights
  const insEl = document.getElementById('insights-list');
  insEl.innerHTML = '';
  data.insights.forEach(ins => {
    insEl.innerHTML += `
      <div class="insight-item ${ins.type}">
        <span class="insight-icon">${ins.icon}</span>
        <span class="insight-text">${ins.text}</span>
      </div>`;
  });

  // Update KPIs
  document.getElementById('kpi-docs').textContent = state.docsProcessed;
  document.getElementById('kpi-risk').textContent = data.riskScore + '/100';
  document.getElementById('kpi-risk').style.color = data.riskColor;
  document.getElementById('kpi-risk-delta').textContent = data.riskLabel + ' Risk';
  const avgCredit = Object.values(data.extracted).find(v => v.val.includes('L') && v.cls === 'positive');
  if (avgCredit) {
    document.getElementById('kpi-turnover').textContent = avgCredit.val;
    document.getElementById('kpi-turnover-delta').textContent = 'Monthly average';
  }
  document.getElementById('kpi-time').textContent = data.processingTime + 's';

  // Save report
  addReport(data);
  addActivity(data);
}

// ─── Dashboard Updates ────────────────────────────────────────────────────────
function addActivity(data) {
  const list = document.getElementById('activity-list');
  const emptyState = list.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const riskClass = data.riskScore >= 70 ? 'risk-low' : data.riskScore >= 45 ? 'risk-medium' : 'risk-high';
  const dotColor = data.riskScore >= 70 ? '#059669' : data.riskScore >= 45 ? '#d97706' : '#dc2626';
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `
    <div class="activity-dot" style="background:${dotColor}"></div>
    <div class="activity-info">
      <div class="activity-name">${data.company}</div>
      <div class="activity-meta">${data.period || state.selectedDocType} · ${data.processingTime}s processing</div>
    </div>
    <span class="activity-risk ${riskClass}">${data.riskLabel}</span>`;
  list.prepend(item);
}

function addReport(data) {
  const ts = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  state.reports.unshift({ ...data, timestamp: ts, id: Date.now() });
  renderReports();
}

function renderReports() {
  const el = document.getElementById('reports-list');
  document.getElementById('report-count').textContent = state.reports.length + ' Report' + (state.reports.length !== 1 ? 's' : '');
  if (!state.reports.length) {
    el.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg><p>No reports yet.</p></div>`;
    return;
  }
  el.innerHTML = `
    <table class="reports-table">
      <thead><tr><th>Company</th><th>Period</th><th>Risk Score</th><th>Status</th><th>Analyzed At</th><th></th></tr></thead>
      <tbody>${state.reports.map(r => `
        <tr>
          <td style="color:var(--text);font-weight:600">${r.company}</td>
          <td>${r.period || '—'}</td>
          <td style="color:${r.riskColor};font-weight:700;font-family:'JetBrains Mono',monospace">${r.riskScore}/100</td>
          <td><span class="activity-risk ${r.riskScore >= 70 ? 'risk-low' : r.riskScore >= 45 ? 'risk-medium' : 'risk-high'}">${r.riskLabel}</span></td>
          <td>${r.timestamp}</td>
          <td><button class="btn-outline btn-sm" onclick='downloadJSON(${JSON.stringify(r)})'>Export</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// ─── Export ───────────────────────────────────────────────────────────────────
function exportReport() {
  if (!state.analysisResult) return;
  downloadJSON(state.analysisResult);
}
function downloadJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finsight_report_${data.company?.replace(/\s+/g, '_') || 'report'}.json`;
  a.click();
}

function resetAnalysis() {
  state.selectedFile = null;
  state.analysisResult = null;
  document.getElementById('results-content').style.display = 'none';
  document.getElementById('processing-card').style.display = 'none';
  document.getElementById('placeholder-card').style.display = 'flex';
  document.getElementById('selected-file-info').style.display = 'none';
  document.getElementById('file-input').value = '';
}

// ─── AI Chat ─────────────────────────────────────────────────────────────────
const AI_KNOWLEDGE = {
  'risk score': 'A risk score between 0-100 represents creditworthiness. 70-100 = Low Risk (eligible), 45-69 = Medium Risk (review needed), 0-44 = High Risk (likely decline). It is computed using cash flow consistency, bounce rate, balance trends, and debt servicing ratios.',
  'kyc': 'KYC (Know Your Customer) is an RBI-mandated process for NBFCs to verify borrower identity using documents like Aadhaar, PAN, and business registration certificates. It helps prevent fraud and money laundering.',
  'debt-to-income': 'The Debt-to-Income (DTI) ratio is monthly debt payments divided by monthly gross income. NBFCs typically require DTI < 50%. A DTI of 20-35% is considered healthy for SME loan approval.',
  'gst': 'GST turnover declared in GSTR-3B filings is used by lenders to verify actual business revenue. Consistent GST filings signal operational legitimacy and help size loan amounts — typically 15-25% of annual turnover.',
  'bank statement': 'Key red flags in bank statements include: frequent cheque bounces (>3/year), irregular cash flow, unexplained large cash withdrawals, dormant periods, and high EMI-to-income ratio above 50%.',
  'sme': 'SME loan eligibility in India typically requires: 2+ years of business vintage, annual turnover of ₹10L+, a credit score of 650+, and verifiable GST/ITR filings. NBFCs are more flexible than banks for first-time borrowers.',
  'credit': 'Credit eligibility for SMEs is assessed using the 5 Cs: Character (repayment history), Capacity (cash flow), Capital (net worth), Collateral (assets), and Conditions (industry/economic context).',
  'nbfc': 'NBFCs (Non-Banking Financial Companies) registered with the RBI provide credit without a banking license. They are more agile than banks and serve underbanked SMEs with products like working capital loans, invoice discounting, and MSME loans.',
};

function getAIResponse(userMsg) {
  const msg = userMsg.toLowerCase();
  let response = '';

  // Check if there is a document context
  if (state.chatContext && (msg.includes('document') || msg.includes('result') || msg.includes('analyzed') || msg.includes('score') || msg.includes('company'))) {
    const d = state.chatContext;
    response = `Based on the analyzed document for <strong>${d.company}</strong>:<br><br>
    The risk score is <strong>${d.riskScore}/100 (${d.riskLabel})</strong>. `;
    if (d.riskScore >= 70) response += 'This indicates the entity is <strong style="color:#34d399">eligible for credit consideration</strong>. ';
    else if (d.riskScore >= 45) response += 'This indicates a <strong style="color:#fbbf24">borderline case requiring manual review</strong>. ';
    else response += 'This indicates <strong style="color:#f87171">elevated risk — caution advised</strong>. ';
    response += '<br><br>The main strength is ' + d.insights[0]?.text + '<br><br>Key concern: ' + (d.insights.find(i => i.type === 'warning')?.text || 'No major concerns flagged.');
    return response;
  }

  // Match knowledge base
  for (const [key, val] of Object.entries(AI_KNOWLEDGE)) {
    if (msg.includes(key)) { response = val; break; }
  }

  // Fallback responses
  if (!response) {
    const fallbacks = [
      'Great question! In the context of SME lending and NBFC operations, this relates to how lenders assess creditworthiness beyond traditional credit scores — using real-time banking data, GST returns, and invoice history. Could you be more specific about what aspect you\'d like me to explain?',
      'FinSight AI specializes in financial document analysis for SME credit assessment. I can explain risk scores, document types, KYC processes, GST compliance, and credit eligibility criteria. What would you like to know more about?',
      'That\'s an interesting question! For NBFC loan processing, the answer depends on the borrower\'s specific profile. I recommend uploading a document in the Analyzer tab so I can provide context-specific insights based on real extracted data.',
    ];
    response = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
  return response;
}

function addChatMsg(role, html, isTyping = false) {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + role;
  div.innerHTML = `
    <div class="msg-avatar">${role === 'ai' ? 'AI' : 'R'}</div>
    <div class="msg-bubble">${isTyping ? '<span class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>' : html}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addChatMsg('user', text);
  const typingEl = addChatMsg('ai', '', true);
  setTimeout(() => {
    typingEl.querySelector('.msg-bubble').innerHTML = getAIResponse(text);
    document.getElementById('chat-messages').scrollTop = 9999;
  }, 900 + Math.random() * 700);
}

function quickAsk(q) {
  document.getElementById('chat-input').value = q;
  sendMessage();
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCharts();

  // ADDED: IntersectionObserver for scroll-triggered fade-in-up per Stitch design
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in-up');
        // Stagger children inside sections
        entry.target.querySelectorAll('.kpi-card, .activity-item').forEach((child, i) => {
          child.style.animationDelay = `${i * 0.07}s`;
        });
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  // Observe section-level containers
  document.querySelectorAll('.card, .kpi-grid, .charts-row').forEach(el => observer.observe(el));

  // ADDED: Stagger table rows on reports render (called after renderReports)
  // Note: report rows get animation via CSS nth-child rules in style.css
});
