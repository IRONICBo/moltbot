/**
 * KwaiCLI model definitions
 */

export const KWAICLI_BASE_URL = "https://api.kwaicli.com/v1";
export const KWAICLI_DEFAULT_MODEL_ID = "kwaicli-code-latest";
export const KWAICLI_DEFAULT_MODEL_REF = `kwaicli/${KWAICLI_DEFAULT_MODEL_ID}`;

export function buildKwaiCLIModelDefinition(id: string) {
  return {
    id,
    name: `KwaiCLI ${id}`,
    reasoning: false,
    input: ["text" as const],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 4096,
  };
}
