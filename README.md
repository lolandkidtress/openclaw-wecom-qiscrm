# openclaw-wecom-qiscrm

OpenClaw WeCom channel plugin via Qiscrm API for [OpenClaw](https://github.com/openclaw/openclaw).

企业微信 与 外部联系人聊天 OpenClaw 扩展插件

[English](#english) | [中文](#中文)

---

## English

### Installation

#### Install From NPM

```bash
openclaw plugins install openclaw-wecom-qiscrm
```

### Upgrade

```bash
openclaw plugins update openclaw-wecom-qiscrm
```

#### From source

```bash
git clone https://github.com/lolandkidtress/openclaw-wecom-qiscrm.git
cd openclaw-wecom-qiscrm
pnpm install
openclaw plugins install -l ../openclaw-wecom-qiscrm
```


### Upgrade

```bash
openclaw plugins update wecom-qiscrm
```

### Configuration

1. Get API Key from customer service
2. Configure the plugin:

```bash
# Set API base URL (required)
openclaw config set channels.qiscrm.baseUrl "http://your-api-server"

# Set API Key (required)
openclaw config set channels.qiscrm.apiKey "your-api-key"

# Set Organization ID (required)
openclaw config set channels.qiscrm.orgId "your-org-id"

# Set WeChat ID (required)
openclaw config set channels.qiscrm.wxId "wxid_xxx"

# Set Friend WeChat ID (required)
openclaw config set channels.qiscrm.freWxId "wxid_friend"

# Enable the channel
openclaw config set channels.qiscrm.enabled true
```

### Configuration Options

```yaml
# ~/.openclaw/openclaw.json
channels:
  qiscrm:
    enabled: true
    baseUrl: "http://your-api-server"    # Required - API base URL
    apiKey: "your-api-key"               # Required
    orgId: "your-org-id"                 # Required - Organization ID
    wxId: "wxid_xxx"                     # Required - WeChat ID
    freWxId: "wxid_friend"               # Required - Friend WeChat ID
```

### Features

- Direct messages only (Polling mode)
- Text, image, file, and voice messages
- 5-second polling interval
- Multi-account support

### How it works

- **Message receiving**: Polling API (every 5 seconds)
  - API: `POST {baseUrl}/callback/v1/qiscrmbot/pollMsg`
- **Message sending**: Direct API call
  - API: `POST {baseUrl}/callback/v1/wx/bilinapi/qy/sendQyFriendMsg`

### FAQ

#### Bot cannot receive messages

1. Make sure `baseUrl` is configured correctly
2. Make sure `wxId` and `freWxId` are correct
3. Check if the API server is running
4. Check gateway status: `openclaw gateway status`

---

## 中文

### 安装

#### 方式一：从 npm 安装

```bash
openclaw plugins install openclaw-wecom-qiscrm
```

### 升级

```bash
openclaw plugins update openclaw-wecom-qiscrm
```

#### 方式二：从源码安装

```bash
git clone https://github.com/lolandkidtress/openclaw-wecom-qiscrm.git
cd openclaw-wecom-qiscrm
pnpm install
openclaw plugins install -l ../openclaw-wecom-qiscrm
```

#### 更新源码

```bash
git pull origin main
pnpm install
pnpm build
```

> 链接模式下构建后即生效，重启 Gateway 即可。

### 配置

1. 获取 API Key（联系客服）
2. 配置插件：

```bash
# 设置 API 基础地址（必填）
openclaw config set channels.qiscrm.baseUrl "http://你的API服务器"

# 设置 API Key（必填）
openclaw config set channels.qiscrm.apiKey "your-api-key"

# 设置组织 ID（必填）
openclaw config set channels.qiscrm.orgId "your-org-id"

# 设置企业微信 ID（必填）
openclaw config set channels.qiscrm.wxId "wxid_xxx"

# 设置好友微信 ID（必填）
openclaw config set channels.qiscrm.freWxId "wxid_friend"

# 启用通道
openclaw config set channels.qiscrm.enabled true
```

### 配置选项

```yaml
# ~/.openclaw/openclaw.json
channels:
  qiscrm:
    enabled: true
    baseUrl: "http://你的API服务器"    # 必填 - API 基础地址
    apiKey: "your-api-key"             # 必填
    orgId: "your-org-id"               # 必填 - 组织 ID
    wxId: "wxid_xxx"                   # 必填 - 企业微信 ID
    freWxId: "wxid_friend"             # 必填 - 好友微信 ID
```

### 功能

- 私信（轮询模式）
- 文本、图片、文件、语音消息
- 5 秒轮询间隔
- 多账号支持

### 工作原理

- **接收消息**: 轮询 API（每 5 秒）
  - API: `POST {baseUrl}/callback/v1/qiscrmbot/pollMsg`
- **发送消息**: 直接 API 调用
  - API: `POST {baseUrl}/callback/v1/wx/bilinapi/qy/sendQyFriendMsg`

### 常见问题

#### 机器人收不到消息

1. 确保 `baseUrl` 配置正确
2. 确保 `wxId` 和 `freWxId` 正确
3. 检查 API 服务是否运行
4. 检查 gateway 状态：`openclaw gateway status`

---
## 联系客服

WhatsApp: 85254200437

## 申 明

本插件仅供学习和研究使用，请勿用于非法用途，否则后果自负。

## License

MIT
