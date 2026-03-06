import "@/index.css";
import { mountWidget } from "skybridge/web";
import { useToolInfo } from "../../helpers.js";

interface AnalysisItem {
  variable: string;
  low: number;
  baseline: number;
  high: number;
  spread: number;
}

interface SensitivityOutput {
  baseline: number;
  analysis: AnalysisItem[];
  inputs: { useCaseName: string };
}

function SensitivityChart() {
  const { output } = useToolInfo();

  if (!output) {
    return <div className="p-6 text-center text-gray-500">Analyzing...</div>;
  }

  const { baseline, analysis, inputs } = output as SensitivityOutput;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "16px", maxWidth: "640px" }}>
      <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}>
        Sensitivity Analysis
      </h2>
      <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "16px" }}>
        {inputs.useCaseName} · Baseline ROI: {baseline.toFixed(1)}%
      </p>

      {/* Tornado Chart */}
      <div style={{ marginBottom: "16px" }}>
        {(analysis as AnalysisItem[]).map((item) => (
          <TornadoBar
            key={item.variable}
            item={item}
            baseline={baseline}
            maxSpread={Math.max(...(analysis as AnalysisItem[]).map((a) => a.spread))}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "#6b7280", marginBottom: "12px" }}>
        <span>🔴 -20% change</span>
        <span>⚪ Baseline ({baseline.toFixed(1)}%)</span>
        <span>🟢 +20% change</span>
      </div>

      {/* Insight */}
      <div style={{
        fontSize: "12px", padding: "10px", background: "#eff6ff",
        borderRadius: "6px", borderLeft: "3px solid #3b82f6",
      }}>
        <strong>Key insight:</strong> ROI is most sensitive to{" "}
        <strong>{(analysis as AnalysisItem[])[0]?.variable}</strong> changes
        (±{((analysis as AnalysisItem[])[0]?.spread / 2).toFixed(1)}pp ROI swing per 20% change).
        {(analysis as AnalysisItem[])[0]?.variable === "Value" &&
          " Focus on maximizing business value realization."}
        {(analysis as AnalysisItem[])[0]?.variable === "Costs" &&
          " Negotiate better model pricing or optimize harness costs."}
        {(analysis as AnalysisItem[])[0]?.variable === "Volume" &&
          " Scaling volume is the biggest ROI lever."}
        {(analysis as AnalysisItem[])[0]?.variable === "Success Rate" &&
          " Improving AI accuracy has the biggest ROI impact."}
      </div>
    </div>
  );
}

function TornadoBar({
  item,
  baseline,
  maxSpread,
}: {
  item: AnalysisItem;
  baseline: number;
  maxSpread: number;
}) {
  // Scale bars relative to max spread
  const scale = maxSpread > 0 ? 100 / maxSpread : 1;
  const lowDelta = item.low - baseline;
  const highDelta = item.high - baseline;

  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
        {item.variable}
        <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: "8px" }}>
          {item.low.toFixed(1)}% → {item.high.toFixed(1)}%
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", height: "20px" }}>
        {/* Left (negative) side */}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          {lowDelta < 0 && (
            <div
              style={{
                width: `${Math.abs(lowDelta) * scale}%`,
                background: "#ef4444",
                borderRadius: "3px 0 0 3px",
                height: "16px",
                minWidth: "2px",
              }}
            />
          )}
        </div>
        {/* Center line */}
        <div style={{ width: "2px", background: "#9ca3af", height: "20px" }} />
        {/* Right (positive) side */}
        <div style={{ flex: 1 }}>
          {highDelta > 0 && (
            <div
              style={{
                width: `${Math.abs(highDelta) * scale}%`,
                background: "#22c55e",
                borderRadius: "0 3px 3px 0",
                height: "16px",
                minWidth: "2px",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default SensitivityChart;
mountWidget(<SensitivityChart />);
