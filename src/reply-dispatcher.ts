import type {
  ClawdbotConfig,
  RuntimeEnv,
  ReplyPayload,
} from "openclaw/plugin-sdk";
import { createReplyPrefixContext } from "openclaw/plugin-sdk";
import { getQiscrmRuntime } from "./runtime.js";
import type { ResolvedQiscrmAccount } from "./types.js";

/**
 * Qiscrm API 客户端 (内联实现)
 */
class QiscrmApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

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
}

export type CreateQiscrmReplyDispatcherParams = {
  cfg: ClawdbotConfig;
  agentId: string;
  runtime: RuntimeEnv;
  account: ResolvedQiscrmAccount;
  /** The freWxId to send replies to */
  replyTo: string;
  accountId?: string;
};

export function createQiscrmReplyDispatcher(params: CreateQiscrmReplyDispatcherParams): any {
  const core = getQiscrmRuntime();
  const { cfg, agentId, runtime, account, replyTo, accountId } = params as any;

  const prefixContext = createReplyPrefixContext({
    cfg: cfg as any,
    agentId,
  });

  const client = new QiscrmApiClient(account.baseUrl, account.apiKey);

  const { dispatcher, replyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      responsePrefix: prefixContext.responsePrefix,
      responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
      humanDelay: undefined,
      deliver: async (payload: ReplyPayload) => {
        runtime.log?.(`qiscrm[${accountId}] deliver called: text=${payload.text?.slice(0, 100)}`);
        const text = payload.text ?? "";
        if (!text.trim()) {
          runtime.log?.(`qiscrm[${accountId}] deliver: empty text, skipping`);
          return;
        }

        // 简单分块
        const chunks = text.match(/.{1,2000}/g) || [text];
        runtime.log?.(`qiscrm[${accountId}] deliver: sending ${chunks.length} chunks to ${replyTo}`);

        for (const chunk of chunks) {
          try {
            await client.sendMessage(
              account.orgId,
              account.wxId,
              replyTo,
              "text",
              chunk
            );
            runtime.log?.(`qiscrm[${accountId}] sendText success`);
          } catch (err) {
            runtime.error?.(`qiscrm[${accountId}] sendText failed: ${String(err)}`);
            throw err;
          }
        }
      },
      onError: (err, info) => {
        runtime.error?.(`qiscrm[${accountId}] ${info.kind} reply failed: ${String(err)}`);
      },
    });

  return {
    dispatcher,
    replyOptions: {
      ...replyOptions,
      onModelSelected: prefixContext.onModelSelected,
    },
    markDispatchIdle,
  };
}
