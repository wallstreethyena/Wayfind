// Scheduled Florida editorial work has its own approved Carbon budget.
export const CARBON_EDITORIAL_MODEL = "gemini-4-carbon";
export const CARBON_EDITORIAL_MAX_BYTES = 12 * 1024;
export const CARBON_EDITORIAL_MAX_OUTPUT_TOKENS = 3200;
export const CARBON_EDITORIAL_LANE = Object.freeze({ sku: "gemini_editorial_carbon", cap: 124, timeoutMs: 27_000 });
