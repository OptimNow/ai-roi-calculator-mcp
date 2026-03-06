import "@/index.css";
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
  netMonthlyBenefit: number;
  annualizedNetBenefit: number;
  roiPercentage: number;
  paybackMonths: number | string;
  breakEvenVolume?: number;
  breakEvenMonths?: number;
}

interface ROIInputs {
  useCaseName: string;
  unitName: string;
  monthlyVolume: number;
  valueMethod: string;
}

function ROIDashboard() {
  const { output } = useToolInfo();

  if (!output) {
    return <div className="p-6 text-center text-gray-500">Calculating...</div>;
  }

  const results = (output as { results: ROIResults }).results;
  const inputs = (output as { inputs: ROIInputs }).inputs;
  const isPositiveROI = results.roiPercentage > 0;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "16px", maxWidth: "640px" }}>
      {/* Header */}
      <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}>
        {inputs.useCaseName}
      </h2>
      <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "16px" }}>
        {inputs.valueMethod} · {inputs.monthlyVolume.toLocaleString()} {inputs.unitName}s/month
      </p>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
        <KPICard
          label="ROI"
          value={`${results.roiPercentage.toFixed(1)}%`}
          color={isPositiveROI ? "#16a34a" : "#dc2626"}
        />
        <KPICard
          label="Net Monthly Benefit"
          value={`$${results.netMonthlyBenefit.toFixed(0)}`}
          color={results.netMonthlyBenefit >= 0 ? "#16a34a" : "#dc2626"}
        />
        <KPICard
          label="Payback"
          value={`${results.paybackMonths} mo`}
          color="#2563eb"
        />
        <KPICard
          label="Annualized Benefit"
          value={`$${results.annualizedNetBenefit.toFixed(0)}`}
          color={results.annualizedNetBenefit >= 0 ? "#16a34a" : "#dc2626"}
        />
      </div>

      {/* Cost vs Value Bar */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
          Monthly Cost vs. Value
        </div>
        <CostValueBar
          cost={results.totalMonthlyCost}
          value={results.totalMonthlyValue}
        />
      </div>

      {/* Cost Breakdown */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
          Cost Breakdown
        </div>
        <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "4px 8px", color: "#6b7280" }}>Layer</th>
              <th style={{ textAlign: "right", padding: "4px 8px", color: "#6b7280" }}>Per Unit</th>
              <th style={{ textAlign: "right", padding: "4px 8px", color: "#6b7280" }}>Monthly</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "4px 8px" }}>L1 Infrastructure</td>
              <td style={{ textAlign: "right", padding: "4px 8px" }}>${results.layer1CostPerUnit.toFixed(6)}</td>
              <td style={{ textAlign: "right", padding: "4px 8px" }}>${results.layer1MonthlyCost.toFixed(2)}</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "4px 8px" }}>L2 Harness</td>
              <td style={{ textAlign: "right", padding: "4px 8px" }}>${results.layer2CostPerUnit.toFixed(6)}</td>
              <td style={{ textAlign: "right", padding: "4px 8px" }}>${results.layer2MonthlyCost.toFixed(2)}</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "4px 8px" }}>Fixed (amortized)</td>
              <td style={{ textAlign: "right", padding: "4px 8px" }}>—</td>
              <td style={{ textAlign: "right", padding: "4px 8px" }}>${results.monthlyAmortizedFixedCost.toFixed(2)}</td>
            </tr>
            <tr style={{ fontWeight: 600, borderTop: "2px solid #e5e7eb" }}>
              <td style={{ padding: "4px 8px" }}>Total</td>
              <td style={{ textAlign: "right", padding: "4px 8px" }}>${results.totalCostPerUnit.toFixed(6)}</td>
              <td style={{ textAlign: "right", padding: "4px 8px" }}>${results.totalMonthlyCost.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Break-even */}
      {results.breakEvenVolume !== undefined && (
        <div style={{ fontSize: "12px", color: "#6b7280", padding: "8px", background: "#f9fafb", borderRadius: "6px" }}>
          <strong>Break-even volume:</strong> {results.breakEvenVolume.toLocaleString()} {inputs.unitName}s/month
          {results.effectiveMonthlyVolume >= results.breakEvenVolume
            ? " ✅ Currently above break-even"
            : ` (need ${(results.breakEvenVolume - results.effectiveMonthlyVolume).toLocaleString()} more)`}
        </div>
      )}
    </div>
  );
}

function KPICard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "#f9fafb", borderRadius: "8px", padding: "12px",
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function CostValueBar({ cost, value }: { cost: number; value: number }) {
  const max = Math.max(cost, value, 1);
  const costPct = (cost / max) * 100;
  const valuePct = (value / max) * 100;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <span style={{ fontSize: "11px", width: "40px", color: "#6b7280" }}>Cost</span>
        <div style={{ flex: 1, background: "#f3f4f6", borderRadius: "4px", height: "16px" }}>
          <div style={{ width: `${costPct}%`, background: "#ef4444", borderRadius: "4px", height: "100%" }} />
        </div>
        <span style={{ fontSize: "11px", width: "70px", textAlign: "right" }}>${cost.toFixed(0)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "11px", width: "40px", color: "#6b7280" }}>Value</span>
        <div style={{ flex: 1, background: "#f3f4f6", borderRadius: "4px", height: "16px" }}>
          <div style={{ width: `${valuePct}%`, background: "#22c55e", borderRadius: "4px", height: "100%" }} />
        </div>
        <span style={{ fontSize: "11px", width: "70px", textAlign: "right" }}>${value.toFixed(0)}</span>
      </div>
    </div>
  );
}

export default ROIDashboard;
mountWidget(<ROIDashboard />);
