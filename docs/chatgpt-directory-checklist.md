# ChatGPT Directory Checklist

Last reviewed: March 10, 2026

This app is best treated as a `submission-ready` React widget app:

- MCP server entrypoint: `server/src/index.ts`
- Widget entrypoint: `web/src/widgets/calculate-roi-v4/index.tsx`
- Public MCP endpoint: `/mcp`

## Sources used

- Alpic checklist article (December 18, 2025): <https://alpic.ai/blog/how-to-submit-your-app-to-the-chatgpt-directory>
- OpenAI Apps SDK, build your MCP server: <https://developers.openai.com/apps-sdk/build/mcp-server>
- OpenAI Apps SDK, build your ChatGPT UI: <https://developers.openai.com/apps-sdk/build/chatgpt-ui>
- OpenAI Apps SDK, define tools: <https://developers.openai.com/apps-sdk/plan/tools>
- OpenAI Apps SDK, submit and maintain your app: <https://developers.openai.com/apps-sdk/deploy/submission>
- OpenAI Apps SDK, app submission guidelines: <https://developers.openai.com/apps-sdk/app-submission-guidelines>

## Repo status

| Requirement | Status | Notes |
| --- | --- | --- |
| Remote MCP server on `/mcp` | Ready | App already runs as a Skybridge MCP server. |
| Explicit tool annotations | Ready | All tools now set `readOnlyHint`, `openWorldHint`, and `destructiveHint`. |
| Clear tool descriptions | Ready | Tool descriptions now start with usage guidance for model selection. |
| Widget domain + CSP | Conditional | Code supports this through env vars, but production values still need to be set. |
| Domain verification route | Conditional | `/.well-known/openai-apps-challenge` is implemented, but `OPENAI_APPS_CHALLENGE` still needs a real token. |
| OAuth + test account | Not needed today | This app is anonymous and does not require account linking. Revisit if auth is added. |
| Privacy policy URL | Missing | Needs a real public URL before submission. |
| Terms of service URL | Missing | Needs a real public URL before submission. |
| Support contact/page | Missing | Needs a public support email or support page. |
| Light and dark logos | Missing | Prepare 64x64 assets for both modes. |
| Screenshots | Missing | Prepare at least 3 screenshots, up to 4 total. |
| Video demo | Missing | Keep it short and show the real in-product flow. |
| 5 positive test cases | Drafted below | Replace draft expectations with captured production responses before submission. |
| 3 negative test cases | Drafted below | Keep them narrowly outside the calculator's scope. |
| OpenAI business verification | External | Must be completed in the OpenAI Platform dashboard. |

## Production env vars

Set these in the deployed environment:

- `PUBLIC_APP_ORIGIN=https://your-app.example.com`
- `OPENAI_APPS_CHALLENGE=<token from OpenAI>`
- `WIDGET_CONNECT_DOMAINS=` optional comma-separated override
- `WIDGET_RESOURCE_DOMAINS=` optional comma-separated override
- `WIDGET_REDIRECT_DOMAINS=` optional comma-separated override
- `WIDGET_FRAME_DOMAINS=` optional comma-separated override

Expected behavior after configuration:

- `/.well-known/openai-apps-challenge` returns the verification token as plain text
- Widget metadata advertises the exact production domain and exact CSP origins

## Draft submission copy

- App name: `AI ROI Calculator`
- Subtitle: `Model the business case for AI projects in minutes`
- Suggested category: `Business` or `Developer Tools`
- Developer name: replace with your verified individual or business name
- Website URL: replace with the public marketing or product page

## Draft positive test cases

Use the exact MCP tool names in the submission form. Before submitting, capture the exact production JSON response for each case and paste that into the review form instead of these summaries.

1. Scenario: `Support preset ROI dashboard`
Prompt: `Calculate the ROI for a customer support bot using the default support preset and show the dashboard.`
Expected tool: `calculate-roi-v4`
Expected result: returns `structuredContent.inputs.preset = "support"` and dashboard metrics in `structuredContent.results`.

2. Scenario: `Preset lookup only`
Prompt: `Load the default preset for knowledge Q&A without changing any values.`
Expected tool: `load-preset`
Expected result: returns preset inputs for `knowledgeQA` plus a rendered ROI dashboard payload.

3. Scenario: `Custom ROI override`
Prompt: `Calculate ROI for invoice processing with the invoice preset, monthly volume 12000, and success rate 92%.`
Expected tool: `calculate-roi-v4`
Expected result: returns invoice-based inputs with the two overrides applied and a recalculated ROI summary.

4. Scenario: `Sensitivity analysis`
Prompt: `For the premium features preset, run a sensitivity analysis and tell me which assumption matters most.`
Expected tool: `sensitivity-analysis`
Expected result: returns `structuredContent.sensitivity` sorted by largest ROI swing first.

5. Scenario: `Marketing scenario`
Prompt: `Use the marketing content preset and calculate ROI over 18 months for 5000 monthly assets.`
Expected tool: `calculate-roi-v4`
Expected result: returns marketing-content inputs with the 18-month horizon and 5000-volume override.

## Draft negative test cases

1. Scenario: `Unrelated travel request`
Prompt: `Find me the cheapest flights from Budapest to Tokyo next month.`
Expected behavior: no tool should be called because the request is outside ROI analysis.

2. Scenario: `Legal interpretation`
Prompt: `Write a privacy policy for my SaaS business.`
Expected behavior: no tool should be called because the app does not generate legal documents.

3. Scenario: `Company research`
Prompt: `Compare OpenAI and Anthropic pricing for enterprise contracts.`
Expected behavior: no tool should be called because the app is not a research or web-search tool.

## Remaining submission work outside the repo

- Complete OpenAI individual or business verification under the exact published name.
- Publish privacy policy, terms, and support contact URLs on a public domain.
- Record the demo video.
- Capture 3 to 4 clean screenshots without ChatGPT prompts overlaid.
- Capture exact production responses for the drafted test prompts.
- Choose country availability and any non-English localized app name/subtitle variants.
