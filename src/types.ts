import type { QiscrmAccountConfig, QiscrmConfig } from "./config-schema.js";

// Re-export for convenience
export type { QiscrmConfig, QiscrmAccountConfig };

export type ResolvedQiscrmAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  baseUrl: string;
  apiKey: string;
  orgId: string;
  wxId: string;
  freWxId: string;
  config: QiscrmAccountConfig;
};

export type QiscrmMessageType = "text" | "image" | "file" | "voice" | "unknown";

export type QiscrmPollMessage = {
  toid: string;
  wechatAccount: string;
  totype: number;
  msgId: string;
  fromid: string;
  wechattime: number;
  content: string;
  chatMsgtype: number;
  wxId: string;
  freWxId: string;
  wxType: string;
};

export type QiscrmPollResponse = {
  note: string;
  code: number;
  data: {
    count: number;
    freWxId: string;
    messages: QiscrmPollMessage[];
    secret: string;
    wxId: string;
  };
  success: boolean;
};

export type QiscrmMessageContext = {
  id: string;
  type: QiscrmMessageType;
  sender: {
    id: string;
    name: string;
  };
  recipient: {
    id: string;
  };
  content: string;
  timestamp: number;
  threadId: string;
  group?: {
    id: string;
    name: string;
  };
  media?: string[];
  raw: QiscrmPollMessage;
};
