/**
 * WanQing auth config helpers
 */

import type { OpenClawConfig } from "../config/config.js";
import {
  buildWanQingModelDefinition,
  WANQING_BASE_URL,
  WANQING_DEFAULT_ENDPOINT_ID,
} from "./onboard-auth.models-wanqing.js";

export async function setWanQingApiKey(apiKey: string, agentDir?: string): Promise<void> {
  const { resolveOpenClawAgentDir } = await import("../agents/agent-paths.js");
  const { upsertAuthProfile } = await import("../agents/auth-profiles.js");

  upsertAuthProfile({
    profileId: "wanqing:default",
    credential: {
      type: "api_key",
      provider: "wanqing",
      key: apiKey,
    },
    agentDir: agentDir ?? resolveOpenClawAgentDir(),
  });
}

export function applyWanQingConfig(
  config: OpenClawConfig,
  endpointId: string = WANQING_DEFAULT_ENDPOINT_ID,
): OpenClawConfig {
  return {
    ...config,
    agents: {
      ...config.agents,
      defaults: {
        ...config.agents?.defaults,
        model: {
          ...(typeof config.agents?.defaults?.model === "object"
            ? config.agents.defaults.model
            : {}),
          primary: `wanqing/${endpointId}`,
        },
      },
    },
  };
}

export function applyWanQingProviderConfig(
  config: OpenClawConfig,
  endpointId: string = WANQING_DEFAULT_ENDPOINT_ID,
): OpenClawConfig {
  const existingWanQing = config.models?.providers?.wanqing;
  const models =
    existingWanQing && typeof existingWanQing === "object" && "models" in existingWanQing
      ? existingWanQing.models
      : [];

  const hasEndpoint = Array.isArray(models) ? models.some((m) => m.id === endpointId) : false;

  return {
    ...config,
    models: {
      ...config.models,
      providers: {
        ...config.models?.providers,
        wanqing: {
          baseUrl: WANQING_BASE_URL,
          api: "openai-completions",
          models: hasEndpoint
            ? models
            : [
                ...(Array.isArray(models) ? models : []),
                buildWanQingModelDefinition({ endpointId }),
              ],
        },
      },
    },
  };
}
