import type { ModelDefinitionConfig } from "../config/types.models.js";

// WanQing API endpoint (办公网)
// 注意: baseURL 应设置为 /endpoints，系统会自动添加 /chat/completions
export const WANQING_BASE_URL = "https://wanqing-api.corp.kuaishou.com/api/gateway/v1/endpoints";

// Default model configuration
export const WANQING_DEFAULT_ENDPOINT_ID = "ep-e9abjh-1768058083249666631";
export const WANQING_DEFAULT_MODEL_REF = `wanqing/${WANQING_DEFAULT_ENDPOINT_ID}`;
export const WANQING_DEFAULT_CONTEXT_WINDOW = 200000;
export const WANQING_DEFAULT_MAX_TOKENS = 8192;

// Pricing: WanQing internal pricing (can be overridden in models.json)
export const WANQING_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export function buildWanQingModelDefinition(params: {
  endpointId: string;
  name?: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
}): ModelDefinitionConfig {
  return {
    id: params.endpointId,
    name: params.name ?? `WanQing ${params.endpointId}`,
    reasoning: params.reasoning ?? false,
    input: ["text"],
    cost: WANQING_DEFAULT_COST,
    contextWindow: params.contextWindow ?? WANQING_DEFAULT_CONTEXT_WINDOW,
    maxTokens: params.maxTokens ?? WANQING_DEFAULT_MAX_TOKENS,
  };
}
