import { describe, expect, it } from "vitest";
import {
  buildWanQingModelDefinition,
  WANQING_BASE_URL,
  WANQING_DEFAULT_ENDPOINT_ID,
  WANQING_DEFAULT_MODEL_REF,
  WANQING_DEFAULT_CONTEXT_WINDOW,
  WANQING_DEFAULT_MAX_TOKENS,
} from "./onboard-auth.models-wanqing.js";

describe("WanQing Models", () => {
  it("should have correct base URL", () => {
    expect(WANQING_BASE_URL).toBe("https://wanqing-api.corp.kuaishou.com/api/gateway/v1/endpoints");
  });

  it("should have correct default endpoint ID", () => {
    expect(WANQING_DEFAULT_ENDPOINT_ID).toBe("ep-e9abjh-1768058083249666631");
  });

  it("should have correct default model ref", () => {
    expect(WANQING_DEFAULT_MODEL_REF).toBe("wanqing/ep-e9abjh-1768058083249666631");
  });

  it("should have correct default context window", () => {
    expect(WANQING_DEFAULT_CONTEXT_WINDOW).toBe(200000);
  });

  it("should have correct default max tokens", () => {
    expect(WANQING_DEFAULT_MAX_TOKENS).toBe(8192);
  });

  it("should build WanQing model definition with defaults", () => {
    const model = buildWanQingModelDefinition({
      endpointId: "ep-test-123",
    });

    expect(model).toMatchObject({
      id: "ep-test-123",
      name: "WanQing ep-test-123",
      reasoning: false,
      input: ["text"],
      contextWindow: 200000,
      maxTokens: 8192,
    });

    expect(model.cost).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });

  it("should build WanQing model definition with custom name", () => {
    const model = buildWanQingModelDefinition({
      endpointId: "ep-custom-456",
      name: "Custom WanQing Model",
    });

    expect(model.name).toBe("Custom WanQing Model");
  });

  it("should build WanQing model definition with custom context window", () => {
    const model = buildWanQingModelDefinition({
      endpointId: "ep-test-789",
      contextWindow: 128000,
      maxTokens: 4096,
    });

    expect(model.contextWindow).toBe(128000);
    expect(model.maxTokens).toBe(4096);
  });

  it("should build WanQing model definition with reasoning enabled", () => {
    const model = buildWanQingModelDefinition({
      endpointId: "ep-reasoning-001",
      reasoning: true,
    });

    expect(model.reasoning).toBe(true);
  });
});
