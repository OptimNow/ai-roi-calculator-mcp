import "@/index.css";
import type { ReactNode } from "react";
import { mountWidget } from "skybridge/web";
import { useToolInfo } from "../../helpers.js";

interface ROIResults {
  effectiveMonthlyVolume: number;
  layer1CostPerUnit: number;
  layer1MonthlyCost: number;
  layer2CostPerUnit: number;
  layer2MonthlyCost: number;
  monthlyAmortizedFixedCost: number;
  totalFixedCost: number;
  totalMonthlyCost: number;
  totalCostPerUnit: number;
  grossValuePerUnit: number;
  netValuePerUnit: number;
  totalMonthlyValue: number;
  monthlyCashNetBenefit: number;
  netMonthlyBenefit: number;
  annualizedNetBenefit: number;
  roiPercentage: number;
  paybackMonths: number | string;
  breakEvenVolume?: number;
}

interface ROIInputs {
  useCaseName: string;
  unitName: string;
  monthlyVolume: number;
  valueMethod: string;
  successRate: number;
  analysisHorizonMonths: number;
}

function ROIDashboard() {
  const { output } = useToolInfo();

  if (!output) {
    return <div style={{ padding: "16px", color: "#64748b" }}>Calculating...</div>;
  }

  const results = (output as { results: ROIResults }).results;
  const inputs = (output as { inputs: ROIInputs }).inputs;
  const confidence = getConfidenceLabel(inputs.successRate);
  const summary = getValueSummary(results, inputs.successRate);
  const horizonMonths = Math.max(1, Math.round(inputs.analysisHorizonMonths || 12));
  const curvePoints = buildProfitCurvePoints(results.totalFixedCost, results.monthlyCashNetBenefit, horizonMonths);
  const harnessCostPerUnit = Math.max(results.layer2CostPerUnit - results.layer1CostPerUnit, 0);
  const harnessMonthlyCost = Math.max(results.layer2MonthlyCost - results.layer1MonthlyCost, 0);
  const costSlices = [
    { label: "Fixed (Amort)", value: results.monthlyAmortizedFixedCost, color: "#64748b" },
    { label: "Harness (L2)", value: harnessMonthlyCost, color: "#7c3aed" },
    { label: "Model (L1)", value: results.layer1MonthlyCost, color: "#3b82f6" },
  ];

  return (
    <div style={{ fontFamily: '"Segoe UI", system-ui, sans-serif', padding: "16px", maxWidth: "760px" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px", color: "#0f172a" }}>{inputs.useCaseName}</h2>
      <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
        {inputs.valueMethod} | {inputs.monthlyVolume.toLocaleString()} {inputs.unitName}s/month
      </p>

      <ValueSummaryCard
        valueMethod={inputs.valueMethod}
        grossPerUnit={summary.grossPerUnit}
        realizedPerUnit={summary.realizedPerUnit}
        confidence={confidence}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "10px", margin: "16px 0" }}>
        <KPICard
          label="ROI"
          value={`${Math.round(results.roiPercentage)}%`}
          subtitle={`Over ${horizonMonths} months`}
          color={results.roiPercentage >= 0 ? "#84cc16" : "#dc2626"}
        />
        <KPICard
          label="Net Benefit (P&L)"
          value={`$${formatCompact(results.netMonthlyBenefit)}`}
          subtitle="after amortization"
          color={results.netMonthlyBenefit >= 0 ? "#16a34a" : "#dc2626"}
        />
        <KPICard
          label="Payback"
          value={`${results.paybackMonths}`}
          subtitle="months to recover upfront fixed"
          color="#0f172a"
        />
        <KPICard
          label="Unit Cost"
          value={`$${results.totalCostPerUnit.toFixed(3)}`}
          subtitle={`per ${inputs.unitName}`}
          color="#0f172a"
        />
        <KPICard
          label="Break-even"
          value={results.breakEvenVolume !== undefined ? results.breakEvenVolume.toLocaleString() : "N/A"}
          subtitle={`${inputs.unitName}s/mo needed`}
          color="#0f172a"
        />
      </div>

      <BreakEvenBanner
        isReached={results.breakEvenVolume !== undefined && results.effectiveMonthlyVolume >= results.breakEvenVolume}
        currentVolume={results.effectiveMonthlyVolume}
        breakEvenVolume={results.breakEvenVolume}
        unitName={inputs.unitName}
      />

      <Panel title="ROI Curve: Cumulative Profit Over Time">
        <ProfitCurveChart points={curvePoints} breakEvenMonth={toBreakEvenMonth(results.paybackMonths)} />
      </Panel>

      <Panel title="Financial Overview">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <CostValueColumns cost={results.totalMonthlyCost} value={results.totalMonthlyValue} />
          <CostCompositionDonut slices={costSlices} />
        </div>
      </Panel>

      <Panel title="Unit Economics">
        <UnitEconomicsTable
          layer1CostPerUnit={results.layer1CostPerUnit}
          layer1MonthlyCost={results.layer1MonthlyCost}
          harnessCostPerUnit={harnessCostPerUnit}
          harnessMonthlyCost={harnessMonthlyCost}
          fixedMonthlyCost={results.monthlyAmortizedFixedCost}
          totalCostPerUnit={results.totalCostPerUnit}
          totalMonthlyCost={results.totalMonthlyCost}
          totalValuePerUnit={summary.realizedPerUnit}
          totalMonthlyValue={results.totalMonthlyValue}
        />
      </Panel>
    </div>
  );
}

function ValueSummaryCard({
  valueMethod,
  grossPerUnit,
  realizedPerUnit,
  confidence,
}: {
  valueMethod: string;
  grossPerUnit: number;
  realizedPerUnit: number;
  confidence: "High" | "Medium" | "Low";
}) {
  return (
    <div style={{ border: "1px solid #d6dbe3", borderRadius: "10px", padding: "14px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "10px",
          gap: "8px",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          Value Summary
        </div>
        <div style={{ borderRadius: "999px", background: "#f1f5f9", color: "#0f172a", fontSize: "12px", padding: "4px 10px" }}>
          {valueMethod}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <MetricStat label="Gross / Unit" value={`$${grossPerUnit.toFixed(4)}`} />
        <MetricStat label="Realized / Unit" value={`$${realizedPerUnit.toFixed(4)}`} />
        <MetricStat
          label="Confidence"
          value={confidence}
          valueColor={confidence === "High" ? "#16a34a" : confidence === "Medium" ? "#ca8a04" : "#dc2626"}
        />
      </div>
    </div>
  );
}

function MetricStat({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "26px", fontWeight: 700, color: valueColor ?? "#0f172a", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function KPICard({
  label,
  value,
  subtitle,
  color,
}: {
  label: string;
  value: string;
  subtitle: string;
  color: string;
}) {
  return (
    <div style={{ border: "1px solid #d6dbe3", borderRadius: "10px", padding: "12px", minHeight: "96px" }}>
      <div style={{ fontSize: "12px", textTransform: "uppercase", color: "#64748b", marginBottom: "8px", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: "36px", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: "8px", fontSize: "11px", color: "#64748b" }}>{subtitle}</div>
    </div>
  );
}

function BreakEvenBanner({
  isReached,
  currentVolume,
  breakEvenVolume,
  unitName,
}: {
  isReached: boolean;
  currentVolume: number;
  breakEvenVolume?: number;
  unitName: string;
}) {
  if (breakEvenVolume === undefined) {
    return (
      <div style={{ fontSize: "13px", padding: "12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", marginBottom: "16px" }}>
        Break-even is not reachable with the current economics.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "14px",
        borderRadius: "10px",
        marginBottom: "16px",
        border: isReached ? "1px solid #86efac" : "1px solid #fde68a",
        background: isReached ? "#f0fdf4" : "#fffbeb",
        color: "#14532d",
      }}
    >
      <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "6px" }}>{isReached ? "Above Break-even" : "Below Break-even"}</div>
      <div style={{ fontSize: "15px", lineHeight: 1.4 }}>
        Current volume of <strong>{currentVolume.toLocaleString()}</strong> {unitName}s/mo. Break-even threshold: <strong>{breakEvenVolume.toLocaleString()}</strong> {unitName}s/mo.
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ border: "1px solid #d6dbe3", borderRadius: "10px", padding: "14px", marginBottom: "16px" }}>
      <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", marginBottom: "14px", textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}

function ProfitCurveChart({
  points,
  breakEvenMonth,
}: {
  points: Array<{ month: number; value: number }>;
  breakEvenMonth?: number;
}) {
  const width = 680;
  const height = 260;
  const padding = { top: 16, right: 20, bottom: 36, left: 72 };
  const xMax = points[points.length - 1]?.month ?? 12;
  const minY = Math.min(...points.map((p) => p.value), 0);
  const maxY = Math.max(...points.map((p) => p.value), 0);
  const ySpan = Math.max(maxY - minY, 1);
  const toX = (month: number) => padding.left + (month / xMax) * (width - padding.left - padding.right);
  const toY = (value: number) => padding.top + ((maxY - value) / ySpan) * (height - padding.top - padding.bottom);

  const pathD = points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${toX(p.month).toFixed(2)} ${toY(p.value).toFixed(2)}`)
    .join(" ");

  const zeroY = toY(0);
  const areaD = `${pathD} L ${toX(xMax).toFixed(2)} ${zeroY.toFixed(2)} L ${toX(0).toFixed(2)} ${zeroY.toFixed(2)} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Cumulative profit over time">
      {[0.25, 0.5, 0.75, 1].map((step) => {
        const y = padding.top + step * (height - padding.top - padding.bottom);
        return <line key={step} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />;
      })}
      <line x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY} stroke="#64748b" strokeDasharray="4 4" />
      <path d={areaD} fill="rgba(34, 197, 94, 0.12)" />
      <path d={pathD} fill="none" stroke="#22c55e" strokeWidth="3" />
      {breakEvenMonth !== undefined && breakEvenMonth >= 0 && breakEvenMonth <= xMax && (
        <>
          <line x1={toX(breakEvenMonth)} y1={padding.top} x2={toX(breakEvenMonth)} y2={height - padding.bottom} stroke="#a3a3a3" strokeDasharray="4 4" />
          <text x={toX(breakEvenMonth) + 4} y={padding.top + 14} fill="#475569" fontSize="12">
            Break-even
          </text>
        </>
      )}
      <text x={width / 2} y={height - 8} fill="#64748b" fontSize="12" textAnchor="middle">Months</text>
      <text x={18} y={height / 2} fill="#64748b" fontSize="12" transform={`rotate(-90 18 ${height / 2})`} textAnchor="middle">
        Cumulative Profit
      </text>
    </svg>
  );
}

function CostValueColumns({ cost, value }: { cost: number; value: number }) {
  const max = Math.max(cost, value, 1);
  const costH = (cost / max) * 180;
  const valueH = (value / max) * 180;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "16px", minHeight: "240px", padding: "12px 10px 2px" }}>
      <ColumnBar label="Cost" value={cost} height={costH} color="#ef4444" />
      <ColumnBar label="Value" value={value} height={valueH} color="#22c55e" />
    </div>
  );
}

function ColumnBar({ label, value, height, color }: { label: string; value: number; height: number; color: string }) {
  return (
    <div style={{ width: "46%" }}>
      <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>${formatK(value)}</div>
      <div style={{ height: `${height}px`, background: color, borderRadius: "6px 6px 0 0", minHeight: "6px" }} />
      <div style={{ fontSize: "13px", color: "#334155", marginTop: "8px", textAlign: "center" }}>{label}</div>
    </div>
  );
}

function CostCompositionDonut({ slices }: { slices: Array<{ label: string; value: number; color: string }> }) {
  const total = Math.max(1, slices.reduce((sum, slice) => sum + slice.value, 0));
  const radius = 76;
  const stroke = 24;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div>
      <svg viewBox="0 0 220 220" style={{ width: "100%", maxWidth: "280px", display: "block", margin: "0 auto" }}>
        <g transform="translate(110,110) rotate(-90)">
          {slices.map((slice) => {
            const length = (slice.value / total) * circumference;
            const currentOffset = offset;
            offset += length;
            return (
              <circle
                key={slice.label}
                r={radius}
                cx={0}
                cy={0}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={stroke}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-currentOffset}
              />
            );
          })}
        </g>
      </svg>
      <div style={{ display: "flex", justifyContent: "center", gap: "14px", flexWrap: "wrap", marginTop: "6px" }}>
        {slices.map((slice) => (
          <div key={slice.label} style={{ fontSize: "12px", color: "#475569", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "99px", background: slice.color, display: "inline-block" }} />
            {slice.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function UnitEconomicsTable({
  layer1CostPerUnit,
  layer1MonthlyCost,
  harnessCostPerUnit,
  harnessMonthlyCost,
  fixedMonthlyCost,
  totalCostPerUnit,
  totalMonthlyCost,
  totalValuePerUnit,
  totalMonthlyValue,
}: {
  layer1CostPerUnit: number;
  layer1MonthlyCost: number;
  harnessCostPerUnit: number;
  harnessMonthlyCost: number;
  fixedMonthlyCost: number;
  totalCostPerUnit: number;
  totalMonthlyCost: number;
  totalValuePerUnit: number;
  totalMonthlyValue: number;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #d6dbe3" }}>
          <th style={{ textAlign: "left", padding: "10px 8px", color: "#64748b", textTransform: "uppercase", fontSize: "12px" }}>Category</th>
          <th style={{ textAlign: "right", padding: "10px 8px", color: "#64748b", textTransform: "uppercase", fontSize: "12px" }}>Cost / Unit</th>
          <th style={{ textAlign: "right", padding: "10px 8px", color: "#64748b", textTransform: "uppercase", fontSize: "12px" }}>Monthly</th>
        </tr>
      </thead>
      <tbody>
        <TableRow label="Layer 1: Model Inference" costPerUnit={layer1CostPerUnit} monthly={layer1MonthlyCost} />
        <TableRow label="Layer 2: Harness and Ops" costPerUnit={harnessCostPerUnit} monthly={harnessMonthlyCost} />
        <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
          <td style={{ padding: "10px 8px" }}>Fixed Cost Amortization</td>
          <td style={{ textAlign: "right", padding: "10px 8px" }}>-</td>
          <td style={{ textAlign: "right", padding: "10px 8px" }}>${fixedMonthlyCost.toFixed(0)}</td>
        </tr>
        <tr style={{ background: "#f8fafc", fontWeight: 700 }}>
          <td style={{ padding: "10px 8px" }}>Total Cost</td>
          <td style={{ textAlign: "right", padding: "10px 8px" }}>${totalCostPerUnit.toFixed(4)}</td>
          <td style={{ textAlign: "right", padding: "10px 8px" }}>${totalMonthlyCost.toFixed(0)}</td>
        </tr>
        <tr>
          <td style={{ padding: "10px 8px", color: "#65a30d", fontWeight: 700 }}>Total Monthly Value</td>
          <td style={{ textAlign: "right", padding: "10px 8px", color: "#65a30d", fontWeight: 700 }}>${totalValuePerUnit.toFixed(4)}</td>
          <td style={{ textAlign: "right", padding: "10px 8px", color: "#65a30d", fontWeight: 700 }}>${totalMonthlyValue.toFixed(0)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function TableRow({ label, costPerUnit, monthly }: { label: string; costPerUnit: number; monthly: number }) {
  return (
    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
      <td style={{ padding: "10px 8px" }}>{label}</td>
      <td style={{ textAlign: "right", padding: "10px 8px" }}>${costPerUnit.toFixed(4)}</td>
      <td style={{ textAlign: "right", padding: "10px 8px" }}>${monthly.toFixed(0)}</td>
    </tr>
  );
}

function getConfidenceLabel(successRate: number): "High" | "Medium" | "Low" {
  if (successRate >= 90) {
    return "High";
  }
  if (successRate >= 75) {
    return "Medium";
  }
  return "Low";
}

function getValueSummary(results: ROIResults, successRate: number): { grossPerUnit: number; realizedPerUnit: number } {
  const realizedPerUnit = results.netValuePerUnit;
  const successFactor = Math.min(100, Math.max(1, successRate)) / 100;
  const grossPerUnit = realizedPerUnit / successFactor;
  return { grossPerUnit, realizedPerUnit };
}

function buildProfitCurvePoints(fixedCost: number, monthlyCashNetBenefit: number, horizonMonths: number): Array<{ month: number; value: number }> {
  const points: Array<{ month: number; value: number }> = [];
  for (let month = 0; month <= horizonMonths; month += 1) {
    points.push({
      month,
      value: -fixedCost + monthlyCashNetBenefit * month,
    });
  }
  return points;
}

function toBreakEvenMonth(payback: number | string): number | undefined {
  if (typeof payback === "number") {
    return Number.isFinite(payback) ? payback : undefined;
  }
  const parsed = Number(payback);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return value.toFixed(0);
}

function formatK(value: number): string {
  if (Math.abs(value) < 1_000) {
    return value.toFixed(0);
  }
  return `${(value / 1_000).toFixed(1)}k`;
}

export default ROIDashboard;
mountWidget(<ROIDashboard />);



