import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { applyWanQingConfig, applyWanQingProviderConfig } from "./onboard-auth.config-wanqing.js";
import { WANQING_BASE_URL } from "./onboard-auth.models-wanqing.js";

describe("WanQing Config", () => {
  describe("applyWanQingConfig", () => {
    it("should set primary model to default endpoint ID", () => {
      const config: OpenClawConfig = {};
      const result = applyWanQingConfig(config);

      const model = result.agents?.defaults?.model;
      expect(typeof model === "object" ? model.primary : undefined).toBe(
        "wanqing/ep-e9abjh-1768058083249666631",
      );
    });

    it("should set primary model to custom endpoint ID", () => {
      const config: OpenClawConfig = {};
      const result = applyWanQingConfig(config, "ep-custom-123");

      const model = result.agents?.defaults?.model;
      expect(typeof model === "object" ? model.primary : undefined).toBe("wanqing/ep-custom-123");
    });

    it("should preserve existing agent config", () => {
      const config: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: "~/custom-workspace",
          },
        },
      };
      const result = applyWanQingConfig(config);

      expect(result.agents?.defaults?.workspace).toBe("~/custom-workspace");
      const model = result.agents?.defaults?.model;
      expect(typeof model === "object" ? model.primary : undefined).toBe(
        "wanqing/ep-e9abjh-1768058083249666631",
      );
    });
  });

  describe("applyWanQingProviderConfig", () => {
    it("should add WanQing provider with default endpoint", () => {
      const config: OpenClawConfig = {};
      const result = applyWanQingProviderConfig(config);

      expect(result.models?.providers?.wanqing).toBeDefined();
      expect(result.models?.providers?.wanqing?.baseUrl).toBe(WANQING_BASE_URL);
      expect(result.models?.providers?.wanqing?.models).toHaveLength(1);
      expect(result.models?.providers?.wanqing?.models?.[0]?.id).toBe(
        "ep-e9abjh-1768058083249666631",
      );
    });

    it("should add WanQing provider with custom endpoint", () => {
      const config: OpenClawConfig = {};
      const result = applyWanQingProviderConfig(config, "ep-custom-456");

      expect(result.models?.providers?.wanqing?.models?.[0]?.id).toBe("ep-custom-456");
    });

    it("should not duplicate existing endpoint", () => {
      const config: OpenClawConfig = {
        models: {
          providers: {
            wanqing: {
              baseUrl: WANQING_BASE_URL,
              models: [
                {
                  id: "ep-existing-789",
                  name: "Existing Model",
                  reasoning: false,
                  input: ["text"],
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                  contextWindow: 200000,
                  maxTokens: 8192,
                },
              ],
            },
          },
        },
      };

      const result = applyWanQingProviderConfig(config, "ep-existing-789");

      expect(result.models?.providers?.wanqing?.models).toHaveLength(1);
      expect(result.models?.providers?.wanqing?.models?.[0]?.id).toBe("ep-existing-789");
    });

    it("should add new endpoint to existing models", () => {
      const config: OpenClawConfig = {
        models: {
          providers: {
            wanqing: {
              baseUrl: WANQING_BASE_URL,
              models: [
                {
                  id: "ep-existing-001",
                  name: "Existing Model",
                  reasoning: false,
                  input: ["text"],
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                  contextWindow: 200000,
                  maxTokens: 8192,
                },
              ],
            },
          },
        },
      };

      const result = applyWanQingProviderConfig(config, "ep-new-002");

      expect(result.models?.providers?.wanqing?.models).toHaveLength(2);
      expect(result.models?.providers?.wanqing?.models?.[0]?.id).toBe("ep-existing-001");
      expect(result.models?.providers?.wanqing?.models?.[1]?.id).toBe("ep-new-002");
    });

    it("should preserve other provider configs", () => {
      const config: OpenClawConfig = {
        models: {
          providers: {
            anthropic: {
              baseUrl: "https://api.anthropic.com/v1",
              models: [
                {
                  id: "claude-3-5-sonnet",
                  name: "Claude 3.5 Sonnet",
                  reasoning: false,
                  input: ["text"],
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                  contextWindow: 200000,
                  maxTokens: 8192,
                },
              ],
            },
          },
        },
      };

      const result = applyWanQingProviderConfig(config);

      expect(result.models?.providers?.anthropic).toBeDefined();
      expect(result.models?.providers?.wanqing).toBeDefined();
    });
  });
});
