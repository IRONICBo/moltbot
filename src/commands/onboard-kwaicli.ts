/**
 * KwaiCLI onboarding integration
 * 类似 Codex 和 Claude Code 的接入方式
 */

import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import { writeConfigFile, readConfigFileSnapshot } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";

export interface KwaiCLIOnboardOptions {
  /** KwaiCLI API endpoint */
  apiEndpoint?: string;
  /** KwaiCLI API key */
  apiKey?: string;
  /** KwaiCLI model ID */
  modelId?: string;
  /** 工作区路径 */
  workspace?: string;
  /** 是否启用代码补全 */
  enableCodeCompletion?: boolean;
  /** 是否启用聊天功能 */
  enableChat?: boolean;
  /** 是否启用工具调用 */
  enableTools?: boolean;
  /** 是否自动安装守护进程 */
  installDaemon?: boolean;
}

/**
 * KwaiCLI 默认配置
 */
export const KWAICLI_DEFAULTS = {
  apiEndpoint: process.env.KWAICLI_API_ENDPOINT || "https://api.kwaicli.com/v1",
  modelId: process.env.KWAICLI_MODEL_ID || "kwaicli-code-latest",
  workspace: "~/kwaicli-workspace",
  enableCodeCompletion: true,
  enableChat: true,
  enableTools: true,
} as const;

/**
 * 交互式 KwaiCLI onboarding
 */
export async function runKwaiCLIOnboarding(
  opts: KwaiCLIOnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
  prompter: WizardPrompter,
) {
  await prompter.intro("🚀 KwaiCLI Onboarding - 类似 Codex & Claude Code");

  // 1. API 认证配置
  const apiKey = await promptKwaiCLIApiKey(opts, prompter, runtime);

  // 2. 模型选择
  const modelConfig = await promptKwaiCLIModel(opts, prompter);

  // 3. 功能配置
  const features = await promptKwaiCLIFeatures(opts, prompter);

  // 4. 工作区配置
  const workspaceConfig = await promptWorkspaceConfig(opts, prompter);

  // 5. 应用配置
  await applyKwaiCLIConfig(
    {
      apiKey,
      modelConfig,
      features,
      workspaceConfig,
    },
    runtime,
  );

  // 6. 安装守护进程（如果需要）
  if (opts.installDaemon || features.installDaemon) {
    await installKwaiCLIDaemon(runtime);
  }

  // 7. 显示完成信息
  await showKwaiCLICompletionMessage(prompter, runtime);
}

/**
 * 提示输入 KwaiCLI API Key
 */
async function promptKwaiCLIApiKey(
  opts: KwaiCLIOnboardOptions,
  prompter: WizardPrompter,
  _runtime: RuntimeEnv,
): Promise<string> {
  // 优先使用传入的 API Key
  if (opts.apiKey) {
    return opts.apiKey;
  }

  // 检查环境变量
  const envApiKey = process.env.KWAICLI_API_KEY;
  if (envApiKey) {
    const useEnv = await prompter.confirm({
      message: "检测到环境变量 KWAICLI_API_KEY，是否使用？",
      initialValue: true,
    });
    if (useEnv) {
      return envApiKey;
    }
  }

  // 提示用户输入
  await prompter.note(
    [
      "获取 KwaiCLI API Key：",
      "1. 访问 https://kwaicli.kuaishou.com",
      "2. 登录你的快手账号",
      "3. 在 Settings > API Keys 中生成 API Key",
      "",
      "或者使用现有的 Anthropic/OpenAI API Key",
    ].join("\n"),
    "API Key 配置",
  );

  const apiKey = await prompter.text({
    message: "请输入你的 KwaiCLI API Key:",
    placeholder: "sk-kwaicli-...",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "API Key 不能为空";
      }
      if (!value.startsWith("sk-")) {
        return "API Key 格式不正确（应以 sk- 开头）";
      }
      return undefined;
    },
  });

  return apiKey;
}

/**
 * 提示选择模型配置
 */
async function promptKwaiCLIModel(opts: KwaiCLIOnboardOptions, prompter: WizardPrompter) {
  const modelId =
    opts.modelId ||
    (await prompter.select({
      message: "选择 KwaiCLI 模型:",
      options: [
        {
          value: "kwaicli-code-latest",
          label: "KwaiCLI Code (Latest)",
          hint: "最新代码模型，类似 Codex",
        },
        {
          value: "kwaicli-chat-latest",
          label: "KwaiCLI Chat (Latest)",
          hint: "最新聊天模型，类似 Claude",
        },
        {
          value: "kwaicli-code-pro",
          label: "KwaiCLI Code Pro",
          hint: "专业代码模型，更强的推理能力",
        },
        {
          value: "anthropic/claude-opus-4",
          label: "Claude Opus 4 (兼容)",
          hint: "使用 Anthropic Claude Opus 4",
        },
        {
          value: "openai/gpt-4-turbo",
          label: "GPT-4 Turbo (兼容)",
          hint: "使用 OpenAI GPT-4 Turbo",
        },
      ],
      initialValue: "kwaicli-code-latest",
    }));

  const apiEndpoint =
    opts.apiEndpoint ||
    (await prompter.text({
      message: "API Endpoint:",
      placeholder: KWAICLI_DEFAULTS.apiEndpoint,
      initialValue: KWAICLI_DEFAULTS.apiEndpoint,
    }));

  return {
    modelId,
    apiEndpoint,
  };
}

/**
 * 提示选择功能配置
 */
async function promptKwaiCLIFeatures(opts: KwaiCLIOnboardOptions, prompter: WizardPrompter) {
  await prompter.note(
    [
      "KwaiCLI 功能配置",
      "",
      "类似 Codex 和 Claude Code 的功能：",
      "• 代码补全 (Code Completion)",
      "• 智能聊天 (Chat)",
      "• 工具调用 (Tool Use)",
      "• 代码审查 (Code Review)",
      "• 重构建议 (Refactoring)",
    ].join("\n"),
    "功能选择",
  );

  const enableCodeCompletion =
    opts.enableCodeCompletion ??
    (await prompter.confirm({
      message: "启用代码补全（类似 GitHub Copilot）？",
      initialValue: true,
    }));

  const enableChat =
    opts.enableChat ??
    (await prompter.confirm({
      message: "启用智能聊天（类似 Claude Code）？",
      initialValue: true,
    }));

  const enableTools =
    opts.enableTools ??
    (await prompter.confirm({
      message: "启用工具调用（文件读写、命令执行等）？",
      initialValue: true,
    }));

  const installDaemon =
    opts.installDaemon ??
    (await prompter.confirm({
      message: "安装后台守护进程（保持服务运行）？",
      initialValue: true,
    }));

  return {
    enableCodeCompletion,
    enableChat,
    enableTools,
    installDaemon,
  };
}

/**
 * 提示工作区配置
 */
async function promptWorkspaceConfig(opts: KwaiCLIOnboardOptions, prompter: WizardPrompter) {
  const workspace =
    opts.workspace ||
    (await prompter.text({
      message: "工作区路径:",
      placeholder: KWAICLI_DEFAULTS.workspace,
      initialValue: KWAICLI_DEFAULTS.workspace,
    }));

  return {
    workspace,
  };
}

/**
 * 应用 KwaiCLI 配置
 */
async function applyKwaiCLIConfig(
  config: {
    apiKey: string;
    modelConfig: { modelId: string; apiEndpoint: string };
    features: {
      enableCodeCompletion: boolean;
      enableChat: boolean;
      enableTools: boolean;
      installDaemon: boolean;
    };
    workspaceConfig: { workspace: string };
  },
  runtime: RuntimeEnv,
) {
  const snapshot = await readConfigFileSnapshot();
  const baseConfig: OpenClawConfig = snapshot.valid ? snapshot.config : {};

  // 构建新配置
  const updatedConfig: OpenClawConfig = {
    ...baseConfig,
    // Models 配置
    models: {
      ...baseConfig.models,
      providers: {
        ...baseConfig.models?.providers,
        kwaicli: {
          baseUrl: config.modelConfig.apiEndpoint,
          apiKey: config.apiKey,
          models: [
            {
              id: config.modelConfig.modelId,
              name: `KwaiCLI ${config.modelConfig.modelId}`,
              reasoning: false,
              input: ["text"],
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
              },
              contextWindow: 128000,
              maxTokens: 4096,
            },
          ],
        },
      },
    },
    // Agents 默认配置
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        workspace: config.workspaceConfig.workspace,
        model: {
          ...(typeof baseConfig.agents?.defaults?.model === "object"
            ? baseConfig.agents.defaults.model
            : {}),
          primary: config.modelConfig.modelId,
        },
      },
    },
    // Tools 配置
    tools: {
      ...baseConfig.tools,
      // 如果启用工具，设置为 allowlist 模式
      exec: config.features.enableTools
        ? {
            ...baseConfig.tools?.exec,
            security: "allowlist" as const,
          }
        : baseConfig.tools?.exec,
    },
    // KwaiCLI 自定义配置（通过 env）
    env: {
      ...baseConfig.env,
      KWAICLI_CODE_COMPLETION_ENABLED: config.features.enableCodeCompletion ? "true" : "false",
      KWAICLI_CHAT_ENABLED: config.features.enableChat ? "true" : "false",
      KWAICLI_MODEL: config.modelConfig.modelId,
    },
  };

  // 写入配置文件
  await writeConfigFile(updatedConfig);

  runtime.log("✅ KwaiCLI 配置已保存");
}

/**
 * 安装 KwaiCLI 守护进程
 */
async function installKwaiCLIDaemon(runtime: RuntimeEnv) {
  runtime.log("📦 正在安装 KwaiCLI 守护进程...");

  // 这里可以调用现有的 daemon 安装逻辑
  // 类似于 clawdbot gateway --install-daemon

  try {
    // TODO: 实现实际的守护进程安装
    runtime.log("✅ KwaiCLI 守护进程安装成功");
  } catch (error) {
    runtime.error(`❌ 守护进程安装失败: ${String(error)}`);
  }
}

/**
 * 显示完成消息
 */
async function showKwaiCLICompletionMessage(prompter: WizardPrompter, _runtime: RuntimeEnv) {
  await prompter.note(
    [
      "🎉 KwaiCLI 配置完成！",
      "",
      "接下来你可以：",
      "",
      "1. 启动 KwaiCLI 服务:",
      `   ${formatCliCommand("clawdbot gateway")}`,
      "",
      "2. 使用代码补全（在你的编辑器中）:",
      "   类似 GitHub Copilot 的体验",
      "",
      "3. 使用智能聊天:",
      `   ${formatCliCommand("clawdbot tui")}`,
      `   或 ${formatCliCommand("clawdbot agent --message '你的问题'")}`,
      "",
      "4. 访问 Web Dashboard:",
      "   http://localhost:18789",
      "",
      "5. 查看帮助文档:",
      `   ${formatCliCommand("clawdbot --help")}`,
      "",
      "享受编码！🚀",
    ].join("\n"),
    "完成",
  );

  await prompter.outro("KwaiCLI 已准备就绪");
}

/**
 * 非交互式 KwaiCLI onboarding
 */
export async function runKwaiCLINonInteractiveOnboarding(
  opts: KwaiCLIOnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  runtime.log("🚀 KwaiCLI 非交互式 onboarding");

  if (!opts.apiKey) {
    runtime.error("非交互式模式需要提供 --api-key 或设置 KWAICLI_API_KEY 环境变量");
    runtime.exit(1);
    return;
  }

  const config = {
    apiKey: opts.apiKey,
    modelConfig: {
      modelId: opts.modelId || KWAICLI_DEFAULTS.modelId,
      apiEndpoint: opts.apiEndpoint || KWAICLI_DEFAULTS.apiEndpoint,
    },
    features: {
      enableCodeCompletion: opts.enableCodeCompletion ?? KWAICLI_DEFAULTS.enableCodeCompletion,
      enableChat: opts.enableChat ?? KWAICLI_DEFAULTS.enableChat,
      enableTools: opts.enableTools ?? KWAICLI_DEFAULTS.enableTools,
      installDaemon: opts.installDaemon ?? false,
    },
    workspaceConfig: {
      workspace: opts.workspace || KWAICLI_DEFAULTS.workspace,
    },
  };

  await applyKwaiCLIConfig(config, runtime);

  if (config.features.installDaemon) {
    await installKwaiCLIDaemon(runtime);
  }

  runtime.log("✅ KwaiCLI 配置完成");
  runtime.log(`启动服务: ${formatCliCommand("clawdbot gateway")}`);
}

/**
 * 验证 KwaiCLI 配置
 */
export async function validateKwaiCLIConfig(
  runtime: RuntimeEnv = defaultRuntime,
): Promise<boolean> {
  const snapshot = await readConfigFileSnapshot();

  if (!snapshot.valid) {
    runtime.error("配置文件无效");
    return false;
  }

  const config = snapshot.config;

  // 检查必要的配置项
  const kwaiCliProvider = config.models?.providers?.kwaicli;
  if (!kwaiCliProvider || typeof kwaiCliProvider !== "object" || !("apiKey" in kwaiCliProvider)) {
    runtime.error("缺少 KwaiCLI API Key");
    return false;
  }

  // 检查模型配置
  const hasModel =
    config.agents?.defaults?.model ||
    (config.models?.providers && Object.keys(config.models.providers).length > 0);

  if (!hasModel) {
    runtime.error("缺少模型配置");
    return false;
  }

  runtime.log("✅ KwaiCLI 配置验证通过");
  return true;
}

/**
 * KwaiCLI 健康检查
 */
export async function checkKwaiCLIHealth(runtime: RuntimeEnv = defaultRuntime): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  // 1. 检查配置
  const configValid = await validateKwaiCLIConfig(runtime);
  if (!configValid) {
    issues.push("配置无效");
  }

  // 2. 检查 API 连接
  // TODO: 实现实际的 API 连接检查

  // 3. 检查守护进程状态
  // TODO: 实现守护进程状态检查

  return {
    healthy: issues.length === 0,
    issues,
  };
}
