/**
 * KwaiCLI 子进程管理
 * 通过 stdin/stdout 与 kwaicli CLI 工具交互
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

export interface KwaiCLIProcessOptions {
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: NodeJS.ProcessEnv;
  /** 静默模式 */
  quiet?: boolean;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 初始 prompt */
  initialPrompt?: string;
}

export interface KwaiCLIResponse {
  /** 响应内容 */
  content: string;
  /** 是否完成 */
  done: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * KwaiCLI 进程会话
 */
export class KwaiCLISession extends EventEmitter {
  private process: ChildProcess | null = null;
  private readline: ReadlineInterface | null = null;
  private outputBuffer: string[] = [];
  private errorBuffer: string[] = [];
  private isReady = false;
  private currentPromptResolve: ((value: KwaiCLIResponse) => void) | null = null;
  private sessionId: string;
  private options: KwaiCLIProcessOptions;

  constructor(sessionId: string, options: KwaiCLIProcessOptions = {}) {
    super();
    this.sessionId = sessionId;
    this.options = options;
  }

  /**
   * 启动 kwaicli 进程
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error("KwaiCLI process already started");
    }

    return new Promise((resolve, reject) => {
      const args: string[] = [];

      // 添加初始 prompt（如果有）
      if (this.options.initialPrompt) {
        args.push(this.options.initialPrompt);
      }

      // 启动子进程
      this.process = spawn("kwaicli", args, {
        cwd: this.options.cwd || process.cwd(),
        env: {
          ...process.env,
          ...this.options.env,
          // 确保是交互模式，禁用所有格式化输出
          FORCE_COLOR: "0",
          NO_COLOR: "1",
          TERM: "dumb",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (!this.process.stdout || !this.process.stdin || !this.process.stderr) {
        reject(new Error("Failed to create process stdio"));
        return;
      }

      // 设置 readline 接口
      this.readline = createInterface({
        input: this.process.stdout,
        terminal: false,
      });

      // 监听输出
      this.readline.on("line", (line) => {
        this.handleOutputLine(line);
      });

      // 监听错误输出
      this.process.stderr.on("data", (data) => {
        const text = data.toString();
        this.errorBuffer.push(text);
        this.emit("error-output", text);
      });

      // 监听进程退出
      this.process.on("exit", (code, signal) => {
        this.emit("exit", { code, signal });
        this.cleanup();
      });

      // 监听进程错误
      this.process.on("error", (error) => {
        this.emit("error", error);
        reject(error);
      });

      // 等待进程就绪
      setTimeout(() => {
        this.isReady = true;
        this.emit("ready");
        resolve();
      }, 500); // 给 kwaicli 一点启动时间
    });
  }

  /**
   * 处理输出行
   */
  private handleOutputLine(line: string): void {
    // 过滤掉提示符和控制字符
    const cleaned = line.trim();

    if (!cleaned) {
      return;
    }

    // 检测是否是新的提示符（kwaicli 通常以 > 或类似符号作为提示符）
    if (cleaned.match(/^[>›❯]\s*$/)) {
      // 提示符出现，表示上一个响应完成
      if (this.currentPromptResolve) {
        const content = this.outputBuffer.join("\n").trim();
        this.currentPromptResolve({
          content,
          done: true,
        });
        this.currentPromptResolve = null;
        this.outputBuffer = [];
      }
      return;
    }

    // 累积输出
    this.outputBuffer.push(cleaned);
    this.emit("output", cleaned);
  }

  /**
   * 发送问题到 kwaicli
   */
  async ask(question: string, timeout?: number): Promise<KwaiCLIResponse> {
    if (!this.process || !this.process.stdin) {
      throw new Error("KwaiCLI process not started");
    }

    if (!this.isReady) {
      throw new Error("KwaiCLI process not ready");
    }

    // 清空输出缓冲区
    this.outputBuffer = [];
    this.errorBuffer = [];

    return new Promise((resolve, reject) => {
      const timeoutMs = timeout || this.options.timeout || 30000;
      let timeoutHandle: NodeJS.Timeout | null = null;

      // 设置超时
      if (timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          this.currentPromptResolve = null;
          reject(new Error(`KwaiCLI response timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      // 设置响应处理器
      this.currentPromptResolve = (response) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        resolve(response);
      };

      // 发送问题
      try {
        this.process!.stdin!.write(question + "\n");
      } catch (error) {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        this.currentPromptResolve = null;
        reject(error);
      }
    });
  }

  /**
   * 发送静默问题（-q 模式）
   */
  async askQuiet(question: string): Promise<string> {
    // 静默模式需要创建一个新的一次性进程
    return new Promise((resolve, reject) => {
      const childProcess = spawn("kwaicli", ["-q", question], {
        cwd: this.options.cwd || process.cwd(),
        env: {
          ...process.env,
          ...this.options.env,
        },
      });

      let output = "";
      let error = "";

      childProcess.stdout?.on("data", (data: Buffer) => {
        output += data.toString();
      });

      childProcess.stderr?.on("data", (data: Buffer) => {
        error += data.toString();
      });

      childProcess.on("exit", (code: number | null) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`KwaiCLI exited with code ${code}: ${error}`));
        }
      });

      childProcess.on("error", reject);
    });
  }

  /**
   * 停止进程
   */
  stop(): void {
    if (this.process) {
      // 尝试优雅退出
      try {
        this.process.stdin?.write("exit\n");
        this.process.stdin?.end();
      } catch {
        // 忽略错误，继续强制终止
      }

      // 等待一小段时间后强制终止
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGTERM");

          // 如果还不行，使用 SIGKILL
          setTimeout(() => {
            if (this.process && !this.process.killed) {
              this.process.kill("SIGKILL");
            }
          }, 1000);
        }
      }, 500);
    }

    this.cleanup();
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    this.process = null;
    this.isReady = false;
    this.currentPromptResolve = null;
    this.outputBuffer = [];
    this.errorBuffer = [];
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * 检查进程是否存活
   */
  isAlive(): boolean {
    return this.process !== null && !this.process.killed;
  }
}

/**
 * KwaiCLI Session 管理器
 */
export class KwaiCLISessionManager {
  private sessions = new Map<string, KwaiCLISession>();
  private defaultOptions: KwaiCLIProcessOptions;

  constructor(defaultOptions: KwaiCLIProcessOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * 创建或获取 session
   */
  async getOrCreateSession(
    sessionId: string,
    options?: KwaiCLIProcessOptions,
  ): Promise<KwaiCLISession> {
    let session = this.sessions.get(sessionId);

    if (!session || !session.isAlive()) {
      // 创建新 session
      session = new KwaiCLISession(sessionId, {
        ...this.defaultOptions,
        ...options,
      });

      await session.start();
      this.sessions.set(sessionId, session);

      // 监听 session 退出，自动清理
      session.once("exit", () => {
        this.sessions.delete(sessionId);
      });
    }

    return session;
  }

  /**
   * 获取现有 session
   */
  getSession(sessionId: string): KwaiCLISession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 关闭 session
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.stop();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * 关闭所有 sessions
   */
  closeAll(): void {
    for (const session of this.sessions.values()) {
      session.stop();
    }
    this.sessions.clear();
  }

  /**
   * 获取所有活跃的 session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * 检查 kwaicli 是否可用
   */
  static async checkAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn("kwaicli", ["--version"], {
        stdio: "ignore",
      });

      process.on("exit", (code) => {
        resolve(code === 0);
      });

      process.on("error", () => {
        resolve(false);
      });

      // 超时处理
      setTimeout(() => {
        process.kill();
        resolve(false);
      }, 3000);
    });
  }
}

/**
 * 全局 session 管理器实例
 */
let globalManager: KwaiCLISessionManager | null = null;

/**
 * 获取全局 session 管理器
 */
export function getKwaiCLISessionManager(): KwaiCLISessionManager {
  if (!globalManager) {
    globalManager = new KwaiCLISessionManager();
  }
  return globalManager;
}

/**
 * 清理全局资源
 */
export function cleanupKwaiCLI(): void {
  if (globalManager) {
    globalManager.closeAll();
    globalManager = null;
  }
}
