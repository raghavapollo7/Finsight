// ═══════════════════════════════════════════════════════════════════════════════
// fraud.js — FinSight AI Fraud Detection Engine
// NEW FILE — added to support Fraud Detection Flags feature
//
// Architecture:
//   1. FRAUD_PATTERNS — static definitions of all 7 detectable patterns
//   2. generateMockTransactions() — placeholder data; swap for real OCR pipeline
//   3. detectFraudFlags(transactions) — detection logic for each pattern
//   4. calcFraudScore(flags) — scoring: High=+20pts, Medium=+10pts, cap 100
//   5. renderFraudKPI(score) — updates the Fraud Risk KPI card on dashboard
//   6. renderFraudPanel(flags, score) — renders flag cards below KPI grid
//   7. animateFraudScore(targetScore) — count-up animation from 0 to score
//   8. runFraudAnalysis(analysisData) — main entry point called after doc analysis
//   9. Chatbot hook — FRAUD_KB added to AI_KNOWLEDGE for Q&A about flags
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. Pattern Definitions ───────────────────────────────────────────────────
// Each pattern has: id, icon, name, description, severity ('high'|'medium')
// To add a new pattern: add an entry here and a matching detector in detectFraudFlags()
const FRAUD_PATTERNS = {
  round_numbers: {
    id: 'round_numbers',
    icon: '🔴',
    name: 'Round Number Transactions',
    description: 'Multiple transactions of exact round amounts (₹10,000; ₹50,000) detected in short succession — a common indicator of fabricated or manipulated statements.',
    severity: 'high',
  },
  sudden_large_deposit: {
    id: 'sudden_large_deposit',
    icon: '🔴',
    name: 'Sudden Large Deposit',
    description: 'A one-time deposit significantly larger than the average monthly credit was detected within 30 days of the application date — may indicate window-dressing of balances.',
    severity: 'high',
  },
  irregular_cashflow: {
    id: 'irregular_cashflow',
    icon: '🟡',
    name: 'Irregular Cash Flow',
    description: 'Monthly income varies by more than 40% across the statement period — indicates unstable or inconsistent earnings that increase repayment risk.',
    severity: 'medium',
  },
  high_cash_withdrawals: {
    id: 'high_cash_withdrawals',
    icon: '🟡',
    name: 'High Cash Withdrawals',
    description: 'Cash withdrawals exceed 60% of monthly income — reduces the verifiable spending trail and limits the lender\'s ability to assess true financial behavior.',
    severity: 'medium',
  },
  dormant_then_active: {
    id: 'dormant_then_active',
    icon: '🔴',
    name: 'Dormant then Active Account',
    description: 'Account shows very low activity for 3+ months followed by sudden high activity — a strong indicator of possible account manipulation for loan application purposes.',
    severity: 'high',
  },
  emi_bounce: {
    id: 'emi_bounce',
    icon: '🟡',
    name: 'EMI Bounce Pattern',
    description: 'Repeated failed or returned transactions on fixed dates detected — indicates existing undisclosed loan stress and poor repayment capacity.',
    severity: 'medium',
  },
  duplicate_transactions: {
    id: 'duplicate_transactions',
    icon: '🔴',
    name: 'Duplicate Transaction Amounts',
    description: 'The same amount was credited and debited within 24–48 hours repeatedly — a pattern associated with circular transactions used to artificially inflate turnover.',
    severity: 'high',
  },
};

// ─── 2. Mock Transaction Generator ───────────────────────────────────────────
// ⚠️  PLACEHOLDER — Replace generateMockTransactions() with real OCR/parsed data
//     from your document pipeline when it's ready.
//     Expected output format: array of { date, amount, type, description, bounced }
//
// The mock data intentionally includes several red flags so the demo is useful.
function generateMockTransactions(analysisData) {
  // -- SWAP POINT: Replace this entire function body with real data --
  // Example real integration:
  //   return window.parsedBankStatementData.transactions;

  const now = new Date();
  const txns = [];

  // Normal monthly credits (6 months)
  const monthlyCredits = [124000, 158000, 85000, 186000, 94000, 191000]; // HIGH variance → triggers irregular_cashflow
  monthlyCredits.forEach((amt, i) => {
    const d = new Date(now); d.setMonth(d.getMonth() - (5 - i)); d.setDate(5);
    txns.push({ date: d, amount: amt, type: 'credit', description: 'Business Income', bounced: false });
  });

  // Round number transactions (triggers round_numbers)
  [10000, 50000, 10000, 50000, 10000].forEach((amt, i) => {
    const d = new Date(now); d.setDate(10 + i);
    txns.push({ date: d, amount: amt, type: 'debit', description: 'Cash Transfer', bounced: false });
  });

  // Large deposit 15 days ago (triggers sudden_large_deposit)
  const recentDeposit = new Date(now); recentDeposit.setDate(now.getDate() - 15);
  txns.push({ date: recentDeposit, amount: 850000, type: 'credit', description: 'NEFT - Unknown Remitter', bounced: false });

  // High cash withdrawals (triggers high_cash_withdrawals)
  [65000, 72000, 58000].forEach((amt, i) => {
    const d = new Date(now); d.setDate(14 + i * 3);
    txns.push({ date: d, amount: amt, type: 'debit', description: 'ATM Cash Withdrawal', bounced: false });
  });

  // Dormant period: no transactions 4 months ago (handled in detector by gap analysis)
  // (no entries for months -4 and -5, only the very low credit is already in monthlyCredits[1])

  // EMI bounces on the 1st of 3 months (triggers emi_bounce)
  [3, 2, 1].forEach(mBack => {
    const d = new Date(now); d.setMonth(d.getMonth() - mBack); d.setDate(1);
    txns.push({ date: d, amount: 18500, type: 'debit', description: 'ECS/NACH Return - Loan EMI', bounced: true });
  });

  // Duplicate amounts: same credit & debit of 25000 within 2 days (triggers duplicate_transactions)
  const dupBase = new Date(now); dupBase.setDate(now.getDate() - 7);
  txns.push({ date: dupBase, amount: 25000, type: 'credit', description: 'IMPS Credit', bounced: false });
  const dupDebit = new Date(dupBase); dupDebit.setDate(dupBase.getDate() + 1);
  txns.push({ date: dupDebit, amount: 25000, type: 'debit', description: 'IMPS Debit', bounced: false });
  // Second pair
  const dupBase2 = new Date(now); dupBase2.setDate(now.getDate() - 20);
  txns.push({ date: dupBase2, amount: 25000, type: 'credit', description: 'IMPS Credit', bounced: false });
  const dupDebit2 = new Date(dupBase2); dupDebit2.setDate(dupBase2.getDate() + 1);
  txns.push({ date: dupDebit2, amount: 25000, type: 'debit', description: 'IMPS Debit', bounced: false });

  return txns.sort((a, b) => a.date - b.date);
}

// ─── 3. Detection Logic ───────────────────────────────────────────────────────
// Returns array of triggered FRAUD_PATTERNS (by reference)
// Each detector is isolated and can be replaced independently.
function detectFraudFlags(transactions) {
  const triggered = [];

  // Helper: get monthly credits grouped by month
  const byMonth = {};
  transactions.forEach(t => {
    if (t.type !== 'credit' || t.bounced) return;
    const key = `${t.date.getFullYear()}-${t.date.getMonth()}`;
    byMonth[key] = (byMonth[key] || 0) + t.amount;
  });
  const monthlyCreditValues = Object.values(byMonth);
  const avgMonthlyCredit = monthlyCreditValues.reduce((s, v) => s + v, 0) / (monthlyCreditValues.length || 1);

  // ── Detector A: Round Number Transactions ─────────────────────────────────
  const roundAmounts = transactions.filter(t => t.amount % 10000 === 0 && t.amount >= 10000);
  if (roundAmounts.length >= 3) triggered.push(FRAUD_PATTERNS.round_numbers);

  // ── Detector B: Sudden Large Deposit ──────────────────────────────────────
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentLargeDeposits = transactions.filter(t =>
    t.type === 'credit' && !t.bounced &&
    t.date >= thirtyDaysAgo &&
    t.amount > avgMonthlyCredit * 3
  );
  if (recentLargeDeposits.length > 0) triggered.push(FRAUD_PATTERNS.sudden_large_deposit);

  // ── Detector C: Irregular Cash Flow ──────────────────────────────────────
  if (monthlyCreditValues.length >= 2) {
    const maxCredit = Math.max(...monthlyCreditValues);
    const minCredit = Math.min(...monthlyCreditValues);
    const variancePct = (maxCredit - minCredit) / (avgMonthlyCredit || 1);
    if (variancePct > 0.4) triggered.push(FRAUD_PATTERNS.irregular_cashflow);
  }

  // ── Detector D: High Cash Withdrawals ────────────────────────────────────
  const cashWithdrawals = transactions.filter(t =>
    t.type === 'debit' && !t.bounced &&
    t.description.toLowerCase().includes('cash')
  );
  const totalCashOut = cashWithdrawals.reduce((s, t) => s + t.amount, 0);
  const totalCredit   = transactions.filter(t => t.type === 'credit' && !t.bounced).reduce((s, t) => s + t.amount, 0);
  if (totalCredit > 0 && totalCashOut / totalCredit > 0.6) triggered.push(FRAUD_PATTERNS.high_cash_withdrawals);

  // ── Detector E: Dormant then Active ─────────────────────────────────────
  const sortedMonths = Object.keys(byMonth).sort();
  if (sortedMonths.length >= 2) {
    // Find a stretch where 2+ consecutive months have < 20% of average credit
    let dormantStreak = 0;
    let wasDormant = false;
    sortedMonths.forEach(key => {
      if (byMonth[key] < avgMonthlyCredit * 0.2) dormantStreak++;
      else if (dormantStreak >= 2) wasDormant = true;
    });
    // Check if recent months are active (> 80% of avg)
    const recentKeys = sortedMonths.slice(-2);
    const recentActive = recentKeys.every(k => byMonth[k] > avgMonthlyCredit * 0.8);
    if (wasDormant && recentActive) triggered.push(FRAUD_PATTERNS.dormant_then_active);
  }

  // ── Detector F: EMI Bounce Pattern ──────────────────────────────────────
  const bounces = transactions.filter(t => t.bounced);
  if (bounces.length >= 2) triggered.push(FRAUD_PATTERNS.emi_bounce);

  // ── Detector G: Duplicate Transaction Amounts ────────────────────────────
  // Same amount credit + debit within 48 hours, occurring 2+ times
  let dupCount = 0;
  transactions.forEach((t, i) => {
    if (t.type !== 'credit') return;
    const ms48h = 48 * 60 * 60 * 1000;
    const matchingDebit = transactions.find((t2, j) =>
      j !== i &&
      t2.type === 'debit' &&
      t2.amount === t.amount &&
      Math.abs(t2.date - t.date) <= ms48h
    );
    if (matchingDebit) dupCount++;
  });
  if (dupCount >= 2) triggered.push(FRAUD_PATTERNS.duplicate_transactions);

  return triggered;
}

// ─── 4. Score Calculation ─────────────────────────────────────────────────────
// High severity flag = +20 pts | Medium = +10 pts | Max = 100
function calcFraudScore(flags) {
  const raw = flags.reduce((sum, f) => sum + (f.severity === 'high' ? 20 : 10), 0);
  return Math.min(raw, 100);
}

// ─── 5. KPI Card Update ──────────────────────────────────────────────────────
// Updates the Fraud Risk KPI card (#kpi-fraud) with score + color
function renderFraudKPI(score) {
  const color = score <= 30 ? '#22C55E' : score <= 60 ? '#F59E0B' : '#EF4444';
  const label = score <= 30 ? 'Low Risk' : score <= 60 ? 'Medium Risk' : 'High Risk';

  const valueEl  = document.getElementById('kpi-fraud-value');
  const barEl    = document.getElementById('kpi-fraud-bar');
  const trendEl  = document.getElementById('kpi-fraud-trend');
  const cardEl   = document.getElementById('kpi-fraud-card');

  if (!valueEl) return; // Guard if element not found

  // Style
  valueEl.style.color   = color;
  barEl.style.background = color;
  trendEl.textContent   = label;
  trendEl.className     = score <= 30 ? 'kpi-trend up' : score <= 60 ? 'kpi-trend neu' : 'kpi-trend down';
  trendEl.style.color   = color;

  // Animate bar
  setTimeout(() => { barEl.style.width = score + '%'; }, 100);

  // Count-up animation for the score number
  animateFraudScore(score, color, valueEl);
}

// ─── 6. Fraud Panel Renderer ─────────────────────────────────────────────────
// Renders the full Fraud Analysis panel (#fraud-panel) below the KPI grid
function renderFraudPanel(flags, score) {
  const panel = document.getElementById('fraud-panel');
  if (!panel) return;

  // Show the panel (hidden until first analysis)
  panel.style.display = 'block';

  const color   = score <= 30 ? '#22C55E' : score <= 60 ? '#F59E0B' : '#EF4444';
  const bgColor = score <= 30 ? 'rgba(34,197,94,0.07)' : score <= 60 ? 'rgba(245,158,11,0.07)' : 'rgba(239,68,68,0.07)';
  const label   = score <= 30 ? 'Low Risk' : score <= 60 ? 'Medium Risk' : 'High Risk';

  if (flags.length === 0) {
    // ── Empty state (clean) ──
    panel.innerHTML = `
      <div class="g-card-header" style="padding:18px 20px;border-bottom:1px solid var(--border)">
        <h3>🛡️ Fraud Detection Analysis</h3>
        <span class="card-badge green">Clean</span>
      </div>
      <div class="fraud-empty-state">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <h4 style="font-size:16px;font-weight:700;margin-bottom:6px">No Fraud Flags Detected</h4>
        <p style="font-size:13px;color:var(--text3);max-width:340px;text-align:center;line-height:1.6">
          All transaction patterns look consistent. The statement shows no signs of fabrication, circular transactions, or suspicious activity.
        </p>
      </div>`;
    return;
  }

  // ── Fraud Meter HTML ──
  const meterHtml = `
    <div class="fraud-meter-wrap">
      <div class="fraud-meter-labels">
        <span style="font-size:12px;font-weight:600;color:var(--text2)">Fraud Risk Meter</span>
        <span style="font-size:13px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${color}">${score}/100 — ${label}</span>
      </div>
      <div class="fraud-meter-track">
        <div class="fraud-meter-fill" id="fraud-meter-fill" style="width:0%;background:${color}"></div>
      </div>
      <div class="fraud-meter-ticks">
        <span style="color:#22C55E">0 — Safe</span>
        <span style="color:#F59E0B">30 — Medium</span>
        <span style="color:#EF4444">60 — High</span>
        <span style="color:#EF4444">100</span>
      </div>
    </div>`;

  // ── Flag cards HTML ──
  const flagsHtml = flags.map((f, i) => {
    const isHigh    = f.severity === 'high';
    const bgClr     = isHigh ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)';
    const borderClr = isHigh ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)';
    const iconClr   = isHigh ? '#EF4444' : '#F59E0B';
    const badgeBg   = isHigh ? 'rgba(239,68,68,0.14)' : 'rgba(245,158,11,0.14)';
    const badgeTxt  = isHigh ? '#EF4444' : '#F59E0B';
    const shakeClass = isHigh ? ' fraud-flag-shake' : '';

    return `
      <div class="fraud-flag-card${shakeClass}"
           style="background:${bgClr};border-left-color:${iconClr};animation-delay:${i * 0.15}s"
           data-flag-id="${f.id}">
        <div class="fraud-flag-top">
          <div class="fraud-flag-icon" style="background:${badgeBg}">${f.icon}</div>
          <div class="fraud-flag-info">
            <span class="fraud-flag-name">${f.name}</span>
            <span class="fraud-flag-desc">${f.description}</span>
          </div>
          <span class="fraud-severity-badge" style="background:${badgeBg};color:${badgeTxt};border-color:${borderClr}">
            ${isHigh ? '⚠ High' : '◐ Medium'}
          </span>
        </div>
        <button class="fraud-ask-btn" onclick="fraudAskAI('${f.id}')">
          Ask AI: Why is this flagged? →
        </button>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="g-card-header" style="padding:18px 20px;border-bottom:1px solid var(--border)">
      <h3>🛡️ Fraud Detection Analysis</h3>
      <span class="card-badge" style="background:${bgColor};color:${color};border-color:${color}40">
        ${flags.length} Flag${flags.length !== 1 ? 's' : ''} Detected
      </span>
    </div>
    <div style="padding:18px 20px;display:flex;flex-direction:column;gap:16px">
      ${meterHtml}
      <div class="fraud-flags-list">
        ${flagsHtml}
      </div>
    </div>`;

  // Animate fraud meter fill after DOM paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      const fill = document.getElementById('fraud-meter-fill');
      if (fill) fill.style.width = score + '%';
    }, 200);
  });
}

// ─── 7. Count-up Animation ───────────────────────────────────────────────────
// Animates the fraud score KPI value from 0 → targetScore over ~1.2s
function animateFraudScore(target, color, el) {
  let current = 0;
  const step  = Math.max(1, Math.ceil(target / 40));
  const delay = 1200 / (target / step || 1);

  el.textContent = '0';
  if (target === 0) return;

  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current + '/100';
    el.style.color  = color;
    if (current >= target) clearInterval(timer);
  }, delay);
}

// ─── 8. Main Entry Point ─────────────────────────────────────────────────────
// Call this after a document is analyzed. Pass in the analysisData object
// from showResults() so context is available for the chatbot.
function runFraudAnalysis(analysisData) {
  // Generate (or later: receive) transaction data
  // ⚠️  SWAP POINT: Replace generateMockTransactions() with real pipeline data
  const transactions = generateMockTransactions(analysisData);

  // Detect flags
  const flags = detectFraudFlags(transactions);

  // Calculate score
  const score = calcFraudScore(flags);

  // Store in state for chatbot access
  state.fraudFlags  = flags;
  state.fraudScore  = score;

  // Render KPI card
  renderFraudKPI(score);

  // Render full panel
  renderFraudPanel(flags, score);

  // Log for debugging (remove in production)
  console.log(`[FraudEngine] Score: ${score}/100 | Flags: ${flags.map(f => f.id).join(', ') || 'none'}`);
}

// ─── 9. "Ask AI" about a specific flag ──────────────────────────────────────
// Called when user clicks "Ask AI: Why is this flagged?" on a flag card.
// Routes the question to the dashboard mini-chatbot.
function fraudAskAI(flagId) {
  const pattern = FRAUD_PATTERNS[flagId];
  if (!pattern) return;

  const question = `Why was the "${pattern.name}" fraud flag triggered in my document?`;

  // If on dashboard, use the mini-chat
  const dashInput = document.getElementById('dash-chat-input');
  if (dashInput) {
    dashInput.value = question;
    // Scroll to chat
    document.getElementById('dash-chat-messages')?.scrollIntoView({ behavior: 'smooth' });
    if (typeof sendDashMessage === 'function') sendDashMessage();
    return;
  }

  // Fallback: full chat panel
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.value = question;
    if (typeof sendMessage === 'function') sendMessage();
  }
}

// ─── Chatbot Knowledge Base Extension ────────────────────────────────────────
// NEW: Adds fraud-related Q&A to the existing AI_KNOWLEDGE object.
// Called once DOM is ready (see DOMContentLoaded hook at bottom).
function extendAIKnowledgeWithFraud() {
  if (typeof AI_KNOWLEDGE === 'undefined') return;

  AI_KNOWLEDGE['fraud'] = 'FinSight AI scans for 7 fraud patterns: Round Number Transactions, Sudden Large Deposits, Irregular Cash Flow, High Cash Withdrawals, Dormant-then-Active Account, EMI Bounce Pattern, and Duplicate Transaction Amounts. Each High severity flag adds 20 points to the Fraud Risk Score; Medium flags add 10 points (max 100).';

  AI_KNOWLEDGE['round number'] = 'Round Number Transactions (e.g., ₹10,000 or ₹50,000) appearing repeatedly in quick succession are a classic indicator of fabricated bank statements. Real businesses rarely transact in perfect round amounts — their payments include vendor bills, utility charges, and payroll which are always irregular.';

  AI_KNOWLEDGE['sudden large deposit'] = 'A Sudden Large Deposit shortly before a loan application is a major red flag. It suggests the applicant may have temporarily moved funds into the account to create the appearance of a healthy balance. Lenders discount such deposits unless accompanied by documented source-of-funds evidence.';

  AI_KNOWLEDGE['irregular cash'] = 'Irregular Cash Flow occurs when monthly income swings by more than 40%. While seasonal businesses are naturally variable, extreme swings can indicate cherry-picked statements or a business without stable revenue — both increase the probability of default.';

  AI_KNOWLEDGE['cash withdrawal'] = 'High Cash Withdrawals (>60% of income) are problematic because cash transactions are untraceable. Lenders cannot verify that cash was used for business expenses versus personal use or loan repayments for undisclosed liabilities.';

  AI_KNOWLEDGE['dormant'] = 'A Dormant-then-Active Account pattern — where an account is nearly inactive for 3+ months then suddenly shows high activity — often means the account was recently activated specifically for the loan application. Genuine businesses maintain consistent banking activity.';

  AI_KNOWLEDGE['emi bounce'] = 'EMI Bounce Pattern means existing loan EMIs are failing due to insufficient funds. This is direct evidence of over-leveraging — the applicant already cannot service existing debt, making new lending extremely risky. Repeated bounces on the same date point to an ECS/NACH mandate that keeps failing.';

  AI_KNOWLEDGE['duplicate'] = 'Duplicate Transaction Amounts — the same value credited then debited within 48 hours, repeatedly — is the signature of circular transactions. These are used to inflate apparent turnover without any real business activity. Two parties simply transfer money back and forth to create the illusion of cash flow.';

  // Context-aware response when user has a fraud-flagged document
  const originalGetAIResponse = window.getAIResponse || getAIResponse;
  window.getAIResponse = function(userMsg) {
    const msg = userMsg.toLowerCase();

    // Check for fraud flag specific questions
    if (state.fraudFlags && state.fraudFlags.length > 0) {
      const flagMatch = state.fraudFlags.find(f =>
        msg.includes(f.name.toLowerCase().split(' ')[0]) ||
        msg.includes(f.id.replace(/_/g, ' '))
      );

      if (flagMatch) {
        const isHigh = flagMatch.severity === 'high';
        return `<strong>🚨 ${flagMatch.name}</strong><br><br>
          ${flagMatch.description}<br><br>
          <strong>Severity:</strong> ${isHigh ? '<span style="color:#EF4444">High (+20 fraud score points)</span>' : '<span style="color:#F59E0B">Medium (+10 fraud score points)</span>'}<br><br>
          <strong>Recommended Action:</strong> ${isHigh
            ? 'Request original bank statements directly from the bank. Cross-reference with GST returns and ITR filings before proceeding.'
            : 'Document this observation in the credit memo and ask the applicant for a written explanation.'}`;
      }

      // General fraud question with context
      if (msg.includes('fraud') || msg.includes('flag') || msg.includes('suspicious')) {
        const highFlags   = state.fraudFlags.filter(f => f.severity === 'high');
        const medFlags    = state.fraudFlags.filter(f => f.severity === 'medium');
        return `Based on the analyzed document, FinSight AI detected <strong>${state.fraudFlags.length} fraud flag(s)</strong> with a Fraud Risk Score of <strong style="color:${state.fraudScore > 60 ? '#EF4444' : '#F59E0B'}">${state.fraudScore}/100</strong>.<br><br>
          ${highFlags.length > 0 ? `<strong>High Severity (🔴):</strong> ${highFlags.map(f => f.name).join(', ')}<br>` : ''}
          ${medFlags.length > 0  ? `<strong>Medium Severity (🟡):</strong> ${medFlags.map(f => f.name).join(', ')}<br>` : ''}
          <br>I recommend requesting source documents directly from the bank and cross-referencing with the GST portal before approval.`;
      }
    }

    return originalGetAIResponse(userMsg);
  };
}

// ─── Init Hook ────────────────────────────────────────────────────────────────
// Extend the AI knowledge base once the page is ready
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure app.js AI_KNOWLEDGE is defined first
  setTimeout(extendAIKnowledgeWithFraud, 50);
});
