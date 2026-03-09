/**
 * Configuration types for Qiscrm channel (nanobot compatible)
 * 使用 Polling 方式获取消息
 *
 * 配置结构参考 nanobot/nanobot/channels/qiscrm.py
 */

export interface QiscrmAccountConfig {
  enabled?: boolean;
  name?: string;

  // nanobot 参数
  wxId: string;          // 企业微信账号 (allow_qy_account_from)
  freWxId: string;       // 好友账号 (allow_qy_friend_from)
}

export interface QiscrmConfig {
  enabled?: boolean;

  // nanobot QiscrmConfig 参数
  baseUrl: string;       // API 基础 URL
  apiKey: string;        // API Key
  orgId: string;         // 组织 ID

  // 简化配置（单账号，顶级字段）
  wxId?: string;         // 企业微信账号
  freWxId?: string;      // 好友账号

  // 多账号配置
  accounts?: Record<string, QiscrmAccountConfig | undefined>;
}

// Schema object for OpenClaw config validation
export const QiscrmConfigSchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },

    // nanobot 参数
    baseUrl: { type: "string" },
    apiKey: { type: "string" },
    orgId: { type: "string" },

    // 简化配置（顶级字段）
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
};
