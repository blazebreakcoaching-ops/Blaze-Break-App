// Pure builder for the Executive Board Report print document.
//
// SECURITY: every dynamic value is HTML-escaped. The AI analysis comes from
// a model that reads user-influenced text, and name/role/company are
// user-editable profile fields, so none of them may be interpreted as
// markup. The document contains no <script>; printing is triggered by the
// app itself, inside a sandboxed frame that cannot run scripts.

export interface ExecutiveReportData {
  deepWorkHours: number;
  boundariesProtected: number;
  burnRatePercent: number | null;
  sleepDebtHours: number | null;
  aiAnalysis: string | null;
}

export interface ExecutiveReportInput {
  name: string;
  role: string;
  organisation: string;
  points: number;
  streak: number;
  generatedAt: Date;
  data: ExecutiveReportData | null;
  includeAICommentary: boolean;
  includeMetricsGrid: boolean;
  includeBurnRate: boolean;
  includeCorporateSignature: boolean;
}

export const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function buildExecutiveReportHtml(input: ExecutiveReportInput): string {
  const esc = escapeHtml;
  const data = input.data;
  const sleepDebt = data?.sleepDebtHours;
  const liveName = input.name;
  const liveRole = input.role;
  const liveOrg = input.organisation;
  const pointsTotal = input.points;
  const streak = input.streak;
  const compilationDate = input.generatedAt.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Blaze Break - Confidential Executive Board Summary</title>
    <style>
        body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            background-color: #ffffff;
            color: #0c0f16;
            margin: 0;
            padding: 40px;
            line-height: 1.6;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #edeff5;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .title {
            font-size: 26px;
            font-weight: 800;
            letter-spacing: -0.5px;
            color: #000000;
        }
        .subtitle {
            font-size: 10px;
            font-weight: 950;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: #6366f1;
            margin-top: 5px;
        }
        .metadata {
            text-align: right;
            font-size: 11px;
            font-family: monospace;
            color: #64748b;
        }
        .stamp {
            display: inline-block;
            border: 2px solid #ef4444;
            color: #ef4444;
            font-family: monospace;
            font-weight: bold;
            font-size: 11px;
            padding: 4px 10px;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 20px;
            border-radius: 4px;
        }
        .summary-card {
            background-color: #f8fafc;
            border-left: 4px solid #6366f1;
            padding: 25px;
            border-radius: 0 12px 12px 0;
            margin-bottom: 30px;
        }
        .summary-title {
            font-size: 12px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #6366f1;
            margin-bottom: 12px;
        }
        .summary-text {
            font-style: italic;
            font-size: 16px;
            font-family: Georgia, serif;
            color: #1e293b;
            line-height: 1.7;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            border: 1px solid #e2e8f0;
            padding: 20px;
            border-radius: 12px;
        }
        .stat-label {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #64748b;
        }
        .stat-value {
            font-size: 32px;
            font-weight: 800;
            margin-top: 5px;
            color: #0f172a;
        }
        .stat-desc {
            font-size: 11px;
            color: #64748b;
            margin-top: 5px;
        }
        .table-title {
            font-size: 13px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #0f172a;
            margin-bottom: 15px;
            border-bottom: 1px solid #edeff5;
            padding-bottom: 8px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            margin-bottom: 40px;
        }
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #f1f5f9;
        }
        th {
            background-color: #f8fafc;
            font-weight: bold;
            color: #475569;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 1px;
        }
        .footer {
            border-top: 1px solid #edeff5;
            padding-top: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #94a3b8;
        }
        .signature-block {
            margin-top: 40px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 20px;
            display: flex;
            justify-content: space-between;
        }
        .sig-box {
            width: 45%;
        }
        .sig-line {
            height: 40px;
            border-bottom: 1px solid #475569;
            margin-bottom: 5px;
        }
        .sig-meta {
            font-size: 11px;
            color: #64748b;
            line-height: 1.3;
        }
        @media print {
            body {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div style="max-width: 800px; margin: 0 auto;">
        <div class="stamp">Strictly Confidential - Board Only</div>
        
        <div class="header">
            <div>
                <div class="title">Blaze Break Executive Board Summary</div>
                <div class="subtitle">AUTONOMIC ENERGY DESIGN & RELAPSE DEFENSIVE POSITIONING</div>
            </div>
            <div class="metadata">
                <div>DATE: ${esc(compilationDate)}</div>
                <div>EXECUTIVE: ${esc(liveName)}</div>
                <div>ROLE: ${esc(liveRole)}</div>
                <div>COMPANY: ${esc(liveOrg)}</div>
            </div>
        </div>

        ${input.includeAICommentary ? `
        <div class="summary-card">
            <div class="summary-title">Nova Core AI Analysis</div>
            <div class="summary-text">${data?.aiAnalysis
              ? esc(data.aiAnalysis)
              : "Not enough activity has been logged yet to generate a grounded analysis. This section will populate once you've used the app's recovery tools (deep work sessions, boundary rehearsal, workload check-ins)."}</div>
        </div>
        ` : ''}

        ${input.includeBurnRate ? `
        <div class="grid">
            <div class="stat-card" style="border-left: 4px solid #6366f1;">
                <div class="stat-label">Workload Intensity</div>
                <div class="stat-value">${data?.burnRatePercent !== null && data?.burnRatePercent !== undefined ? `${esc(data.burnRatePercent)}%` : 'No data yet'}</div>
                <div class="stat-desc">Active task energy drain relative to weekly capacity, from your Workload Reality Check.</div>
            </div>

            <div class="stat-card" style="border-left: 4px solid #10b981;">
                <div class="stat-label">Boundaries Protected</div>
                <div class="stat-value">${data ? `${esc(data.boundariesProtected)} Practised` : 'No data yet'}</div>
                <div class="stat-desc">Boundary scripts rehearsed this week.</div>
            </div>
        </div>
        ` : ''}

        ${input.includeMetricsGrid ? `
        <div class="table-title">Weekly Recovery Metrics</div>
        <table>
            <thead>
                <tr>
                    <th>Core Indicator Metric</th>
                    <th>Value / Capacity</th>
                    <th>Defensive Context</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Deep Work Protected</td>
                    <td><strong>${data ? `${esc(data.deepWorkHours)} hrs` : 'No data yet'}</strong></td>
                    <td>High-value focus preservation, this week</td>
                    <td style="color: #10b981; font-weight: bold;">${data && data.deepWorkHours > 0 ? 'Protected' : 'Not yet logged'}</td>
                </tr>
                <tr>
                    <td>Sleep Debt Carried</td>
                    <td><strong>${sleepDebt !== null && sleepDebt !== undefined ? `${esc(sleepDebt)} hrs` : 'Not logged'}</strong></td>
                    <td>Cumulative sleep shortfalls carryover</td>
                    <td style="color: ${sleepDebt !== null && sleepDebt !== undefined ? (sleepDebt > 3 ? '#ef4444' : '#f59e0b') : '#6b7280'}; font-weight: bold;">${sleepDebt !== null && sleepDebt !== undefined ? (sleepDebt > 3 ? 'Overloaded' : 'Caution') : 'No data'}</td>
                </tr>
                <tr>
                    <td>Total Points</td>
                    <td><strong>${esc(pointsTotal)} pts</strong></td>
                    <td>Total points earned, with current streak</td>
                    <td style="color: #10b981; font-weight: bold;">Active (Streak: ${esc(streak)}d)</td>
                </tr>
            </tbody>
        </table>
        ` : ''}

        ${input.includeCorporateSignature ? `
        <div class="signature-block">
            <div class="sig-box">
                <div class="sig-line"></div>
                <div class="sig-meta">
                    <strong>${esc(liveName)}</strong><br/>
                    Executive Leader Signature
                </div>
            </div>
        </div>
        ` : ''}

        <div class="footer" style="margin-top: 40px;">
            <div>Generated by Blaze Break from your own recorded activity. Not a medical or clinical assessment.</div>
        </div>
    </div>

</body>
</html>
`;
}
