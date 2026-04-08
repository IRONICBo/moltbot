/**
 * KwaiCLI VS Code Extension
 * 类似 GitHub Copilot 和 Claude Code 的集成
 */

import * as vscode from "vscode";
import * as WebSocket from "ws";

interface KwaiCLIConfig {
  apiKey: string;
  apiEndpoint: string;
  model: string;
  completion: {
    enabled: boolean;
    triggerCharacters: string[];
    maxSuggestions: number;
    debounceMs: number;
  };
  chat: {
    enabled: boolean;
    contextLines: number;
  };
  tools: {
    enabled: boolean;
    confirmBeforeExecution: boolean;
  };
}

interface CompletionRequest {
  prefix: string;
  suffix: string;
  language: string;
  filename: string;
  model?: string;
}

interface CompletionResponse {
  completions: Array<{
    text: string;
    score: number;
  }>;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

class KwaiCLIClient {
  private ws: WebSocket | null = null;
  private config: KwaiCLIConfig;
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  constructor(config: KwaiCLIConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new (WebSocket as any)(this.config.apiEndpoint);

      this.ws!.on("open", () => {
        console.log("KwaiCLI: 已连接");
        resolve();
      });

      this.ws!.on("error", (error: Error) => {
        console.error("KwaiCLI: 连接错误", error);
        reject(error);
      });

      this.ws!.on("message", (data: WebSocket.RawData) => {
        try {
          const message = JSON.parse(data.toString());
          const handler = this.messageHandlers.get(message.id);
          if (handler) {
            handler(message);
            this.messageHandlers.delete(message.id);
          }
        } catch (error) {
          console.error("KwaiCLI: 消息解析错误", error);
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private async sendRequest<T>(method: string, params: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("KwaiCLI: 未连接"));
        return;
      }

      const id = Math.random().toString(36).substring(7);
      const message = {
        id,
        method,
        params,
      };

      this.messageHandlers.set(id, (response) => {
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response.result);
        }
      });

      this.ws.send(JSON.stringify(message));

      // 超时处理
      setTimeout(() => {
        if (this.messageHandlers.has(id)) {
          this.messageHandlers.delete(id);
          reject(new Error("KwaiCLI: 请求超时"));
        }
      }, 30000);
    });
  }

  async getCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    return this.sendRequest<CompletionResponse>("completion.get", {
      ...request,
      model: request.model || this.config.model,
      apiKey: this.config.apiKey,
    });
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const response = await this.sendRequest<{ content: string }>("chat.send", {
      messages,
      model: this.config.model,
      apiKey: this.config.apiKey,
    });
    return response.content;
  }

  async explainCode(code: string, language: string): Promise<string> {
    return this.chat([
      {
        role: "system",
        content: "你是一个代码解释专家。请用简洁清晰的中文解释代码的功能和实现。",
      },
      {
        role: "user",
        content: `请解释以下 ${language} 代码：\n\n\`\`\`${language}\n${code}\n\`\`\``,
      },
    ]);
  }

  async reviewCode(code: string, language: string): Promise<string> {
    return this.chat([
      {
        role: "system",
        content: "你是一个代码审查专家。请审查代码并提供改进建议。",
      },
      {
        role: "user",
        content: `请审查以下 ${language} 代码：\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n关注：\n1. 潜在的 bug\n2. 性能问题\n3. 代码风格\n4. 最佳实践`,
      },
    ]);
  }

  async refactorCode(code: string, language: string): Promise<string> {
    return this.chat([
      {
        role: "system",
        content: "你是一个重构专家。请提供重构建议并给出改进后的代码。",
      },
      {
        role: "user",
        content: `请为以下 ${language} 代码提供重构建议：\n\n\`\`\`${language}\n${code}\n\`\`\``,
      },
    ]);
  }

  async generateTests(code: string, language: string): Promise<string> {
    return this.chat([
      {
        role: "system",
        content: "你是一个测试编写专家。请为给定代码生成全面的单元测试。",
      },
      {
        role: "user",
        content: `请为以下 ${language} 代码生成单元测试：\n\n\`\`\`${language}\n${code}\n\`\`\``,
      },
    ]);
  }

  async generateDocumentation(code: string, language: string): Promise<string> {
    return this.chat([
      {
        role: "system",
        content: "你是一个文档编写专家。请为代码生成清晰的文档注释。",
      },
      {
        role: "user",
        content: `请为以下 ${language} 代码生成文档注释：\n\n\`\`\`${language}\n${code}\n\`\`\``,
      },
    ]);
  }
}

class KwaiCLICompletionProvider implements vscode.InlineCompletionItemProvider {
  private client: KwaiCLIClient;
  private config: KwaiCLIConfig;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(client: KwaiCLIClient, config: KwaiCLIConfig) {
    this.client = client;
    this.config = config;
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
    if (!this.config.completion.enabled) {
      return null;
    }

    // 防抖
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        try {
          const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
          const suffix = document.getText(
            new vscode.Range(position, new vscode.Position(document.lineCount, 0)),
          );

          const response = await this.client.getCompletion({
            prefix,
            suffix,
            language: document.languageId,
            filename: document.fileName,
          });

          const items = response.completions
            .slice(0, this.config.completion.maxSuggestions)
            .map((completion) => new vscode.InlineCompletionItem(completion.text));

          resolve(items);
        } catch (error) {
          console.error("KwaiCLI: 补全错误", error);
          resolve(null);
        }
      }, this.config.completion.debounceMs);
    });
  }
}

class KwaiCLIChatViewProvider implements vscode.WebviewViewProvider {
  private client: KwaiCLIClient;
  private view?: vscode.WebviewView;
  private messages: ChatMessage[] = [];

  constructor(client: KwaiCLIClient) {
    this.client = client;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtmlContent();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "send":
          await this.handleSendMessage(message.text);
          break;
        case "clear":
          this.messages = [];
          this.updateChat();
          break;
      }
    });
  }

  private async handleSendMessage(text: string) {
    this.messages.push({ role: "user", content: text });
    this.updateChat();

    try {
      const response = await this.client.chat(this.messages);
      this.messages.push({ role: "assistant", content: response });
      this.updateChat();
    } catch (error) {
      vscode.window.showErrorMessage(`KwaiCLI: ${error}`);
    }
  }

  private updateChat() {
    if (this.view) {
      this.view.webview.postMessage({
        type: "update",
        messages: this.messages,
      });
    }
  }

  private getHtmlContent(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { padding: 10px; font-family: var(--vscode-font-family); }
          #messages { height: 400px; overflow-y: auto; margin-bottom: 10px; }
          .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
          .user { background: var(--vscode-input-background); }
          .assistant { background: var(--vscode-editor-background); }
          .role { font-weight: bold; margin-bottom: 5px; }
          #input { width: calc(100% - 70px); padding: 5px; }
          #send { padding: 5px 15px; margin-left: 5px; }
          #clear { padding: 5px 10px; margin-top: 5px; }
        </style>
      </head>
      <body>
        <div id="messages"></div>
        <div>
          <input type="text" id="input" placeholder="输入消息..." />
          <button id="send">发送</button>
          <button id="clear">清除</button>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          const messages = document.getElementById('messages');
          const input = document.getElementById('input');
          const send = document.getElementById('send');
          const clear = document.getElementById('clear');

          send.onclick = () => {
            const text = input.value.trim();
            if (text) {
              vscode.postMessage({ type: 'send', text });
              input.value = '';
            }
          };

          clear.onclick = () => {
            vscode.postMessage({ type: 'clear' });
          };

          input.onkeypress = (e) => {
            if (e.key === 'Enter') send.onclick();
          };

          window.addEventListener('message', (event) => {
            const { type, messages: msgs } = event.data;
            if (type === 'update') {
              messages.innerHTML = msgs.map(m => 
                \`<div class="message \${m.role}">
                  <div class="role">\${m.role === 'user' ? '你' : 'KwaiCLI'}</div>
                  <div>\${m.content.replace(/\\n/g, '<br>')}</div>
                </div>\`
              ).join('');
              messages.scrollTop = messages.scrollHeight;
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log("KwaiCLI: 扩展已激活");

  // 读取配置
  const config = vscode.workspace.getConfiguration("kwaicli");
  const kwaiConfig: KwaiCLIConfig = {
    apiKey: config.get("apiKey") || process.env.KWAICLI_API_KEY || "",
    apiEndpoint: config.get("apiEndpoint") || "ws://localhost:18789",
    model: config.get("model") || "kwaicli-code-latest",
    completion: {
      enabled: config.get("completion.enabled", true),
      triggerCharacters: config.get("completion.triggerCharacters", [
        ".",
        "(",
        "{",
        "[",
        " ",
        "\n",
      ]),
      maxSuggestions: config.get("completion.maxSuggestions", 3),
      debounceMs: config.get("completion.debounceMs", 300),
    },
    chat: {
      enabled: config.get("chat.enabled", true),
      contextLines: config.get("chat.contextLines", 50),
    },
    tools: {
      enabled: config.get("tools.enabled", true),
      confirmBeforeExecution: config.get("tools.confirmBeforeExecution", true),
    },
  };

  // 创建客户端
  const client = new KwaiCLIClient(kwaiConfig);

  // 连接到服务
  client.connect().catch((error) => {
    vscode.window.showWarningMessage(`KwaiCLI: 无法连接到服务 - ${error.message}`);
  });

  // 注册代码补全提供者
  if (kwaiConfig.completion.enabled) {
    const completionProvider = new KwaiCLICompletionProvider(client, kwaiConfig);
    context.subscriptions.push(
      vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, completionProvider),
    );
  }

  // 注册聊天视图
  const chatProvider = new KwaiCLIChatViewProvider(client);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("kwaicli.chatView", chatProvider),
  );

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand("kwaicli.chat", () => {
      vscode.commands.executeCommand("kwaicli.chatView.focus");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("kwaicli.completion.toggle", () => {
      kwaiConfig.completion.enabled = !kwaiConfig.completion.enabled;
      vscode.window.showInformationMessage(
        `KwaiCLI 代码补全: ${kwaiConfig.completion.enabled ? "已启用" : "已禁用"}`,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("kwaicli.explain", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selection = editor.selection;
      const code = editor.document.getText(selection);
      if (!code) {
        vscode.window.showInformationMessage("请先选择代码");
        return;
      }

      const explanation = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "KwaiCLI: 正在解释代码...",
          cancellable: false,
        },
        async () => {
          return client.explainCode(code, editor.document.languageId);
        },
      );

      const panel = vscode.window.createWebviewPanel(
        "kwaiCliExplanation",
        "KwaiCLI: 代码解释",
        vscode.ViewColumn.Beside,
        {},
      );

      panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <body style="padding: 20px; font-family: var(--vscode-font-family);">
          <h2>代码解释</h2>
          <pre style="background: var(--vscode-editor-background); padding: 10px; border-radius: 5px;">${code}</pre>
          <div style="margin-top: 20px; white-space: pre-wrap;">${explanation}</div>
        </body>
        </html>
      `;
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("kwaicli.review", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selection = editor.selection;
      const code = editor.document.getText(selection);
      if (!code) {
        vscode.window.showInformationMessage("请先选择代码");
        return;
      }

      const review = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "KwaiCLI: 正在审查代码...",
          cancellable: false,
        },
        async () => {
          return client.reviewCode(code, editor.document.languageId);
        },
      );

      const panel = vscode.window.createWebviewPanel(
        "kwaiCliReview",
        "KwaiCLI: 代码审查",
        vscode.ViewColumn.Beside,
        {},
      );

      panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <body style="padding: 20px; font-family: var(--vscode-font-family);">
          <h2>代码审查</h2>
          <div style="margin-top: 20px; white-space: pre-wrap;">${review}</div>
        </body>
        </html>
      `;
    }),
  );

  // 其他命令类似实现...

  // 清理
  context.subscriptions.push({
    dispose: () => {
      client.disconnect();
    },
  });
}

export function deactivate() {
  console.log("KwaiCLI: 扩展已停用");
}
