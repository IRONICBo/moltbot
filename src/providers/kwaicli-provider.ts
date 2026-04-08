/**
 * KwaiCLI Provider Adapter
 * 将 KwaiCLI CLI 包装成标准的 LLM provider，可在 WebUI 和 agent runner 中使用
 */

import { EventEmitter } from "node:events";
import type { OpenClawConfig } from "../config/config.js";
import { getKwaiCLISessionManager } from "./kwaicli-process.js";

/**
 * KwaiCLI 消息格式
 */
export interface KwaiCLIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * KwaiCLI Provider 选项
 */
export interface KwaiCLIProviderOptions {
  /** Session ID（用于保持上下文） */
  sessionId?: string;
  /** 工作区目录 */
  workspaceDir?: string;
  /** 超时时间 */
  timeout?: number;
  /** 是否流式输出 */
  stream?: boolean;
}

/**
 * 流式响应事件
 */
export interface KwaiCLIStreamChunk {
  type: "content" | "done" | "error";
  content?: string;
  error?: string;
}

/**
 * KwaiCLI Provider
 * 实现类似 Anthropic/OpenAI 的接口，但底层使用 CLI
 */
export class KwaiCLIProvider extends EventEmitter {
  private sessionId: string;
  private options: KwaiCLIProviderOptions;

  constructor(options: KwaiCLIProviderOptions = {}) {
    super();
    this.sessionId = options.sessionId || `kwaicli-provider-${Date.now()}`;
    this.options = options;
  }

  /**
   * 发送消息并获取响应（非流式）
   */
  async sendMessage(messages: KwaiCLIMessage[]): Promise<string> {
    // 提取最后一条用户消息
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    if (!lastUserMessage) {
      throw new Error("No user message found");
    }

    const manager = getKwaiCLISessionManager();
    const session = await manager.getOrCreateSession(this.sessionId, {
      cwd: this.options.workspaceDir,
      timeout: this.options.timeout,
    });

    const response = await session.ask(lastUserMessage.content, this.options.timeout);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.content;
  }

  /**
   * 发送消息并获取流式响应
   */
  async *streamMessage(messages: KwaiCLIMessage[]): AsyncGenerator<KwaiCLIStreamChunk> {
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    if (!lastUserMessage) {
      throw new Error("No user message found");
    }

    const manager = getKwaiCLISessionManager();
    const session = await manager.getOrCreateSession(this.sessionId, {
      cwd: this.options.workspaceDir,
      timeout: this.options.timeout,
    });

    // 监听实时输出
    let buffer = "";
    const outputHandler = (line: string) => {
      buffer += line + "\n";
    };

    session.on("output", outputHandler);

    try {
      // 发送问题
      const responsePromise = session.ask(lastUserMessage.content, this.options.timeout);

      // 轮询输出
      const pollInterval = 100; // 100ms
      let lastLength = 0;

      while (true) {
        // 检查是否有新内容
        if (buffer.length > lastLength) {
          const newContent = buffer.slice(lastLength);
          lastLength = buffer.length;

          yield {
            type: "content",
            content: newContent,
          };
        }

        // 检查是否完成
        try {
          const result = await Promise.race([
            responsePromise,
            new Promise((resolve) => setTimeout(() => resolve(null), pollInterval)),
          ]);

          if (result !== null) {
            // 完成了
            const response = result as Awaited<ReturnType<typeof session.ask>>;

            if (response.error) {
              yield {
                type: "error",
                error: response.error,
              };
            } else {
              // 发送剩余内容
              if (buffer.length > lastLength) {
                yield {
                  type: "content",
                  content: buffer.slice(lastLength),
                };
              }

              yield {
                type: "done",
              };
            }
            break;
          }
        } catch (error) {
          yield {
            type: "error",
            error: error instanceof Error ? error.message : String(error),
          };
          break;
        }
      }
    } finally {
      session.off("output", outputHandler);
    }
  }

  /**
   * 关闭 session
   */
  close(): void {
    const manager = getKwaiCLISessionManager();
    manager.closeSession(this.sessionId);
  }

  /**
   * 获取 session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

/**
 * 创建 KwaiCLI provider 实例
 */
export function createKwaiCLIProvider(
  config?: OpenClawConfig,
  options?: KwaiCLIProviderOptions,
): KwaiCLIProvider {
  const workspaceDir = options?.workspaceDir || config?.agents?.defaults?.workspace;

  return new KwaiCLIProvider({
    ...options,
    workspaceDir,
  });
}

/**
 * 检查 KwaiCLI provider 是否可用
 */
export async function isKwaiCLIProviderAvailable(): Promise<boolean> {
  const { checkKwaiCLIAvailable } = await import("./kwaicli-agent-runner.js");
  return checkKwaiCLIAvailable();
}
