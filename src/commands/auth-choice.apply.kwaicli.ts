import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";

export async function applyAuthChoiceKwaiCLI(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "kwaicli-api-key") {
    return null;
  }

  const nextConfig = params.config;

  // KwaiCLI works through CLI tool, not API key
  await params.prompter.note(
    [
      "KwaiCLI 集成通过命令行工具实现",
      "",
      "安装步骤:",
      "1. 访问 https://kwaicli.kuaishou.com/docs/install",
      "2. 按照官方文档安装 kwaicli CLI 工具",
      "3. 运行 'kwaicli config' 配置认证",
      "",
      "验证安装:",
      "运行 'kwaicli --version' 检查是否安装成功",
    ].join("\n"),
    "KwaiCLI 设置",
  );

  // Check if kwaicli CLI is available
  const { checkKwaiCLIAvailable } = await import("../providers/kwaicli-agent-runner.js");
  const available = await checkKwaiCLIAvailable();

  if (!available) {
    const shouldContinue = await params.prompter.confirm({
      message: "kwaicli 命令未找到。是否继续？（稍后可手动安装）",
      initialValue: true,
    });

    if (!shouldContinue) {
      return null;
    }

    await params.prompter.note("请稍后安装 kwaicli 并运行 'kwaicli config'", "提示");
  } else {
    await params.prompter.note(
      "kwaicli CLI 工具已安装。你现在可以使用:\n" +
        "  openclaw kwaicli chat     - 交互式聊天\n" +
        "  openclaw kwaicli ask      - 快速提问\n" +
        "  openclaw kwaicli commit   - 代码提交\n" +
        "  openclaw kwaicli run      - 自然语言转命令",
      "KwaiCLI 就绪",
    );
  }

  if (params.setDefaultModel) {
    await params.prompter.note(
      [
        "KwaiCLI 通过子进程调用工作，不需要设置默认模型。",
        "",
        "使用方法:",
        "  openclaw kwaicli chat         # 启动交互式会话",
        "  openclaw kwaicli ask '问题'   # 快速提问",
        "",
        "查看所有命令:",
        "  openclaw kwaicli --help",
      ].join("\n"),
      "使用提示",
    );
  }

  return { config: nextConfig, agentModelOverride: undefined };
}
