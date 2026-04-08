/**
 * KwaiCLI Agent Runner
 * 集成 kwaicli 到 Clawdbot 的 agent 系统
 */

import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { getKwaiCLISessionManager, KwaiCLISessionManager } from "./kwaicli-process.js";

export interface KwaiCLIAgentParams {
  /** Session ID（用于维持对话上下文） */
  sessionId: string;
  /** 用户问题 */
  message: string;
  /** 工作目录 */
  workspaceDir?: string;
  /** 配置 */
  config?: OpenClawConfig;
  /** 运行时环境 */
  runtime?: RuntimeEnv;
  /** 超时时间 */
  timeout?: number;
  /** 是否使用静默模式 */
  quiet?: boolean;
}

export interface KwaiCLIAgentResult {
  /** 响应内容 */
  response: string;
  /** Session ID */
  sessionId: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 耗时（毫秒） */
  duration?: number;
}

/**
 * 运行 KwaiCLI Agent
 */
export async function runKwaiCLIAgent(params: KwaiCLIAgentParams): Promise<KwaiCLIAgentResult> {
  const startTime = Date.now();
  const runtime = params.runtime || defaultRuntime;

  try {
    // 检查 kwaicli 是否可用
    const available = await KwaiCLISessionManager.checkAvailable();
    if (!available) {
      throw new Error(
        "kwaicli command not found. Please install kwaicli first: https://kwaicli.kuaishou.com/docs/install",
      );
    }

    const manager = getKwaiCLISessionManager();

    // 静默模式：一次性查询，不维持 session
    if (params.quiet) {
      const session = await manager.getOrCreateSession(params.sessionId, {
        cwd: params.workspaceDir,
        quiet: true,
      });

      const response = await session.askQuiet(params.message);

      return {
        response,
        sessionId: params.sessionId,
        success: true,
        duration: Date.now() - startTime,
      };
    }

    // 交互模式：维持 session
    const session = await manager.getOrCreateSession(params.sessionId, {
      cwd: params.workspaceDir,
      timeout: params.timeout,
    });

    // 监听输出（用于流式显示）
    const outputs: string[] = [];
    const outputHandler = (line: string) => {
      outputs.push(line);
      runtime.log(`[kwaicli] ${line}`);
    };

    session.on("output", outputHandler);

    try {
      // 发送问题并等待响应
      const result = await session.ask(params.message, params.timeout);

      session.off("output", outputHandler);

      if (result.error) {
        throw new Error(result.error);
      }

      return {
        response: result.content,
        sessionId: params.sessionId,
        success: true,
        duration: Date.now() - startTime,
      };
    } finally {
      session.off("output", outputHandler);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      response: "",
      sessionId: params.sessionId,
      success: false,
      error: errorMessage,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * 执行 kwaicli commit（生成并提交代码更改）
 */
export async function runKwaiCLICommit(params: {
  sessionId: string;
  workspaceDir?: string;
  staged?: boolean; // -s: stage changes
  confirm?: boolean; // -c: confirm before commit
  runtime?: RuntimeEnv;
}): Promise<KwaiCLIAgentResult> {
  const runtime = params.runtime || defaultRuntime;
  const startTime = Date.now();

  try {
    const { spawn } = await import("node:child_process");

    const args = ["commit"];
    if (params.staged) {
      args.push("-s");
    }
    if (params.confirm) {
      args.push("-c");
    }

    return new Promise((resolve) => {
      const childProcess = spawn("kwaicli", args, {
        cwd: params.workspaceDir || process.cwd(),
        stdio: ["inherit", "pipe", "pipe"],
      });

      let output = "";
      let error = "";

      childProcess.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        output += text;
        runtime.log(text);
      });

      childProcess.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        error += text;
        runtime.error(text);
      });

      childProcess.on("exit", (code: number | null) => {
        resolve({
          response: output.trim(),
          sessionId: params.sessionId,
          success: code === 0,
          error: code !== 0 ? error.trim() : undefined,
          duration: Date.now() - startTime,
        });
      });

      childProcess.on("error", (err: Error) => {
        resolve({
          response: "",
          sessionId: params.sessionId,
          success: false,
          error: err.message,
          duration: Date.now() - startTime,
        });
      });
    });
  } catch (error) {
    return {
      response: "",
      sessionId: params.sessionId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * 执行 kwaicli run（自然语言转命令）
 */
export async function runKwaiCLIRun(params: {
  sessionId: string;
  command?: string;
  workspaceDir?: string;
  runtime?: RuntimeEnv;
}): Promise<KwaiCLIAgentResult> {
  const _runtime = params.runtime || defaultRuntime;
  const startTime = Date.now();

  try {
    const { spawn } = await import("node:child_process");

    const args = ["run"];
    if (params.command) {
      args.push(params.command);
    }

    return new Promise((resolve) => {
      const childProcess = spawn("kwaicli", args, {
        cwd: params.workspaceDir || process.cwd(),
        stdio: "inherit", // 完全继承 stdio，保持交互性
      });

      childProcess.on("exit", (code: number | null) => {
        resolve({
          response: "Command execution completed",
          sessionId: params.sessionId,
          success: code === 0,
          error: code !== 0 ? `Exit code: ${code}` : undefined,
          duration: Date.now() - startTime,
        });
      });

      childProcess.on("error", (err: Error) => {
        resolve({
          response: "",
          sessionId: params.sessionId,
          success: false,
          error: err.message,
          duration: Date.now() - startTime,
        });
      });
    });
  } catch (error) {
    return {
      response: "",
      sessionId: params.sessionId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * 关闭 KwaiCLI session
 */
export function closeKwaiCLISession(sessionId: string): void {
  const manager = getKwaiCLISessionManager();
  manager.closeSession(sessionId);
}

/**
 * 获取所有活跃的 KwaiCLI sessions
 */
export function getActiveKwaiCLISessions(): string[] {
  const manager = getKwaiCLISessionManager();
  return manager.getActiveSessions();
}

/**
 * 检查 KwaiCLI 是否可用
 */
export async function checkKwaiCLIAvailable(): Promise<boolean> {
  return KwaiCLISessionManager.checkAvailable();
}
