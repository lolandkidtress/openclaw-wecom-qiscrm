/**
 * 插件本地测试脚本 - 测试 Qiscrm Polling API
 */

// ===== 测试配置 =====
const TEST_CONFIG = {
  baseUrl: "http://localhost:3000",
  apiKey: "test_api_key_xxx",
  orgId: "test_org_id",
  wxId: "wxid_test123",
  freWxId: "wxid_friend456",
};

/**
 * QiscrmClient (简化版)
 */
class QiscrmClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async pollMessages(wxId: string, freWxId: string): Promise<any> {
    const url = `${this.baseUrl}/callback/v1/qiscrmbot/pollMsg`;
    const body = {
      secret: this.apiKey,
      wxId,
      freWxId,
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

  async sendMessage(
    orgId: string,
    wxId: string,
    freWxId: string,
    msgType: string,
    content: string
  ): Promise<void> {
    const url = `${this.baseUrl}/callback/v1/wx/bilinapi/qy/sendQyFriendMsg`;
    const body = {
      orgId,
      wxId,
      freWxId,
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
  }
}

// ===== 测试 1: Polling API =====
async function testPoll() {
  console.log("\n🧪 测试 Poll API...");

  const client = new QiscrmClient(TEST_CONFIG.baseUrl, TEST_CONFIG.apiKey);

  try {
    console.log("  - 测试 pollMessages()");
    const result = await client.pollMessages(TEST_CONFIG.wxId, TEST_CONFIG.freWxId);
    console.log("  ✓ Response:", result);
  } catch (err: any) {
    console.log("  ✗ pollMessages 失败:", err.message);
  }
}

// ===== 测试 2: 发送消息 =====
async function testSend() {
  console.log("\n🧪 测试发送消息...");

  const client = new QiscrmClient(TEST_CONFIG.baseUrl, TEST_CONFIG.apiKey);

  try {
    console.log("  - 测试 sendMessage()");
    await client.sendMessage(
      TEST_CONFIG.orgId,
      TEST_CONFIG.wxId,
      TEST_CONFIG.freWxId,
      "text",
      "测试消息"
    );
    console.log("  ✓ 发送成功");
  } catch (err: any) {
    console.log("  ✗ sendMessage 失败:", err.message);
  }
}

// ===== 测试 3: 模拟 Polling 循环 =====
async function testPollLoop() {
  console.log("\n🧪 测试 Polling 循环...");

  const client = new QiscrmClient(TEST_CONFIG.baseUrl, TEST_CONFIG.apiKey);

  let count = 0;
  const maxIterations = 3;

  console.log("  - 开始轮询 (最多 3 次)...");

  const interval = setInterval(async () => {
    try {
      const result = await client.pollMessages(TEST_CONFIG.wxId, TEST_CONFIG.freWxId);
      console.log(`  ✓ 第 ${count + 1} 次轮询:`, result);
    } catch (err: any) {
      console.log(`  ✗ 第 ${count + 1} 次轮询失败:`, err.message);
    }

    count++;
    if (count >= maxIterations) {
      clearInterval(interval);
      console.log("  ✓ 轮询测试完成");
    }
  }, 2000);
}

// ===== 主测试流程 =====
async function main() {
  console.log("🚀 开始 Qiscrm Polling API 测试\n");

  // 测试 Poll
  await testPoll();

  // 测试发送
  await testSend();

  // 测试轮询循环
  await testPollLoop();

  // 等待轮询完成
  await new Promise((r) => setTimeout(r, 7000));

  console.log("\n✅ 测试完成");
  process.exit(0);
}

main().catch((err) => {
  console.error("测试失败:", err);
  process.exit(1);
});
