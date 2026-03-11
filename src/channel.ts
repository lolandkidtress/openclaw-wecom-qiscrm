import type { ChannelPlugin, ClawdbotConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { ResolvedQiscrmAccount, QiscrmConfig, QiscrmAccountConfig } from "./types.js";
import { handleQiscrmMessage } from "./bot.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// 动态获取插件版本
function getPluginVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = join(__dirname, "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return packageJson.version || "0.1.1";
  } catch {
    return "0.1.1";
  }
}

const PLUGIN_VERSION = getPluginVersion();

// 跟踪每个账号的轮询状态
const runningPollLoops = new Map<string, { stop: () => void }>();

// 插件元数据
// openclaw config set channels.openclaw-openclaw-wecom-qiscrm.baseUrl "http://your-api-server"
// openclaw config set channels.openclaw-openclaw-wecom-qiscrm.apiKey "your-api-key"
// openclaw config set channels.openclaw-openclaw-wecom-qiscrm.orgId "your-org-id"

const PLUGIN_META = {
  id: "openclaw-openclaw-wecom-qiscrm",
  label: "WeCom QISCRM",
  selectionLabel: "WeCom QISCRM (企业微信)",
  docsPath: "/channels/openclaw-openclaw-wecom-qiscrm",
  docsLabel: "openclaw-openclaw-wecom-qiscrm",
  blurb: "WeCom QISCRM channel via Polling API. 购买 API Key 请联系客服",
  order: 80,
} as const;

/**
 * Polling 客户端 - 参考 nanobot 实现
 */
class QiscrmClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  /**
   * 轮询获取消息
   */
  async pollMessages(wxId: string, freWxId: string): Promise<any> {
    const url = `${this.baseUrl}/callback/v1/qiscrmbot/pollMsg`;
    const body = {
      secret: this.apiKey,
      wxId,
      freWxId,
      version: PLUGIN_VERSION,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "At": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Poll failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 发送消息
   */
  async sendMessage(
    orgId: string,
    wxId: string,
    freWxId: string,
    msgType: string,
    content: string,
    wxType: string = ""
  ): Promise<void> {
    const url = `${this.baseUrl}/callback/v1/wx/bilinapi/qy/sendQyFriendMsg`;
    const body = {
      orgId,
      wxId,
      freWxId,
      wxType,
      msgType,
      msgContent: content,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "At": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Send failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as { success?: boolean; note?: string; code?: number };
    if (!result.success) {
      throw new Error(`Send failed: ${result.note || result.code}`);
    }
  }

  /**
   * 上传文件到七牛云
   */
  async uploadToQiniu(filePath: string, filename: string): Promise<string | null> {
    try {
      // 1. 获取上传 Token
      const timestamp = Date.now();
      const fileKey = `temp/${timestamp}/${filename}`;
      const tokenUrl = `${this.baseUrl}/cdn/v1/tool/getToken?fileName=${fileKey}`;

      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: { "At": this.apiKey },
      });

      if (!tokenResponse.ok) {
        console.error("Failed to get upload token");
        return null;
      }

      const tokenData = await tokenResponse.json() as { success?: boolean; code?: number; data?: string };
      if (!tokenData.success || tokenData.code !== 10200) {
        console.error("Invalid token response:", tokenData);
        return null;
      }

      const uploadToken = tokenData.data;
      if (!uploadToken) {
        console.error("Empty upload token");
        return null;
      }

      // 2. 上传到七牛云
      const qiniuUrl = "http://upload.qiniup.com/";

      // 读取本地文件
      const fileBuffer = await import("fs").then(fs =>
        fs.promises.readFile(filePath)
      );

      const formData = new FormData();
      formData.append("token", uploadToken);
      formData.append("key", fileKey);
      formData.append("fname", filename);
      formData.append("file", new Blob([fileBuffer]), filename);

      const uploadResponse = await fetch(qiniuUrl, {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        console.error("Upload failed:", uploadResponse.status);
        return null;
      }

      const result = await uploadResponse.json() as { key?: string };
      const key = result.key || fileKey;
      return `https://cdn.qiscrm.com/${key}`;
    } catch (err) {
      console.error("Upload error:", err);
      return null;
    }
  }
}

/**
 * 解析 Qiscrm 账号配置
 * 支持简化配置（顶级字段）和多账号配置（accounts）
 */
function resolveQiscrmAccount({
  cfg,
  accountId,
}: {
  cfg: ClawdbotConfig;
  accountId: string;
}): ResolvedQiscrmAccount {
  const qiscrmCfg = cfg.channels?.["openclaw-wecom-qiscrm"] as QiscrmConfig | undefined;
  const isDefault = accountId === DEFAULT_ACCOUNT_ID;

  let accountCfg: QiscrmAccountConfig | undefined;
  let enabled: boolean;

  if (isDefault) {
    // 简化配置：从顶级字段读取
    const topLevelConfig: QiscrmAccountConfig = {
      wxId: qiscrmCfg?.wxId || "",
      freWxId: qiscrmCfg?.freWxId || "",
    };

    // 合并 accounts.default 配置（如果存在）
    const defaultAccount = qiscrmCfg?.accounts?.default;
    accountCfg = {
      ...topLevelConfig,
      ...defaultAccount,
    };

    enabled = accountCfg.enabled ?? qiscrmCfg?.enabled ?? true;
  } else {
    accountCfg = qiscrmCfg?.accounts?.[accountId];
    enabled = accountCfg?.enabled ?? true;
  }

  if (!qiscrmCfg?.baseUrl) {
    throw new Error(
      `缺少 baseUrl 配置。\n` +
        `请配置: openclaw config set channels.openclaw-wecom-qiscrm.baseUrl "http://your-api-server"`
    );
  }

  if (!qiscrmCfg?.apiKey) {
    throw new Error(
      `缺少 API Key。\n` +
        `请联系客服购买 API Key\n` +
        `然后配置: openclaw config set channels.openclaw-wecom-qiscrm.apiKey "your-key"`
    );
  }

  if (!qiscrmCfg?.orgId) {
    throw new Error(
      `缺少 orgId 配置。\n` +
        `请配置: openclaw config set channels.openclaw-wecom-qiscrm.orgId "your-org-id"`
    );
  }

  if (!accountCfg?.wxId) {
    throw new Error(
      `缺少 wxId 配置（企业微信账号）。\n` +
        `请配置: openclaw config set channels.openclaw-wecom-qiscrm.wxId "your-wxid"`
    );
  }

  if (!accountCfg?.freWxId) {
    throw new Error(
      `缺少 freWxId 配置（好友账号）。\n` +
        `请配置: openclaw config set channels.openclaw-wecom-qiscrm.freWxId "your-fre-wxid"`
    );
  }

  return {
    accountId,
    enabled,
    configured: true,
    name: accountCfg.name,
    baseUrl: qiscrmCfg.baseUrl,
    apiKey: qiscrmCfg.apiKey,
    orgId: qiscrmCfg.orgId,
    wxId: accountCfg.wxId,
    freWxId: accountCfg.freWxId,
    config: accountCfg,
  };
}

/**
 * 列出所有可用的 Qiscrm 账号 ID
 */
function listQiscrmAccountIds(cfg: ClawdbotConfig): string[] {
  const qiscrmCfg = cfg.channels?.["openclaw-wecom-qiscrm"] as QiscrmConfig | undefined;

  // 如果有顶级配置，则使用默认账号
  if (qiscrmCfg?.baseUrl && qiscrmCfg?.apiKey && qiscrmCfg?.orgId) {
    return [DEFAULT_ACCOUNT_ID];
  }

  // 否则从 accounts 中读取
  const accounts = qiscrmCfg?.accounts;
  if (!accounts) return [];

  return Object.keys(accounts).filter(
    (id) => accounts[id]?.enabled !== false
  );
}

export const wecomQiscrmPlugin: ChannelPlugin<ResolvedQiscrmAccount> = {
  id: "openclaw-wecom-qiscrm",

  meta: PLUGIN_META,

  capabilities: {
    chatTypes: ["direct"],
    polls: false,
    threads: false,
    media: true,
    reactions: false,
    edit: false,
    reply: false,
  },

  agentPrompt: {
    messageToolHints: () => [
      "- Qiscrm targeting: use `user:<freWxId>` for direct messages.",
      "- Qiscrm supports text, image, file, and voice messages.",
    ],
  },

  configSchema: {
    schema: {
      type: "object" as const,
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        // nanobot 参数
        baseUrl: { type: "string" },
        apiKey: { type: "string" },
        orgId: { type: "string" },
        wxId: { type: "string" },
        freWxId: { type: "string" },
        // 多账号配置
        accounts: {
          type: "object" as const,
          additionalProperties: {
            type: "object" as const,
            additionalProperties: false,
            properties: {
              enabled: { type: "boolean" },
              name: { type: "string" },
              wxId: { type: "string" },
              freWxId: { type: "string" },
            },
            required: ["wxId", "freWxId"],
          },
        },
      },
    },
  },

  config: {
    listAccountIds: (cfg) => listQiscrmAccountIds(cfg),

    resolveAccount: (cfg, accountId) => resolveQiscrmAccount({ cfg, accountId }),

    defaultAccountId: (cfg) => {
      const ids = listQiscrmAccountIds(cfg);
      return ids[0] || DEFAULT_ACCOUNT_ID;
    },

    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const qiscrmCfg = cfg.channels?.["openclaw-wecom-qiscrm"] as QiscrmConfig | undefined;
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            qiscrm: {
              ...qiscrmCfg,
              enabled,
            },
          },
        };
      }

      const account = qiscrmCfg?.accounts?.[accountId];
      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          qiscrm: {
            ...qiscrmCfg,
            accounts: {
              ...qiscrmCfg?.accounts,
              [accountId]: {
                ...account,
                enabled,
              },
            },
          },
        },
      };
    },

    deleteAccount: ({ cfg, accountId }) => {
      const qiscrmCfg = cfg.channels?.["openclaw-wecom-qiscrm"] as QiscrmConfig | undefined;
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        const next = { ...cfg } as ClawdbotConfig;
        const nextChannels = { ...cfg.channels };
        delete (nextChannels as Record<string, unknown>)["openclaw-wecom-qiscrm"];
        if (Object.keys(nextChannels).length > 0) {
          next.channels = nextChannels;
        } else {
          delete next.channels;
        }
        return next;
      }

      const accounts = { ...qiscrmCfg?.accounts };
      delete accounts[accountId];

      const nextCfg = { ...cfg } as ClawdbotConfig;
      nextCfg.channels = {
        ...cfg.channels,
        qiscrm: {
          ...qiscrmCfg,
          accounts: Object.keys(accounts).length > 0 ? accounts : undefined,
        },
      };

      return nextCfg;
    },

    isConfigured: () => true,

    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name || account.accountId,
      wxId: account.wxId,
      freWxId: account.freWxId,
    }),

    resolveAllowFrom: () => [],

    formatAllowFrom: ({ allowFrom }) => allowFrom.map(String),
  },

  security: {
    collectWarnings: () => [],
  },

  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,

    applyAccountConfig: ({ cfg, accountId }) => {
      const qiscrmCfg = cfg.channels?.["openclaw-wecom-qiscrm"] as QiscrmConfig | undefined;
      const isDefault = !accountId || accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            qiscrm: {
              ...qiscrmCfg,
              enabled: true,
            },
          },
        };
      }

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          qiscrm: {
            ...qiscrmCfg,
            accounts: {
              ...qiscrmCfg?.accounts,
              [accountId]: {
                ...qiscrmCfg?.accounts?.[accountId],
                enabled: true,
              },
            },
          },
        },
      };
    },
  },

  messaging: {
    normalizeTarget: (target): any => {
      if (target.startsWith("user:")) {
        return { type: "direct", id: target.slice(5) };
      }
      // Assume direct message if no prefix
      return { type: "direct", id: target };
    },

    targetResolver: {
      looksLikeId: (id) => {
        // freWxId 或 wxId 格式
        return id.startsWith("wxid_") || id.startsWith("wx_");
      },
      hint: "<wxid_xxx|user:wxid_xxx>",
    },
  },

  directory: {
    self: async () => null,

    listPeers: async () => [],

    listGroups: async () => [],
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },

    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),

    probeAccount: async (params: any) => {
      const cfg = params.cfg;
      const accountId = params.account.accountId;
      const account = resolveQiscrmAccount({ cfg, accountId });
      const client = new QiscrmClient(account.baseUrl, account.apiKey);

      try {
        // 尝试调用 poll API 来验证连接
        await client.pollMessages(account.wxId, account.freWxId);
        return {
          ok: true,
          wxId: account.wxId,
          freWxId: account.freWxId,
        };
      } catch (err: any) {
        return {
          ok: false,
          error: err.message,
        };
      }
    },

    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      wxId: account.wxId,
      freWxId: account.freWxId,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      const { cfg, accountId, abortSignal, setStatus, runtime } = ctx;
      const log = runtime?.log ?? console.log;
      const error = runtime?.error ?? console.error;

      // 检查是否已有轮询在运行，如果有则先停止
      const existingLoop = runningPollLoops.get(accountId);
      if (existingLoop) {
        log(`Stopping existing poll loop for account: ${accountId}`);
        existingLoop.stop();
        runningPollLoops.delete(accountId);
      }

      const account = resolveQiscrmAccount({ cfg, accountId });

      log(`Starting Qiscrm account: ${accountId}`);
      log(`Base URL: ${account.baseUrl}`);
      log(`wxId: ${account.wxId}, freWxId: ${account.freWxId}`);

      const client = new QiscrmClient(account.baseUrl, account.apiKey);

      // 标记为运行中
      setStatus({ accountId, running: true });

      // Polling 间隔 (5秒)
      const POLL_INTERVAL = 5000;
      let running = true;

      // 创建轮询循环
      const pollLoop = async () => {
        while (running) {
          try {
            const response = await client.pollMessages(
              account.wxId,
              account.freWxId
            );

            log(`Poll response: ${JSON.stringify(response).slice(0, 200)}`);
            // 处理响应 (参考 nanobot 实现)
            if (response.success && response.code === 10200) {
              const messages = response.data?.messages || [];

              for (const msg of messages) {
                try {
                  await handleQiscrmMessage({
                    cfg,
                    message: msg,
                    runtime: ctx.runtime,
                    accountId,
                    account,
                  });
                } catch (err) {
                  error(`Failed to handle message: ${String(err)}`);
                }
              }
            }
          } catch (err: any) {
            log(`Poll error: ${err.message}`);
          }

          // 等待下一个轮询间隔
          log(`Waiting ${POLL_INTERVAL}ms before next poll...`);
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
          log(`Poll interval complete, starting next poll`);
        }
      };

      // 启动轮询
      pollLoop().catch((err) => {
        error(`Poll loop error: ${String(err)}`);
      });

      // 监听中止信号
      abortSignal?.addEventListener("abort", () => {
        running = false;
      });

      log(`Qiscrm account ${accountId} started successfully`);

      // 返回停止函数
      const stopFn = () => {
        running = false;
        runningPollLoops.delete(accountId);
        setStatus({ accountId, running: false });
        log(`Qiscrm account ${accountId} stopped`);
      };

      // 保存停止函数到全局映射
      runningPollLoops.set(accountId, { stop: stopFn });

      return { stop: stopFn };
    },
  },

  outbound: {
    deliveryMode: "direct",

    async sendText(params: any) {
      const { cfg, to, text, accountId } = params;
      const account = resolveQiscrmAccount({ cfg, accountId });
      const client = new QiscrmClient(account.baseUrl, account.apiKey);

      // 确定发送目标
      const freWxId = to?.id || account.freWxId;

      await client.sendMessage(
        account.orgId,
        account.wxId,
        freWxId,
        "text",
        text
      );

      return {
        channel: "openclaw-wecom-qiscrm",
        messageId: `msg_${Date.now()}`,
        timestamp: Date.now(),
      };
    },

    async sendMedia(params: any) {
      const { cfg, to, mediaUrl, text, accountId } = params;
      const account = resolveQiscrmAccount({ cfg, accountId });
      const client = new QiscrmClient(account.baseUrl, account.apiKey);

      // 确定发送目标
      const freWxId = to?.id || account.freWxId;

      let content = mediaUrl;
      let msgType = "image";

      // 如果是本地文件路径，先上传到七牛云
      if (!mediaUrl.startsWith("http")) {
        const filename = mediaUrl.split("/").pop() || "file";
        const uploadedUrl = await client.uploadToQiniu(mediaUrl, filename);

        if (uploadedUrl) {
          content = uploadedUrl;
        } else {
          // 上传失败，发送文本消息
          msgType = "text";
          content = text || `[文件: ${filename}]`;
        }
      }

      // 发送文本内容（如果提供）
      if (text?.trim()) {
        await client.sendMessage(
          account.orgId,
          account.wxId,
          freWxId,
          "text",
          text
        );
      }

      // 发送媒体内容
      await client.sendMessage(
        account.orgId,
        account.wxId,
        freWxId,
        msgType,
        content
      );

      return {
        channel: "openclaw-wecom-qiscrm",
        messageId: `msg_${Date.now()}`,
      };
    },
  },
};
