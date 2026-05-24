# 智能电量监控系统

实时监控宿舍/房间电费余额和用电量，支持企业微信和 Telegram 推送每日用电报告、余额预警和异常告警。

## 功能

- 定时采集电费数据（每小时整点）
- 可视化展示每日用电趋势（支持日期切换查看历史）
- 历史用电数据统计（7天/15天/30天），今日数据自动归一化
- 通知推送：企业微信 + Telegram 双通道
- 余额预警：低于阈值时自动推送通知
- 每日报告：每晚 23:30 推送今日用电汇总
- 深色模式：自动跟随系统主题
- 登录认证保护
- 手动触发数据采集
- 响应式布局，支持手机端访问

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | React 18 + Ant Design 5 + Chart.js + IconPark |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 定时任务 | node-cron |
| 容器化 | Docker |

## 快速开始

### 1. 配置环境变量

复制 `.env.example` 为 `.env` 并填写：

```env
# 必填 - 小程序的登录 Cookie
SHIRO_COOKIE=shiroJID=你的cookie

# 必填 - 登录用户名和密码
LOGIN_USERNAME=admin
LOGIN_PASSWORD=你的密码

# 选填 - 企业微信群机器人 Webhook URL
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key

# 选填 - Telegram 机器人 Token（从 @BotFather 获取）
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklmNOPqrstUVwxyz

# 选填 - 接收通知的 Telegram 用户 ID（从 @userinfobot 获取）
TELEGRAM_CHAT_ID=123456789

# 选填 - 电费余额预警阈值（低于此值时发送通知，设为0或留空关闭）
ALERT_THRESHOLD=20

# 选填 - Cookie 签名密钥
COOKIE_SECRET=任意随机字符串
```

> **如何获取 SHIRO_COOKIE？**
> 1. 打开微信小程序
> 2. 进入电费查询页面
> 3. 通过抓包工具获取请求中的 Cookie 值

### 2. 使用 Docker 运行（推荐）

```bash
docker compose build --no-cache
docker compose up -d
```

访问 `http://localhost:3000`

### 3. 本地开发

需要同时启动后端和前端：

**终端 1 - 启动后端：**

```bash
npm install
node server.js
```

后端运行在 `http://localhost:3000`

**终端 2 - 启动前端开发服务器：**

```bash
cd client
npm install
npm run dev
```

前端运行在 `http://localhost:5173`，Vite 会自动代理 API 请求到后端。

### 4. 手动采集

登录系统后，点击右上角 **手动获取** 按钮即可立即采集最新数据。

## 项目结构

```
electricity-monitor/
├── server.js              # 后端服务入口
├── package.json           # 后端依赖
├── Dockerfile             # Docker 构建
├── docker-compose.yml     # Docker Compose 配置
├── .env                   # 环境变量（勿提交）
├── .env.example           # 环境变量示例
├── .gitignore
├── data/                  # SQLite 数据库文件
└── client/                # 前端项目
    ├── package.json
    ├── index.html
    ├── vite.config.js
    ├── public/
    │   └── lightning.svg  # Favicon
    └── src/
        ├── main.jsx       # 入口（主题检测）
        ├── App.jsx        # 根组件（CSS 变量 & 认证管理）
        ├── api.js         # API 请求模块
        └── pages/
            ├── Login.jsx      # 登录页
            └── Dashboard.jsx  # 仪表盘页
```

## API 接口

| 接口 | 方法 | 说明 | 需登录 |
|---|---|---|---|
| `/api/login` | POST | 登录 | 否 |
| `/api/logout` | POST | 登出 | 否 |
| `/api/check-auth` | GET | 检查登录状态 | 否 |
| `/api/current` | GET | 获取当前数据 | 是 |
| `/api/history` | GET | 获取历史统计数据（7/15/30天） | 是 |
| `/api/records-by-date` | GET | 按日期查询详细记录 | 是 |
| `/api/trigger-collect` | GET | 手动触发采集 | 是 |
| `/api/test-notify` | GET | 发送测试通知 | 是 |
| `/api/send-report` | GET | 发送今日日报 | 是 |

## 定时任务

| 时间 | 任务 | 说明 |
|---|---|---|
| 每小时整点 | `collectData` | 采集电费数据 |
| 每晚 23:30 | `sendDailyReport` | 发送今日用电报告 |
| 余额低于阈值 | `checkThresholdAndAlert` | 发送余额预警通知 |

## 通知渠道

| 渠道 | 配置变量 | 说明 |
|---|---|---|
| 企业微信 | `WECOM_WEBHOOK_URL` | 群机器人 Webhook |
| Telegram | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | 机器人私聊推送 |

## 许可

[MIT](LICENSE)
