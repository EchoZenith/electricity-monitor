require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || 'electricity-monitor-secret'));

const DB_PATH = path.join(__dirname, 'data', 'electricity.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    surplus REAL NOT NULL,
    amount REAL NOT NULL,
    timestamp INTEGER NOT NULL,
    room_name TEXT DEFAULT ''
  )
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_records_timestamp ON records(timestamp)
`);

const insertStmt = db.prepare(
  'INSERT INTO records (surplus, amount, timestamp, room_name) VALUES (?, ?, ?, ?)'
);
const updateStmt = db.prepare(
  'UPDATE records SET surplus = ?, amount = ?, timestamp = ? WHERE id = ?'
);

const API_URL = 'https://application.xiaofubao.com/app/electric/queryRoomSurplus';
const API_BODY = 'areaId=2105355156363427841&buildingCode=34&floorCode=54&roomCode=12828&platform=YUNMA_WXAPP_CHONGD';
const COOKIE = process.env.SHIRO_COOKIE;

if (!COOKIE) {
  console.error('错误: 环境变量 SHIRO_COOKIE 未设置，请在 .env 文件中配置');
  process.exit(1);
}

const LOGIN_USERNAME = process.env.LOGIN_USERNAME || 'admin';
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD;

const WECOM_WEBHOOK_URL = process.env.WECOM_WEBHOOK_URL;

if (!WECOM_WEBHOOK_URL) {
  console.warn('警告: 环境变量 WECOM_WEBHOOK_URL 未设置，企业微信通知功能将不可用');
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
  console.log('Telegram 机器人通知已启用');
} else if (TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_ID) {
  console.warn('警告: 需要同时设置 TELEGRAM_BOT_TOKEN 和 TELEGRAM_CHAT_ID 才能使用 Telegram 通知');
} else {
  console.log('Telegram 机器人通知未配置');
}

const ALERT_THRESHOLD = parseFloat(process.env.ALERT_THRESHOLD) || 0;

if (ALERT_THRESHOLD > 0) {
  console.log(`电费预警: 当余额低于 ¥${ALERT_THRESHOLD} 时将发送通知`);
}

let lastAlertedAmount = null;

function requireAuth(req, res, next) {
  const auth = req.signedCookies.auth;
  if (auth === LOGIN_USERNAME) {
    return next();
  }
  res.status(401).json({ success: false, message: '未登录' });
}

function getLatestRecord() {
  const row = db.prepare('SELECT * FROM records ORDER BY timestamp DESC LIMIT 1').get();
  return row || null;
}

function getAllRecords() {
  return db.prepare('SELECT * FROM records ORDER BY timestamp ASC').all();
}

async function sendWecomNotification(content) {
  if (!WECOM_WEBHOOK_URL) return;
  try {
    const res = await fetch(WECOM_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { content }
      })
    });
    const body = await res.json();
    if (body.errcode !== 0) {
      console.error(`企业微信通知发送失败: errcode=${body.errcode}, errmsg=${body.errmsg}`);
    }
  } catch (err) {
    console.error('企业微信通知发送失败:', err.message);
  }
}

async function sendTelegramNotification(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const tgText = text
    .replace(/^## (.+)$/gm, '*$1*')
    .replace(/^> /gm, '')
    .trim();
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: tgText,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      })
    });
    const body = await res.json();
    if (!body.ok) {
      console.error(`Telegram 通知发送失败: ${body.description}`);
    }
  } catch (err) {
    console.error('Telegram 通知发送失败:', err.message);
  }
}

async function sendAllNotifications(markdownContent, plainText) {
  await Promise.all([
    sendWecomNotification(markdownContent),
    sendTelegramNotification(plainText || markdownContent),
  ]);
}

function getLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getRecordsByDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const startOfDay = new Date(year, month - 1, day);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
  return db.prepare(
    'SELECT * FROM records WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC'
  ).all(startOfDay.getTime(), endOfDay.getTime());
}

async function fetchData() {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Cookie': COOKIE,
        'x-requested-with': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) wxwork/5.0.8 MicroMessenger/7.0.0(0x17000000) MacWechat/5.0.8(0x15000800) MiniProgramEnv/Mac MiniProgram/',
        'Referer': 'https://application.xiaofubao.com/',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        'Origin': 'https://application.xiaofubao.com'
      },
      body: API_BODY
    });

    if (!response.ok) {
      console.error(`请求失败: ${response.status}`);
      return null;
    }

    const text = await response.text();
    const json = JSON.parse(text);

    if (json.success && json.data) {
      return {
        surplus: json.data.surplus,
        amount: json.data.amount,
        timestamp: Date.now(),
        roomName: json.data.displayRoomName || ''
      };
    }
    return null;
  } catch (err) {
    console.error('请求出错:', err.message);
    return null;
  }
}

async function collectData() {
  const data = await fetchData();
  if (!data) {
    console.log(`[${new Date().toLocaleString()}] 采集失败: 接口请求异常`);
    await sendAllNotifications(
      '## 电费采集异常\n\n' +
      `> 时间：${new Date().toLocaleString('zh-CN')}\n\n` +
      '电费接口请求失败，请检查网络或 Cookie 是否过期。'
    );
    return;
  }

  const latest = getLatestRecord();
  if (latest) {
    const sameHour = new Date(latest.timestamp).getHours() === new Date(data.timestamp).getHours();
    const sameDay = new Date(latest.timestamp).toDateString() === new Date(data.timestamp).toDateString();
    if (sameDay && sameHour) {
      updateStmt.run(data.surplus, data.amount, data.timestamp, latest.id);
      console.log(`[${new Date().toLocaleString()}] 更新本小时记录: ${data.surplus}度, ¥${data.amount}`);
      await checkThresholdAndAlert(data.amount);
      return;
    }
  }

  insertStmt.run(data.surplus, data.amount, data.timestamp, data.roomName);
  console.log(`[${new Date().toLocaleString()}] 新增记录: ${data.surplus}度, ¥${data.amount}`);
  await checkThresholdAndAlert(data.amount);
}

async function checkThresholdAndAlert(amount) {
  if (ALERT_THRESHOLD <= 0 || amount > ALERT_THRESHOLD) {
    lastAlertedAmount = null;
    return;
  }
  if (lastAlertedAmount !== null && amount >= lastAlertedAmount) return;
  lastAlertedAmount = amount;
  console.log(`[预警] 余额 ¥${amount} 低于阈值 ¥${ALERT_THRESHOLD}`);
  await sendAllNotifications(
    '## 电费余额预警\n\n' +
    `> 时间：${new Date().toLocaleString('zh-CN')}\n\n` +
    `当前余额 **¥${amount.toFixed(2)}**\n\n` +
    `已低于预警阈值 **¥${ALERT_THRESHOLD.toFixed(2)}**，请及时充值！`
  );
}

function calculateDailyUsage(records) {
  if (records.length < 2) return { dailyUsage: 0, todayUsage: 0, todayCost: 0, dailyRecords: [] };

  const dailyMap = {};

  records.forEach(record => {
    const dateStr = getLocalDateStr(new Date(record.timestamp));
    if (!dailyMap[dateStr]) {
      dailyMap[dateStr] = [];
    }
    dailyMap[dateStr].push(record);
  });

  const dailyRecords = [];
  const sortedDates = Object.keys(dailyMap).sort();
  let prevLastSurplus = null;

  for (let i = 0; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    const dayRecords = dailyMap[date].sort((a, b) => a.timestamp - b.timestamp);
    const firstSurplus = dayRecords[0].surplus;
    const lastSurplus = dayRecords[dayRecords.length - 1].surplus;
    const base = prevLastSurplus !== null ? prevLastSurplus : firstSurplus;
    const usage = Math.round(Math.max(0, base - lastSurplus) * 100) / 100;

    const hoursSpan = (dayRecords[dayRecords.length - 1].timestamp - dayRecords[0].timestamp) / (1000 * 60 * 60);
    const avgPower = hoursSpan > 0 ? Math.round((usage / hoursSpan) * 1000) / 1000 : 0;

    dailyRecords.push({
      date,
      usage,
      avgPower,
      firstSurplus: base,
      lastSurplus,
      recordCount: dayRecords.length,
      hoursSpan,
    });

    prevLastSurplus = lastSurplus;
  }

  return { dailyUsage: 0, todayUsage: 0, todayCost: 0, dailyRecords };
}

const CLIENT_DIR = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(CLIENT_DIR)) {
  app.use(express.static(CLIENT_DIR));
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === LOGIN_USERNAME && password === LOGIN_PASSWORD) {
    res.cookie('auth', LOGIN_USERNAME, {
      signed: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true
    });
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: '用户名或密码错误' });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('auth');
  res.json({ success: true });
});

app.get('/api/check-auth', (req, res) => {
  const auth = req.signedCookies.auth;
  if (auth === LOGIN_USERNAME) {
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: '未登录' });
});

app.get('/api/current', requireAuth, (req, res) => {
  const allRecords = getAllRecords();
  if (allRecords.length === 0) {
    return res.json({ success: false, message: '暂无数据' });
  }
  const latest = allRecords[allRecords.length - 1];

  const todayStr = getLocalDateStr(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateStr(yesterday);

  const todayRecordsDB = getRecordsByDate(todayStr);
  const yesterdayRecords = getRecordsByDate(yesterdayStr);
  const yesterdayLast = yesterdayRecords.length > 0 ? yesterdayRecords[yesterdayRecords.length - 1] : null;
  const sortedToday = [...todayRecordsDB].sort((a, b) => a.timestamp - b.timestamp);

  let todayUsage = 0;
  let todayCost = 0;
  if (sortedToday.length >= 1) {
    const base = yesterdayLast || sortedToday[0];
    todayUsage = Math.max(0, Math.round((base.surplus - sortedToday[sortedToday.length - 1].surplus) * 100) / 100);
    todayCost = Math.max(0, Math.round((base.amount - sortedToday[sortedToday.length - 1].amount) * 100) / 100);
  }

  res.json({
    success: true,
    current: latest,
    todayUsage,
    todayCost,
    todayAvgPower: todayUsage > 0 ? Math.round((todayUsage / Math.max(1, new Date().getHours())) * 1000) / 1000 : 0,
    todayRecords: sortedToday,
    yesterdayLastRecord: yesterdayLast,
    totalRecords: allRecords.length
  });
});

app.get('/api/history', requireAuth, (req, res) => {
  const allRecords = getAllRecords();
  const { dailyRecords } = calculateDailyUsage(allRecords);
  const latest = allRecords.length > 0 ? allRecords[allRecords.length - 1] : null;

  const calcStats = (dailyRecords, n) => {
    const records = dailyRecords.slice(-n);
    if (records.length < 1) return { avgDaily: null, avgPower: null, estimatedDays: null };

    const todayStr = getLocalDateStr(new Date());
    let totalUsage = 0;
    let dayCount = 0;

    records.forEach(r => {
      if (r.date === todayStr) {
        const elapsed = Math.max(1, r.hoursSpan + 1);
        const normalized = Math.round((r.usage / elapsed) * 24 * 100) / 100;
        totalUsage += normalized;
      } else {
        totalUsage += r.usage;
      }
      dayCount++;
    });

    const avgDaily = Math.round((totalUsage / dayCount) * 100) / 100;
    const avgPower = Math.round((avgDaily / 24) * 1000) / 1000;
    const estimatedDays = avgDaily > 0 && latest
      ? Math.round(latest.surplus / avgDaily * 10) / 10
      : null;

    return { avgDaily, avgPower, estimatedDays };
  };

  const s7 = calcStats(dailyRecords, 7);
  const s15 = calcStats(dailyRecords, 15);
  const s30 = calcStats(dailyRecords, 30);

  res.json({
    success: true,
    current: latest,
    dailyRecords: dailyRecords.slice(-30),
    stats: {
      avgDaily7: s7.avgDaily,
      avgDaily15: s15.avgDaily,
      avgDaily30: s30.avgDaily,
      avgPower7: s7.avgPower,
      avgPower15: s15.avgPower,
      avgPower30: s30.avgPower,
      estimatedDays7: s7.estimatedDays,
      estimatedDays15: s15.estimatedDays,
      estimatedDays30: s30.estimatedDays,
    }
  });
});

cron.schedule('0 * * * *', async () => {
  console.log(`[定时任务] 开始采集数据...`);
  await collectData();
});

async function sendDailyReport() {
  const now = new Date();
  const dateStr = getLocalDateStr(now);

  const records = getRecordsByDate(dateStr);
  if (records.length < 1) {
    await sendAllNotifications(
      '## 电费日报\n\n' +
      `> 日期：${dateStr}\n\n` +
      `今日无数据记录`
    );
    return;
  }

  const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const dayBefore = new Date(now);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const dayBeforeRecords = getRecordsByDate(getLocalDateStr(dayBefore));
  const dayBeforeLast = dayBeforeRecords.length > 0 ? dayBeforeRecords[dayBeforeRecords.length - 1] : null;
  const baseSurplus = dayBeforeLast ? dayBeforeLast.surplus : first.surplus;
  const baseAmount = dayBeforeLast ? dayBeforeLast.amount : first.amount;

  const usage = Math.round(Math.max(0, baseSurplus - last.surplus) * 100) / 100;
  const cost = Math.round(Math.max(0, baseAmount - last.amount) * 100) / 100;

  const hoursSpan = (last.timestamp - first.timestamp) / (1000 * 60 * 60);
  const reportHours = hoursSpan > 0 ? hoursSpan : Math.max(1, (Date.now() - first.timestamp) / 3600000);
  const avgPower = Math.round((usage / reportHours) * 1000) / 1000;

  const latest = getLatestRecord();

  let content = '## 电费日报\n\n';
  content += `> 日期：${dateStr}\n\n`;
  content += `**今日用电**：${usage.toFixed(2)} 度\n`;
  content += `**今日电费**：¥${cost.toFixed(2)}\n`;
  content += `**平均功率**：${avgPower.toFixed(3)} kW\n`;
  content += `**数据记录**：${sorted.length} 条\n`;
  if (latest) {
    content += `\n**当前剩余电量**：${latest.surplus.toFixed(2)} 度\n`;
    content += `**当前剩余余额**：¥${latest.amount.toFixed(2)}\n`;
  }

  await sendAllNotifications(content);
}

cron.schedule('30 23 * * *', async () => {
  console.log(`[定时任务] 发送今日用电报告...`);
  await sendDailyReport();
});

app.get('/api/trigger-collect', requireAuth, async (req, res) => {
  await collectData();
  res.json({ success: true, message: '采集完成' });
});

app.get('/api/test-notify', requireAuth, async (req, res) => {
  await sendAllNotifications(
    '## 电费监控测试消息\n\n' +
    `> 时间：${new Date().toLocaleString('zh-CN')}\n\n` +
    '如果收到此消息，说明推送通知配置正常。'
  );
  res.json({ success: true, message: '测试消息已发送，请检查通知渠道' });
});

app.get('/api/send-report', requireAuth, async (req, res) => {
  await sendDailyReport();
  res.json({ success: true, message: '日报已发送' });
});

app.get('*', (req, res) => {
  if (fs.existsSync(CLIENT_DIR)) {
    res.sendFile(path.join(CLIENT_DIR, 'index.html'));
  } else {
    res.status(200).json({ message: 'API 服务运行中，前端请通过 Vite 开发服务器访问 (port 5173)' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================`);
  console.log(`  电费监控系统已启动`);
  console.log(`  访问地址: http://localhost:${PORT}`);
  console.log(`  数据库: ${DB_PATH}`);
  console.log(`========================================`);
});
