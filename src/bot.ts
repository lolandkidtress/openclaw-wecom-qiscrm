import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { getQiscrmRuntime } from "./runtime.js";
import { createQiscrmReplyDispatcher } from "./reply-dispatcher.js";
import type { QiscrmMessageContext, ResolvedQiscrmAccount, QiscrmPollMessage } from "./types.js";

// --- Message deduplication ---
const processedMessages = new Map<string, number>();
const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const DEDUP_MAX_SIZE = 1000;
const DEDUP_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let lastCleanup = Date.now();

function tryRecordMessage(messageId: string): boolean {
  const now = Date.now();

  // Periodic cleanup
  if (now - lastCleanup > DEDUP_CLEANUP_INTERVAL_MS) {
    lastCleanup = now;
    for (const [id, ts] of processedMessages) {
      if (now - ts > DEDUP_WINDOW_MS) processedMessages.delete(id);
    }
  }

  // Evict oldest if at capacity
  if (processedMessages.size >= DEDUP_MAX_SIZE) {
    const oldest = processedMessages.keys().next().value;
    if (oldest) processedMessages.delete(oldest);
  }

  if (processedMessages.has(messageId)) return false;
  processedMessages.set(messageId, now);
  return true;
}

/**
 * 将 nanobot 消息格式转换为 OpenClaw 消息格式
 */
function convertToMessageContext(msg: QiscrmPollMessage): QiscrmMessageContext {
  // chatMsgtype: 1010=文本, 1020=图片, 1030=文件, 1040=语音
  const chatMsgtype = msg.chatMsgtype;

  let type: QiscrmMessageContext["type"] = "unknown";
  let media: string[] = [];
  let content = msg.content;

  if (chatMsgtype === 1010) {
    type = "text";
  } else if (chatMsgtype === 1020) {
    type = "image";
    media = msg.content ? [msg.content] : [];
    content = `[图片: ${msg.content}]`;
  } else if (chatMsgtype === 1030) {
    type = "file";
    media = msg.content ? [msg.content] : [];
    content = `[文件: ${msg.content}]`;
  } else if (chatMsgtype === 1040) {
    type = "voice";
    content = `[语音转文字: ${msg.content}]`;
  } else {
    type = "unknown";
    content = `不支持的消息类型`;
  }

  // 添加微信好友信息到消息内容
  content = content + `[微信好友Id: ${msg.freWxId}][微信Id: ${msg.wxId}]`;

  // sender id: freWxId > wxId > fromid
  const senderId = msg.freWxId || msg.wxId || msg.fromid || "unknown";
  const chatId = msg.freWxId || msg.wxId || msg.toid || "unknown";

  return {
    id: msg.msgId || String(Date.now()),
    type,
    sender: {
      id: senderId,
      name: msg.wechatAccount || senderId,
    },
    recipient: {
      id: chatId,
    },
    content,
    timestamp: msg.wechattime || Date.now(),
    threadId: chatId,
    media,
    raw: msg,
  };
}

export async function handleQiscrmMessage(params: {
  cfg: ClawdbotConfig;
  message: QiscrmPollMessage;
  runtime?: RuntimeEnv;
  accountId?: string;
  account: ResolvedQiscrmAccount;
}): Promise<void> {
  const { cfg, message: rawMessage, runtime, accountId, account } = params;

  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  // 检查 totype: 只处理收到的消息 (totype=2)
  if (rawMessage.totype !== 2) {
    log(`openclaw-wecom-qiscrm: skipping message with totype=${rawMessage.totype} (not incoming)`);
    return;
  }

  // 转换为标准消息格式
  const message = convertToMessageContext(rawMessage);

  // Dedup check
  if (!tryRecordMessage(message.id)) {
    log(`openclaw-wecom-qiscrm: skipping duplicate message ${message.id}`);
    return;
  }

  log(`openclaw-wecom-qiscrm[${accountId}]: received ${message.type} from ${message.sender.id}`);

  // 支持所有消息类型：text, image, file, voice, unknown

  try {
    const core = getQiscrmRuntime();

    const wecomQiscrmFrom = `openclaw-wecom-qiscrm:${message.sender.id}`;
    const wecomQiscrmTo = `user:${message.sender.id}`;

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "openclaw-wecom-qiscrm",
      accountId: account.accountId,
      peer: {
        kind: "direct",
        id: message.sender.id,
      },
    });

    const preview = message.content.replace(/\s+/g, " ").slice(0, 160);
    const inboundLabel = `Qiscrm[${accountId}] DM from ${message.sender.id}`;

    core.system.enqueueSystemEvent(`${inboundLabel}: ${preview}`, {
      sessionKey: route.sessionKey,
      contextKey: `openclaw-wecom-qiscrm:message:${message.sender.id}:${message.id}`,
    });

    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);

    // Build message body with speaker attribution
    const speaker = message.sender.name || message.sender.id;
    const messageBody = `${speaker}: ${message.content}`;

    const envelopeFrom = message.sender.id;

    const body = core.channel.reply.formatAgentEnvelope({
      channel: "Qiscrm",
      from: envelopeFrom,
      timestamp: new Date(message.timestamp),
      envelope: envelopeOptions,
      body: messageBody,
    });

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: body,
      RawBody: message.content,
      CommandBody: message.content,
      From: wecomQiscrmFrom,
      To: wecomQiscrmTo,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: "direct",
      SenderName: message.sender.name || message.sender.id,
      SenderId: message.sender.id,
      Provider: "openclaw-wecom-qiscrm" as const,
      Surface: "openclaw-wecom-qiscrm" as const,
      MessageSid: message.id,
      Timestamp: Date.now(),
      WasMentioned: false,
      CommandAuthorized: true,
      OriginatingChannel: "openclaw-wecom-qiscrm" as const,
      OriginatingTo: wecomQiscrmTo,
    });

    // 私信回复给发送者
    const replyTo = message.sender.id;

    const { dispatcher, replyOptions, markDispatchIdle } = createQiscrmReplyDispatcher({
      cfg,
      agentId: route.agentId,
      runtime: runtime as RuntimeEnv,
      account,
      replyTo,
      accountId: account.accountId,
    });

    log(`openclaw-wecom-qiscrm[${accountId}]: dispatching to agent (session=${route.sessionKey})`);

    const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });

    markDispatchIdle();

    log(`openclaw-wecom-qiscrm[${accountId}]: dispatch complete (queuedFinal=${queuedFinal}, replies=${counts.final})`);
  } catch (err) {
    error(`openclaw-wecom-qiscrm[${accountId}]: failed to dispatch message: ${String(err)}`);
  }
}
