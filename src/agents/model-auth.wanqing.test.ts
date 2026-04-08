import { beforeEach, describe, expect, it } from "vitest";
import { resolveEnvApiKey } from "./model-auth.js";

describe("WanQing Environment Variables", () => {
  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env.WQ_API_KEY;
    delete process.env.WANQING_API_KEY;
  });

  it("should resolve WQ_API_KEY environment variable", () => {
    process.env.WQ_API_KEY = "test-wq-key-123";
    const result = resolveEnvApiKey("wanqing");

    expect(result).toBeDefined();
    expect(result?.apiKey).toBe("test-wq-key-123");
    expect(result?.source).toContain("WQ_API_KEY");
  });

  it("should resolve WANQING_API_KEY as fallback", () => {
    process.env.WANQING_API_KEY = "test-wanqing-key-456";
    const result = resolveEnvApiKey("wanqing");

    expect(result).toBeDefined();
    expect(result?.apiKey).toBe("test-wanqing-key-456");
    expect(result?.source).toContain("WANQING_API_KEY");
  });

  it("should prioritize WQ_API_KEY over WANQING_API_KEY", () => {
    process.env.WQ_API_KEY = "primary-key";
    process.env.WANQING_API_KEY = "fallback-key";
    const result = resolveEnvApiKey("wanqing");

    expect(result).toBeDefined();
    expect(result?.apiKey).toBe("primary-key");
    expect(result?.source).toContain("WQ_API_KEY");
  });

  it("should return null when no WanQing env vars are set", () => {
    const result = resolveEnvApiKey("wanqing");
    expect(result).toBeNull();
  });

  it("should trim whitespace from API key", () => {
    process.env.WQ_API_KEY = "  test-key-with-spaces  ";
    const result = resolveEnvApiKey("wanqing");

    expect(result).toBeDefined();
    expect(result?.apiKey).toBe("test-key-with-spaces");
  });

  it("should return null for empty string API key", () => {
    process.env.WQ_API_KEY = "   ";
    const result = resolveEnvApiKey("wanqing");
    expect(result).toBeNull();
  });
});
