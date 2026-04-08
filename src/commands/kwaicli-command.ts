/**
 * KwaiCLI CLI 命令集成
 * 通过子进程调用 kwaicli 命令行工具
 */

import { randomUUID } from "node:crypto";
import { Command } from "commander";
import {
  runKwaiCLIAgent,
  runKwaiCLICommit,
  runKwaiCLIRun,
  closeKwaiCLISession,
  getActiveKwaiCLISessions,
  checkKwaiCLIAvailable,
} from "../providers/kwaicli-agent-runner.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";

/**
 * 创建 KwaiCLI 命令
 */
export function createKwaiCLICommand(runtime: RuntimeEnv = defaultRuntime): Command {
  const cmd = new Command("kwaicli");

  cmd.description("KwaiCLI 集成 - 通过子进程调用 kwaicli CLI 工具").addHelpText(
    "after",
    `
示例:
  # 交互式聊天（在同一个 session 中）
  $ clawdbot kwaicli chat

  # 快速提问（静默模式，仅输出结果）
  $ clawdbot kwaicli ask "what is this code doing?"

  # 快速提问（静默模式）
  $ clawdbot kwaicli -q "explain this function"

  # 生成并提交代码更改
  $ clawdbot kwaicli commit
  $ clawdbot kwaicli commit -s -c

  # 自然语言转命令
  $ clawdbot kwaicli run
  $ clawdbot kwaicli run "list all docker containers"

  # 查看活跃的 sessions
  $ clawdbot kwaicli sessions

  # 关闭特定 session
  $ clawdbot kwaicli close <session-id>

  # 检查 kwaicli 是否可用
  $ clawdbot kwaicli check

文档:
  https://kwaicli.kuaishou.com/docs
`,
  );

  // chat 子命令 - 交互式聊天
  cmd
    .command("chat")
    .description("启动交互式聊天会话")
    .option("-s, --session <id>", "指定 session ID（默认自动生成）")
    .option("-w, --workspace <path>", "工作区路径")
    .option("-t, --timeout <ms>", "响应超时时间（毫秒）", "60000")
    .action(async (cmdOpts) => {
      const sessionId = cmdOpts.session || `kwaicli-${randomUUID()}`;

      runtime.log(`🤖 KwaiCLI 交互式聊天 (Session: ${sessionId})`);
      runtime.log("输入你的问题，输入 'exit' 或 'quit' 退出\n");

      // 检查 kwaicli 是否可用
      const available = await checkKwaiCLIAvailable();
      if (!available) {
        runtime.error("❌ kwaicli 命令未找到");
        runtime.error("请先安装 kwaicli: https://kwaicli.kuaishou.com/docs/install");
        runtime.exit(1);
        return;
      }

      // 创建 readline 接口
      const readline = await import("node:readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "> ",
      });

      rl.prompt();

      rl.on("line", async (line) => {
        const input = line.trim();

        if (!input) {
          rl.prompt();
          return;
        }

        if (input === "exit" || input === "quit") {
          closeKwaiCLISession(sessionId);
          rl.close();
          runtime.log("\n👋 再见！");
          runtime.exit(0);
          return;
        }

        try {
          const result = await runKwaiCLIAgent({
            sessionId,
            message: input,
            workspaceDir: cmdOpts.workspace,
            timeout: parseInt(cmdOpts.timeout, 10),
            runtime,
          });

          if (result.success) {
            runtime.log(`\n${result.response}\n`);
          } else {
            runtime.error(`\n❌ 错误: ${result.error}\n`);
          }
        } catch (error) {
          runtime.error(`\n❌ 错误: ${String(error)}\n`);
        }

        rl.prompt();
      });

      rl.on("close", () => {
        closeKwaiCLISession(sessionId);
        runtime.log("\n👋 会话已结束");
        runtime.exit(0);
      });
    });

  // ask 子命令 - 快速提问
  cmd
    .command("ask <question>")
    .description("快速向 KwaiCLI 提问（一次性查询）")
    .option("-q, --quiet", "静默模式，仅输出结果")
    .option("-w, --workspace <path>", "工作区路径")
    .option("-t, --timeout <ms>", "响应超时时间（毫秒）", "30000")
    .action(async (question, cmdOpts) => {
      const sessionId = `kwaicli-oneshot-${randomUUID()}`;

      try {
        const result = await runKwaiCLIAgent({
          sessionId,
          message: question,
          workspaceDir: cmdOpts.workspace,
          timeout: parseInt(cmdOpts.timeout, 10),
          quiet: cmdOpts.quiet,
          runtime,
        });

        if (result.success) {
          if (cmdOpts.quiet) {
            // 静默模式：只输出结果
            console.log(result.response);
          } else {
            runtime.log(`\n${result.response}\n`);
            runtime.log(`⏱️  耗时: ${result.duration}ms`);
          }
          runtime.exit(0);
        } else {
          runtime.error(`❌ 错误: ${result.error}`);
          runtime.exit(1);
        }
      } catch (error) {
        runtime.error(`❌ 错误: ${String(error)}`);
        runtime.exit(1);
      } finally {
        // 关闭一次性 session
        closeKwaiCLISession(sessionId);
      }
    });

  // commit 子命令
  cmd
    .command("commit")
    .description("生成并提交代码更改")
    .option("-s, --staged", "暂存更改")
    .option("-c, --confirm", "提交前确认")
    .option("-w, --workspace <path>", "工作区路径")
    .action(async (cmdOpts) => {
      const sessionId = `kwaicli-commit-${randomUUID()}`;

      runtime.log("🔧 运行 kwaicli commit...\n");

      const result = await runKwaiCLICommit({
        sessionId,
        workspaceDir: cmdOpts.workspace,
        staged: cmdOpts.staged,
        confirm: cmdOpts.confirm,
        runtime,
      });

      if (result.success) {
        runtime.log(`\n✅ 完成 (耗时: ${result.duration}ms)`);
        runtime.exit(0);
      } else {
        runtime.error(`\n❌ 失败: ${result.error}`);
        runtime.exit(1);
      }
    });

  // run 子命令
  cmd
    .command("run [command]")
    .description("自然语言转命令并执行")
    .option("-w, --workspace <path>", "工作区路径")
    .action(async (command, cmdOpts) => {
      const sessionId = `kwaicli-run-${randomUUID()}`;

      runtime.log("🚀 运行 kwaicli run...\n");

      const result = await runKwaiCLIRun({
        sessionId,
        command,
        workspaceDir: cmdOpts.workspace,
        runtime,
      });

      if (result.success) {
        runtime.log(`\n✅ 完成 (耗时: ${result.duration}ms)`);
        runtime.exit(0);
      } else {
        runtime.error(`\n❌ 失败: ${result.error}`);
        runtime.exit(1);
      }
    });

  // sessions 子命令 - 查看活跃的 sessions
  cmd
    .command("sessions")
    .description("查看所有活跃的 KwaiCLI sessions")
    .action(async () => {
      const sessions = getActiveKwaiCLISessions();

      if (sessions.length === 0) {
        runtime.log("没有活跃的 sessions");
      } else {
        runtime.log(`活跃的 sessions (${sessions.length}):`);
        sessions.forEach((id) => {
          runtime.log(`  • ${id}`);
        });
      }
    });

  // close 子命令 - 关闭 session
  cmd
    .command("close <session-id>")
    .description("关闭指定的 KwaiCLI session")
    .action(async (sessionId) => {
      try {
        closeKwaiCLISession(sessionId);
        runtime.log(`✅ Session ${sessionId} 已关闭`);
      } catch (error) {
        runtime.error(`❌ 关闭失败: ${String(error)}`);
        runtime.exit(1);
      }
    });

  // check 子命令 - 检查 kwaicli 是否可用
  cmd
    .command("check")
    .description("检查 kwaicli 命令是否可用")
    .action(async () => {
      runtime.log("检查 kwaicli 可用性...");

      const available = await checkKwaiCLIAvailable();

      if (available) {
        runtime.log("✅ kwaicli 可用");
        runtime.exit(0);
      } else {
        runtime.error("❌ kwaicli 不可用");
        runtime.error("请安装 kwaicli: https://kwaicli.kuaishou.com/docs/install");
        runtime.exit(1);
      }
    });

  // 默认命令（无子命令时）- 交互式模式
  cmd.action(async () => {
    // 如果没有子命令，启动交互式聊天
    const sessionId = `kwaicli-default-${randomUUID()}`;

    runtime.log(`🤖 KwaiCLI 交互模式 (Session: ${sessionId})`);
    runtime.log("输入你的问题，输入 'exit' 退出\n");

    const available = await checkKwaiCLIAvailable();
    if (!available) {
      runtime.error("❌ kwaicli 命令未找到");
      runtime.error("请先安装 kwaicli: https://kwaicli.kuaishou.com/docs/install");
      runtime.exit(1);
      return;
    }

    const readline = await import("node:readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "> ",
    });

    rl.prompt();

    rl.on("line", async (line) => {
      const input = line.trim();

      if (!input) {
        rl.prompt();
        return;
      }

      if (input === "exit" || input === "quit") {
        closeKwaiCLISession(sessionId);
        rl.close();
        runtime.log("\n👋 再见！");
        runtime.exit(0);
        return;
      }

      try {
        const result = await runKwaiCLIAgent({
          sessionId,
          message: input,
          runtime,
        });

        if (result.success) {
          runtime.log(`\n${result.response}\n`);
        } else {
          runtime.error(`\n❌ 错误: ${result.error}\n`);
        }
      } catch (error) {
        runtime.error(`\n❌ 错误: ${String(error)}\n`);
      }

      rl.prompt();
    });

    rl.on("close", () => {
      closeKwaiCLISession(sessionId);
      runtime.log("\n👋 会话已结束");
      runtime.exit(0);
    });
  });

  return cmd;
}

/**
 * 注册 KwaiCLI 命令到主程序
 */
export function registerKwaiCLICommand(program: Command, runtime: RuntimeEnv = defaultRuntime) {
  const kwaiCliCmd = createKwaiCLICommand(runtime);
  program.addCommand(kwaiCliCmd);
}
