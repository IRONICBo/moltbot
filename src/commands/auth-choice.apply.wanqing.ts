import { resolveEnvApiKey } from "../agents/model-auth.js";
import { applyAuthProfileConfig } from "../plugins/provider-auth-helpers.js";
import {
  formatApiKeyPreview,
  normalizeApiKeyInput,
  validateApiKeyInput,
} from "./auth-choice.api-key.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyDefaultModelChoice } from "./auth-choice.default-model.js";
import {
  applyWanQingConfig,
  applyWanQingProviderConfig,
  setWanQingApiKey,
} from "./onboard-auth.config-wanqing.js";

export async function applyAuthChoiceWanQing(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "wanqing-api-key") {
    return null;
  }

  let nextConfig = params.config;
  let agentModelOverride: string | undefined;

  const noteAgentModel = async (model: string) => {
    if (!params.agentId) {
      return;
    }
    await params.prompter.note(
      `Default model set to ${model} for agent "${params.agentId}".`,
      "Model configured",
    );
  };

  // Check for existing API key in environment
  let hasCredential = false;
  const envKey = resolveEnvApiKey("wanqing");
  if (envKey) {
    const useExisting = await params.prompter.confirm({
      message: `Use existing WQ_API_KEY (${envKey.source}, ${formatApiKeyPreview(envKey.apiKey)})?`,
      initialValue: true,
    });
    if (useExisting) {
      await setWanQingApiKey(envKey.apiKey, params.agentDir);
      hasCredential = true;
    }
  }

  // Prompt for API key if not found
  if (!hasCredential) {
    const key = await params.prompter.text({
      message: "Enter WanQing API key (WQ_API_KEY)",
      validate: validateApiKeyInput,
    });
    await setWanQingApiKey(normalizeApiKeyInput(String(key)), params.agentDir);
  }

  // Prompt for endpoint ID
  const endpointId = await params.prompter.text({
    message: "Enter WanQing endpoint ID",
    validate: (value) => {
      const str = String(value).trim();
      if (!str) {
        return "Endpoint ID is required";
      }
      if (!str.startsWith("ep-")) {
        return "Endpoint ID should start with 'ep-'";
      }
      return undefined;
    },
  });

  // Apply auth profile
  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId: "wanqing:default",
    provider: "wanqing",
    mode: "api_key",
  });

  // Apply model configuration
  const modelRef = `wanqing/${endpointId}`;
  const applied = await applyDefaultModelChoice({
    config: nextConfig,
    setDefaultModel: params.setDefaultModel,
    defaultModel: modelRef,
    applyDefaultConfig: (config) => applyWanQingConfig(config, String(endpointId)),
    applyProviderConfig: (config) => applyWanQingProviderConfig(config, String(endpointId)),
    noteAgentModel,
    prompter: params.prompter,
  });

  nextConfig = applied.config;
  agentModelOverride = applied.agentModelOverride ?? agentModelOverride;

  return { config: nextConfig, agentModelOverride };
}
