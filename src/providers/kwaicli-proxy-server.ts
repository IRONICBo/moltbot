/**
 * KwaiCLI Local Proxy Server
 *
 * Creates a local HTTP server that implements OpenAI-compatible API
 * and forwards requests to the KwaiCLI subprocess.
 *
 * This allows KwaiCLI to work with pi-ai's model system without modification.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getKwaiCLISessionManager } from "./kwaicli-process.js";

const DEFAULT_PORT = 27849;
const DEFAULT_HOST = "127.0.0.1";

export interface KwaiCLIProxyServerOptions {
  port?: number;
  host?: string;
  workspaceDir?: string;
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
}

interface OpenAIChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

interface OpenAIChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Clean ANSI escape codes and control characters from text
 */
function cleanOutput(text: string): string {
  // Remove ANSI escape codes (ESC [ ... letter)
  // eslint-disable-next-line no-control-regex
  let cleaned = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  // Remove other common control characters
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x00-\x1f\x7f]/g, " ");
  // Remove ASCII art boxes and decorations
  cleaned = cleaned.replace(/[█▄▀▌▐▖▗▘▝▞▚▟▙▛▜▀]/g, "");
  // Remove separator lines
  cleaned = cleaned.replace(/^[─┌┐└┘├┤│┼┴┬]+$/gm, "");
  // Remove common banner patterns
  cleaned = cleaned.replace(/^[K.?W.?A.?I.?P.?I.?L.?O.?T.?]+.*$/gm, "");
  // Remove "Tips to getting started" and similar
  cleaned = cleaned.replace(/^Tips to getting started:.*$/gm, "");
  cleaned = cleaned.replace(/^\d+\.\s+.*$/gm, ""); // Numbered lists from banner
  // Clean up multiple spaces and newlines
  cleaned = cleaned.replace(/\s{3,}/g, " ");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

/**
 * Parse JSON body from request
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Generate unique ID for responses
 */
function generateId(): string {
  return `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Handle /v1/chat/completions endpoint
 */
async function handleChatCompletions(
  req: IncomingMessage,
  res: ServerResponse,
  _workspaceDir?: string,
): Promise<void> {
  try {
    const body = (await parseBody(req)) as OpenAIChatCompletionRequest;
    const { messages, stream = false, model = "kwaicli-code-latest" } = body;

    if (!messages || !Array.isArray(messages)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "messages field is required" }));
      return;
    }

    // Get session manager
    const sessionManager = getKwaiCLISessionManager();
    const sessionId = `proxy-${Date.now()}`;

    // Get the last user message
    const userMessages = messages.filter((msg) => msg.role === "user");
    const lastMessage = userMessages[userMessages.length - 1];

    if (!lastMessage) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no user message found" }));
      return;
    }

    const requestId = generateId();
    const created = Math.floor(Date.now() / 1000);

    try {
      // Get or create session
      const session = await sessionManager.getOrCreateSession(sessionId);

      if (stream) {
        // Streaming response
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        const response = await session.ask(lastMessage.content);

        if (response.error) {
          res.write(`data: ${JSON.stringify({ error: response.error })}\n\n`);
          res.end();
          return;
        }

        // Clean the output
        const cleanedContent = cleanOutput(response.content);

        // Send initial chunk with role
        const firstChunk: OpenAIChatCompletionChunk = {
          id: requestId,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: cleanedContent,
              },
              finish_reason: null,
            },
          ],
        };
        res.write(`data: ${JSON.stringify(firstChunk)}\n\n`);

        // Send final chunk
        const finalChunk: OpenAIChatCompletionChunk = {
          id: requestId,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
            },
          ],
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        // Non-streaming response
        const response = await session.ask(lastMessage.content);

        if (response.error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: response.error }));
          return;
        }

        // Clean the output
        const cleanedContent = cleanOutput(response.content);

        const completionResponse: OpenAIChatCompletionResponse = {
          id: requestId,
          object: "chat.completion",
          created,
          model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: cleanedContent,
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(completionResponse));
      }
    } catch (error) {
      console.error("KwaiCLI error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(error) }));
    }
  } catch (error) {
    console.error("Request handling error:", error);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(error) }));
  }
}

/**
 * Handle /v1/models endpoint
 */
async function handleModels(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const response = {
    object: "list",
    data: [
      {
        id: "kwaicli-code-latest",
        object: "model",
        created: Date.now(),
        owned_by: "kwaicli",
      },
      {
        id: "kwaicli-chat",
        object: "model",
        created: Date.now(),
        owned_by: "kwaicli",
      },
      {
        id: "kwaicli-vision",
        object: "model",
        created: Date.now(),
        owned_by: "kwaicli",
      },
    ],
  };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response));
}

/**
 * Create and start KwaiCLI proxy server
 */
export function createKwaiCLIProxyServer(
  options: KwaiCLIProxyServerOptions = {},
): Promise<{ port: number; host: string; close: () => Promise<void> }> {
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;
  const { workspaceDir } = options;

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = req.url || "/";

      if (url === "/v1/chat/completions" && req.method === "POST") {
        await handleChatCompletions(req, res, workspaceDir);
      } else if (url === "/v1/models" && req.method === "GET") {
        await handleModels(req, res);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    server.on("error", reject);

    server.listen(port, host, () => {
      console.log(`KwaiCLI proxy server listening on http://${host}:${port}`);
      resolve({
        port,
        host,
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((err) => {
              if (err) {
                rejectClose(err);
              } else {
                resolveClose();
              }
            });
          }),
      });
    });
  });
}

// Singleton instance
let proxyServerInstance: Awaited<ReturnType<typeof createKwaiCLIProxyServer>> | null = null;

/**
 * Get or create proxy server instance
 */
export async function getKwaiCLIProxyServer(
  options: KwaiCLIProxyServerOptions = {},
): Promise<Awaited<ReturnType<typeof createKwaiCLIProxyServer>>> {
  if (!proxyServerInstance) {
    proxyServerInstance = await createKwaiCLIProxyServer(options);
  }
  return proxyServerInstance;
}

/**
 * Stop proxy server
 */
export async function stopKwaiCLIProxyServer(): Promise<void> {
  if (proxyServerInstance) {
    await proxyServerInstance.close();
    proxyServerInstance = null;
  }
}
