# UAT Prompts (ChatGPT App)

Use this list as the baseline UAT suite for manual checks now and automation later.

## Prompt Suite

1. `UAT-001`
Prompt: Load the `support` preset, then run `calculate-roi` and summarize the key ROI metrics.
Expected tool flow: `load-preset` -> `calculate-roi`

2. `UAT-002`
Prompt: Run `calculate-roi` for a customer support use case with `monthlyVolume=10000`, `successRate=92`, and show break-even volume.
Expected tool flow: `calculate-roi`

3. `UAT-003`
Prompt: Use `load-preset` with `invoice`, then tweak `monthlyVolume` to 25000 and re-calculate ROI.
Expected tool flow: `load-preset` -> `calculate-roi`

4. `UAT-004`
Prompt: Calculate ROI using `valueMethod=REVENUE_UPLIFT` with `baselineConversionRate=2.0`, `conversionUpliftAbsolute=0.6`, `averageOrderValue=120`, `grossMargin=55`.
Expected tool flow: `calculate-roi`

5. `UAT-005`
Prompt: Calculate ROI using `valueMethod=RETENTION_UPLIFT` with `baselineChurnRate=1.2`, `churnReductionAbsolute=0.2`, `annualValuePerCustomer=1400`, `customersImpactedPerMonth=2000`.
Expected tool flow: `calculate-roi`

6. `UAT-006`
Prompt: Run `sensitivity-analysis` for the same inputs and tell me which variable has the biggest ROI impact.
Expected tool flow: `sensitivity-analysis`

7. `UAT-007`
Prompt: Compare two scenarios: `support` preset vs `retention` preset. Show ROI, payback months, and net monthly benefit for both.
Expected tool flow: `load-preset` -> `calculate-roi` (twice)

8. `UAT-008`
Prompt: Use very conservative assumptions (`successRate=80`, higher model costs, lower deflection) and tell me if ROI is still positive.
Expected tool flow: `calculate-roi`

9. `UAT-009`
Prompt: Use optimistic assumptions (`successRate=98`, better cache hit rate, higher deflection) and estimate best-case ROI.
Expected tool flow: `calculate-roi`

10. `UAT-010`
Prompt: Find the minimum `monthlyVolume` needed to reach positive ROI for the `invoice` preset.
Expected tool flow: iterative `calculate-roi` calls

## Automation Notes

- Keep test IDs stable (`UAT-001` to `UAT-010`) so future scripts can map results over time.
- Assert at least one expected tool call per test, and validate that no tool call returns `isError=true`.
- For widget tools, assert both:
  - text content includes summary metrics
  - `structuredContent` exists with expected keys
