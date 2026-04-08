/**
 * KwaiCLI Stream Function for Pi-AI compatibility
 * This file is currently unused as we use the HTTP proxy server instead.
 * Kept for future reference if we need direct streaming integration.
 */

// Placeholder - actual streaming is handled by the proxy server
export function streamKwaiCLI(): AsyncGenerator<never> {
  throw new Error("Direct streaming not implemented - use HTTP proxy server instead");
}

export const kwaicliStreamFunction = streamKwaiCLI;
