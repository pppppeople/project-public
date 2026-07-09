#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('./config');

const {
  ACCOUNT_FILE,
  SYNC_BUF_FILE,
  CONTEXT_FILE,
  PROCESSED_FILE,
  STATE_FILE,
  TASKS_FILE,
  MEMORY_EVENTS_FILE,
  DYNAMIC_MEMORY_FILE,
  MEMORY_REFRESH_STATE_FILE,
  TASK_LIVE_DIR,
  LOG_FILE,
  LAST_PROACTIVE_FILE,
  MEMORY_FILE,
  GENERATOR,
  CODEX_BIN,
  WORKSPACE,
  OPEN_TASK_TERMINAL,
  CHANNEL_VERSION,
} = config;

const MEMORY_REFRESH_SCRIPT = path.join(config.PROJECT_ROOT, 'scripts/refresh-memory.js');

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
  process.stderr.write(line);
}

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

function updateState(patch) {
  const state = readJson(STATE_FILE, {});
  writeJson(STATE_FILE, { ...state, ...patch, updatedAt: nowIso() });
}

function appendRecentMessage(kind, text) {
  const state = readJson(STATE_FILE, {});
  const recent = Array.isArray(state.recentMessages) ? state.recentMessages : [];
  recent.push({ at: nowIso(), kind, text: String(text).slice(0, 1200) });
  state.recentMessages = recent.slice(-20);
  state.updatedAt = nowIso();
  writeJson(STATE_FILE, state);
}

function appendMemoryEvent(kind, text) {
  const events = readJson(MEMORY_EVENTS_FILE, []);
  const list = Array.isArray(events) ? events : [];
  list.push({ at: nowIso(), kind, text: String(text).slice(0, 1200) });
  writeJson(MEMORY_EVENTS_FILE, list.slice(-200));
}

let memoryRefreshTimer = null;

function scheduleMemoryRefresh(reason = 'message') {
  if (memoryRefreshTimer) clearTimeout(memoryRefreshTimer);
  memoryRefreshTimer = setTimeout(() => {
    memoryRefreshTimer = null;
    const state = readJson(MEMORY_REFRESH_STATE_FILE, {});
    const last = state.lastStartedAt ? new Date(state.lastStartedAt).getTime() : 0;
    if (Date.now() - last < 5 * 60 * 1000) return;
    writeJson(MEMORY_REFRESH_STATE_FILE, { ...state, lastStartedAt: nowIso(), reason });
    const child = spawn('node', [MEMORY_REFRESH_SCRIPT, reason], { stdio: 'ignore' });
    child.on('error', (error) => log(`memory refresh spawn failed: ${error.message}`));
  }, 45000);
}

function loadTasks() {
  const tasks = readJson(TASKS_FILE, []);
  return Array.isArray(tasks) ? tasks : [];
}

function saveTasks(tasks) {
  writeJson(TASKS_FILE, tasks.slice(-50));
}

function upsertTask(task) {
  const tasks = loadTasks();
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) tasks[index] = { ...tasks[index], ...task };
  else tasks.push(task);
  saveTasks(tasks);
}

function loadAccount() {
  return readJson(ACCOUNT_FILE, null);
}

function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf8').toString('base64');
}

function buildHeaders(token, body) {
  return {
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': randomWechatUin(),
    Authorization: `Bearer ${token.trim()}`,
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(body, 'utf8')),
  };
}

async function apiPost(account, endpoint, payload, timeoutMs = 35000) {
  const base = account.baseUrl.endsWith('/') ? account.baseUrl : `${account.baseUrl}/`;
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(new URL(endpoint, base), {
      method: 'POST',
      headers: buildHeaders(account.token, body),
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

function extractText(msg) {
  const items = msg.item_list || [];
  for (const item of items) {
    if (item.type === 1 && item.text_item && item.text_item.text) {
      return item.text_item.text.trim();
    }
    if (item.type === 3 && item.voice_item && item.voice_item.text) {
      return item.voice_item.text.trim();
    }
  }
  return '';
}

function messageId(msg, text) {
  return [
    msg.msg_id || '',
    msg.client_id || '',
    msg.from_user_id || '',
    msg.create_time || '',
    text,
  ].join('|');
}

function rememberContext(senderId, token) {
  if (!senderId || !token) return;
  const contexts = readJson(CONTEXT_FILE, {});
  contexts[senderId] = token;
  writeJson(CONTEXT_FILE, contexts);
}

function readText(file, fallback = '') {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}

function appendText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, text, 'utf8');
}

function tailText(file, limit = 1200) {
  const text = readText(file, '');
  if (text.length <= limit) return text.trim();
  return text.slice(-limit).trim();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function openLiveTerminal(taskId, liveLogFile) {
  if (!OPEN_TASK_TERMINAL) return;
  const command = [
    'clear',
    `echo ${shellQuote(`扣子正在执行微信任务 #${taskId}`)}`,
    `echo ${shellQuote(`日志：${liveLogFile}`)}`,
    'echo',
    `tail -f ${shellQuote(liveLogFile)}`,
  ].join('; ');
  const script = [
    'tell application "Terminal"',
    `do script ${JSON.stringify(command)}`,
    'activate',
    'end tell',
  ].join('\n');
  const child = spawn('osascript', ['-e', script], { stdio: 'ignore' });
  child.on('error', (error) => log(`open live terminal failed: ${error.message}`));
}

function buildPrompt(text) {
  const memory = readText(MEMORY_FILE).slice(0, 18000);
  const dynamicMemory = readText(DYNAMIC_MEMORY_FILE, '').slice(0, 8000);
  const lastProactive = readText(LAST_PROACTIVE_FILE, '').trim();
  return [
    '你现在通过微信回复用户。只输出要发送给用户的中文微信消息，不要解释，不要 markdown，不要前缀。',
    '语气自然、直接、清楚。一般 1-4 句话，除非用户明确问复杂问题。',
    '不要自称 Claude。你是 Codex，并可以读取本地配置里的助手记忆。',
    '如果用户问工作、代码或电脑操作，可以正常帮忙；如果只是闲聊，就自然接住。',
    lastProactive ? `最近主动发送的消息：${lastProactive}` : '',
    '下面是本地长期记忆，请只作为背景，不要复述：',
    memory,
    dynamicMemory ? '下面是微信助手最近自动更新的动态状态，也只作为背景：' : '',
    dynamicMemory,
    `用户刚刚在微信发来：${text}`,
  ].filter(Boolean).join('\n\n');
}

function generateReply(text) {
  const prompt = buildPrompt(text);
  return new Promise((resolve) => {
    const child = spawn(GENERATOR, ['-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, 120000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      log(`codex generate failed: ${error.message}`);
      resolve('我收到啦，但这边刚刚卡了一下。你再说，我在。');
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        log(`codex generate failed: ${stderr || stdout || `exit ${code}`}`);
        resolve('我收到啦，但这边刚刚卡了一下。你再说，我在。');
        return;
      }
      const reply = (stdout || '').trim().replace(/^["“]|["”]$/g, '') || '收到，我在。';
      resolve(reply);
    });
    child.stdin.end(prompt);
  });
}

function parseTaskCommand(text) {
  const normalized = text.trim();
  const explicit = normalized.match(/^(?:扣子|电脑|执行|操作|任务|codex|Codex)\s*[:：,，\s]\s*([\s\S]+)$/);
  if (explicit) {
    const task = explicit[1].trim();
    return task || null;
  }

  const lower = normalized.toLowerCase();
  const actionWords = [
    '打开', '启动', '运行', '执行', '安装', '更新', '重启', '停止', '关闭',
    '检查', '查看', '看一下', '找一下', '搜一下', '列一下', '整理', '改一下',
    '修改', '新建', '创建', '删除', '移动', '复制', '提交', '推送', '拉取',
    '截图', '下载', '生成', '写入', '保存', '修复', '测试', '跑一下',
  ];
  const computerTargets = [
    '电脑', '本机', 'mac', '终端', '命令', '脚本', '文件', '文件夹',
    '项目', 'project', '仓库', 'git', 'github', '代码', '服务', '进程',
    '浏览器', 'chrome', '网页', '微信', 'wechat', 'codex', 'claude',
    'sap', 'ima', 'notebooklm', 'crontab', 'launchagent', '日志',
  ];
  const commandLike = [
    /\b(git|npm|node|python3?|pip3?|curl|launchctl|crontab|ls|pwd|open)\b/i,
    /\/Users\/people\//,
    /\.[a-z0-9]{1,6}\b/i,
  ];

  const hasAction = actionWords.some((word) => normalized.includes(word));
  const hasTarget = computerTargets.some((word) => lower.includes(word.toLowerCase()));
  const looksCommandLike = commandLike.some((pattern) => pattern.test(normalized));
  const directComputerRequest = /^(帮我|你帮我|替我|给我|去|把|将|请)\s*/.test(normalized);
  const startsAsOperation = /^(打开|启动|运行|执行|跑一下|安装|更新|重启|停止|关闭|检查|查看|整理|修复|测试)/.test(normalized);

  if ((hasAction && hasTarget) || (directComputerRequest && (hasTarget || looksCommandLike)) || startsAsOperation) {
    return normalized;
  }
  return null;
}

function truncateForWechat(text, limit = 1800) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 40).trim()}\n\n...后面还有一点，我先截到这里。`;
}

function runCodexTask(task, taskMeta) {
  return new Promise((resolve) => {
    const outFile = path.join('/tmp', `wechat-codex-task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.txt`);
    const liveLogFile = taskMeta.liveLogFile;
    const prompt = [
      '你是通过微信远程唤起的本机 Codex。',
      '请在这台机器上完成用户的任务。可以读取、编辑工作区文件、运行必要命令。',
      '除非任务明显危险或信息不足，否则直接动手。不要把回复写成很长的报告。',
      '完成后用中文简短汇报：做了什么、关键结果、如果失败则说明失败原因。',
      `用户的微信任务：${task}`,
    ].join('\n\n');

    const args = [
      'exec',
      '--skip-git-repo-check',
      '-C', WORKSPACE,
      '--dangerously-bypass-approvals-and-sandbox',
      '-o', outFile,
      prompt,
    ];
    const child = spawn(CODEX_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const startedLine = [
      `时间：${new Date().toLocaleString('zh-CN')}`,
      `任务：${task}`,
      `进程：${child.pid || '启动中'}`,
      `工作目录：${WORKSPACE}`,
      '',
      '--- 实时输出 ---',
      '',
    ].join('\n');
    appendText(liveLogFile, startedLine);
    activeTask = { ...activeTask, pid: child.pid, liveLogFile };
    upsertTask({
      id: taskMeta.id,
      status: 'running',
      command: task,
      pid: child.pid,
      liveLogFile,
      startedAt: taskMeta.startedAt,
      updatedAt: nowIso(),
    });
    updateState({ activeTask });
    openLiveTerminal(taskMeta.id, liveLogFile);
    let stdout = '';
    let stderr = '';
    let lastProgressUpdate = 0;
    const recordProgress = (streamName, chunk) => {
      const text = chunk.toString();
      if (streamName === 'stdout') stdout += text;
      else stderr += text;
      appendText(liveLogFile, text);
      const now = Date.now();
      if (now - lastProgressUpdate > 3000) {
        lastProgressUpdate = now;
        const liveTail = tailText(liveLogFile, 1000);
        upsertTask({
          id: taskMeta.id,
          status: 'running',
          liveLogFile,
          liveTail,
          pid: child.pid,
          updatedAt: nowIso(),
        });
        activeTask = { ...activeTask, pid: child.pid, liveLogFile, liveTail };
        updateState({ activeTask });
      }
    };
    const timer = setTimeout(() => {
      appendText(liveLogFile, '\n--- 超过 15 分钟，已请求停止 ---\n');
      child.kill('SIGTERM');
    }, 15 * 60 * 1000);
    child.stdout.on('data', (chunk) => {
      recordProgress('stdout', chunk);
    });
    child.stderr.on('data', (chunk) => {
      recordProgress('stderr', chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      appendText(liveLogFile, `\n--- 启动失败：${error.message} ---\n`);
      resolve(`这次没跑起来：${error.message}`);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let finalText = readText(outFile, '').trim();
      try {
        if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
      } catch {}
      if (!finalText) {
        finalText = (stdout || stderr || '').trim();
      }
      if (!finalText) {
        finalText = code === 0 ? '任务跑完了，但 Codex 没留下文字结果。' : `任务失败了，退出码 ${code}。`;
      }
      if (code !== 0 && !finalText.includes('失败') && !finalText.includes('错误')) {
        finalText = `任务可能没完整跑完，退出码 ${code}。\n${finalText}`;
      }
      appendText(liveLogFile, `\n--- 任务结束，退出码 ${code} ---\n${finalText}\n`);
      resolve(truncateForWechat(finalText));
    });
  });
}

async function sendText(account, senderId, text) {
  const contexts = readJson(CONTEXT_FILE, {});
  const contextToken = contexts[senderId] || '';
  const resp = await apiPost(account, 'ilink/bot/sendmessage', {
    msg: {
      from_user_id: '',
      to_user_id: senderId,
      client_id: `codex-wechat:${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      message_type: 2,
      message_state: 2,
      item_list: [{ type: 1, text_item: { text } }],
      context_token: contextToken,
    },
    base_info: { channel_version: CHANNEL_VERSION },
  }, 15000);
  if (typeof resp.ret === 'number' && resp.ret !== 0) {
    throw new Error(`send ret=${resp.ret}: ${JSON.stringify(resp)}`);
  }
  appendRecentMessage('out', text);
}

const pendingBySender = new Map();
const chatQueue = [];
const taskQueue = [];
let processingChat = false;
let processingTask = false;
let activeTask = null;

function parseControlCommand(text) {
  const normalized = text.trim();
  const match = normalized.match(/^(?:扣子|codex|Codex)?\s*(状态|在干嘛|现在在干嘛|任务|最近任务|最近回复|回复|动态记忆|记忆|日志|帮助|help)\s*$/);
  return match ? match[1].toLowerCase() : null;
}

function formatAge(iso) {
  if (!iso) return '未知';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '刚刚';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hour = Math.floor(min / 60);
  return `${hour}小时前`;
}

function formatDuration(startIso, endIso) {
  if (!startIso) return '未知耗时';
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const start = new Date(startIso).getTime();
  const ms = end - start;
  if (!Number.isFinite(ms) || ms < 0) return '未知耗时';
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `${sec}秒`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest ? `${min}分${rest}秒` : `${min}分钟`;
}

function tasksWithin(minutes = 30) {
  const cutoff = Date.now() - minutes * 60 * 1000;
  return loadTasks().filter((task) => {
    const t = new Date(task.updatedAt || task.finishedAt || task.startedAt || 0).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

function taskStatusLabel(status) {
  if (status === 'running') return '进行中';
  if (status === 'done') return '已完成';
  if (status === 'error') return '失败';
  return status || '未知';
}

function formatTaskLine(task, includeResult = true) {
  const duration = formatDuration(task.startedAt, task.finishedAt);
  const when = formatAge(task.updatedAt || task.finishedAt || task.startedAt);
  const result = includeResult && task.result ? `\n  结果：${task.result.slice(0, 220)}` : '';
  const pid = task.pid ? `，PID ${task.pid}` : '';
  const live = task.liveLogFile ? `\n  现场日志：${task.liveLogFile}` : '';
  const liveTail = includeResult && task.liveTail ? `\n  最近输出：${task.liveTail.slice(-260)}` : '';
  return `#${task.id} ${taskStatusLabel(task.status)}，${when}，耗时 ${duration}${pid}\n  ${task.command}${live}${liveTail}${result}`;
}

function buildTaskCompletionNotice(task) {
  const ok = task.status === 'done';
  const title = ok ? '任务完成' : '任务失败';
  const duration = formatDuration(task.startedAt, task.finishedAt);
  const result = task.result ? `\n结果：${task.result.slice(0, 700)}` : '';
  return `${title}：#${task.id}\n耗时：${duration}\n任务：${task.command}${result}`;
}

function recentLogLines(count = 8) {
  const text = readText(LOG_FILE, '');
  return text.trim().split('\n').slice(-count);
}

function buildStatusText() {
  const state = readJson(STATE_FILE, {});
  const tasks = loadTasks();
  const running = tasks.filter((task) => task.status === 'running');
  const last = tasks.slice(-1)[0];
  const lines = [];
  lines.push('我在电脑上常驻着。');
  lines.push(`最近心跳：${formatAge(state.heartbeatAt || state.updatedAt)}`);
  lines.push(`聊天分支：${processingChat ? '正在回复' : '空闲'}，队列 ${chatQueue.length}`);
  lines.push(`任务分支：${processingTask ? '正在执行' : '空闲'}，队列 ${taskQueue.length}`);
  if (activeTask) {
    lines.push(`当前任务：#${activeTask.id} ${activeTask.command}`);
    if (activeTask.pid) lines.push(`任务进程：PID ${activeTask.pid}`);
    if (activeTask.liveLogFile) lines.push(`电脑现场日志：${activeTask.liveLogFile}`);
    if (activeTask.liveTail) lines.push(`最近输出：${activeTask.liveTail.slice(-360)}`);
  } else if (running.length) {
    const task = running[running.length - 1];
    lines.push(`记录中运行任务：#${task.id} ${task.command}`);
  }
  if (last) {
    lines.push(`最近任务：#${last.id} ${last.status}，${formatAge(last.updatedAt || last.startedAt)}，${last.command}`);
  }
  const recent = tasksWithin(30).reverse();
  if (recent.length) {
    const done = recent.filter((task) => task.status === 'done').length;
    const failed = recent.filter((task) => task.status === 'error').length;
    const active = recent.filter((task) => task.status === 'running').length;
    lines.push('');
    lines.push(`近30分钟任务：${recent.length} 个（完成 ${done}，失败 ${failed}，进行中 ${active}）`);
    for (const task of recent.slice(0, 6)) {
      lines.push(formatTaskLine(task));
    }
  } else {
    lines.push('');
    lines.push('近30分钟任务：暂无。');
  }
  return lines.join('\n');
}

function buildTasksText() {
  const recent = tasksWithin(30).reverse();
  if (!recent.length) return '近30分钟还没有电脑任务记录。';
  return ['近30分钟任务：', ...recent.slice(0, 10).map((task) => formatTaskLine(task))].join('\n');
}

function buildRecentRepliesText() {
  const state = readJson(STATE_FILE, {});
  const recent = (state.recentMessages || []).filter((item) => item.kind === 'out').slice(-6).reverse();
  if (!recent.length) return '还没有记录到最近回复。';
  return recent.map((item) => `${formatAge(item.at)}：${item.text}`).join('\n');
}

function buildDynamicMemoryText() {
  const text = readText(DYNAMIC_MEMORY_FILE, '').trim();
  if (!text) return '动态记忆还没生成。你多聊几句，或者等下一次定时消息前自动刷新。';
  const refreshState = readJson(MEMORY_REFRESH_STATE_FILE, {});
  const when = refreshState.lastFinishedAt ? `更新时间：${formatAge(refreshState.lastFinishedAt)}\n` : '';
  return `${when}${text}`;
}

function buildHelpText() {
  return [
    '可以这样用：',
    '扣子状态：看我有没有活着、当前队列，以及近30分钟任务情况',
    '扣子任务：看近30分钟电脑任务和结果',
    '扣子最近回复：看最近发给你的消息',
    '扣子记忆：看自动更新的动态状态',
    '扣子日志：看最近后台日志',
    '扣子，整理一下 SAP 项目的 git 状态：让我在电脑上干活',
  ].join('\n');
}

async function processControlCommand(senderId, control) {
  try {
    const account = loadAccount();
    if (!account) throw new Error('missing account');
    if (senderId !== account.userId) {
      await sendText(account, senderId, '这个控制台只认配置过的可信微信账号。');
      return;
    }
    let text;
    if (['状态', '在干嘛', '现在在干嘛'].includes(control)) text = buildStatusText();
    else if (['任务', '最近任务'].includes(control)) text = buildTasksText();
    else if (['最近回复', '回复'].includes(control)) text = buildRecentRepliesText();
    else if (['动态记忆', '记忆'].includes(control)) text = buildDynamicMemoryText();
    else if (control === '日志') text = recentLogLines(10).join('\n') || '暂无日志。';
    else text = buildHelpText();
    await sendText(account, senderId, truncateForWechat(text));
  } catch (error) {
    log(`control command error: ${error && error.stack ? error.stack : String(error)}`);
  }
}

function queueIncoming(senderId, text) {
  appendRecentMessage('in', text);
  appendMemoryEvent('in', text);
  scheduleMemoryRefresh('incoming-message');
  const control = parseControlCommand(text);
  if (control) {
    processControlCommand(senderId, control);
    return;
  }

  if (parseTaskCommand(text)) {
    taskQueue.push({ senderId, text });
    processTaskQueue();
    return;
  }

  const existing = pendingBySender.get(senderId);
  if (existing) {
    existing.texts.push(text);
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => flushSender(senderId), 3500);
    return;
  }
  const entry = {
    texts: [text],
    timer: setTimeout(() => flushSender(senderId), 3500),
  };
  pendingBySender.set(senderId, entry);
}

function flushSender(senderId) {
  const entry = pendingBySender.get(senderId);
  if (!entry) return;
  pendingBySender.delete(senderId);
  const text = entry.texts.join('\n');
  chatQueue.push({ senderId, text });
  processChatQueue();
}

async function processChatQueue() {
  if (processingChat) return;
  processingChat = true;
  while (chatQueue.length) {
    const item = chatQueue.shift();
    try {
      const account = loadAccount();
      if (!account) throw new Error('missing account');
      log(`generating for=${item.senderId} text=${item.text.slice(0, 120)}`);
      const reply = await generateReply(item.text);
      log(`reply=${reply.slice(0, 120)}`);
      await sendText(account, item.senderId, reply);
      log(`sent to=${item.senderId}`);
    } catch (error) {
      log(`chat process error: ${error && error.stack ? error.stack : String(error)}`);
    }
  }
  processingChat = false;
}

async function processTaskQueue() {
  if (processingTask) return;
  processingTask = true;
  while (taskQueue.length) {
    const item = taskQueue.shift();
    try {
      const account = loadAccount();
      if (!account) throw new Error('missing account');
      const task = parseTaskCommand(item.text);
      if (!task) continue;
      if (item.senderId !== account.userId) {
        await sendText(account, item.senderId, '这个远程执行入口只认配置过的可信微信账号。');
        continue;
      }
      const taskId = `${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
      const startedAt = nowIso();
      const liveLogFile = path.join(TASK_LIVE_DIR, `${taskId}.log`);
      activeTask = { id: taskId, command: task, startedAt, liveLogFile };
      upsertTask({
        id: taskId,
        status: 'running',
        command: task,
        liveLogFile,
        startedAt,
        updatedAt: startedAt,
      });
      log(`task command from=${item.senderId} task=${task.slice(0, 160)}`);
      await sendText(account, item.senderId, `收到，我开一个电脑任务分支处理：#${taskId}\n电脑上会打开一个实时日志窗口；你也可以发“扣子状态”查进度。`);
      const result = await runCodexTask(task, { id: taskId, startedAt, liveLogFile });
      const finishedAt = nowIso();
      const doneTask = {
        id: taskId,
        status: 'done',
        command: task,
        result,
        liveLogFile,
        pid: activeTask && activeTask.pid,
        liveTail: tailText(liveLogFile, 1000),
        updatedAt: finishedAt,
        finishedAt,
        startedAt,
      };
      upsertTask({
        ...doneTask,
      });
      activeTask = null;
      log(`task result=${result.slice(0, 200)}`);
      await sendText(account, item.senderId, buildTaskCompletionNotice(doneTask));
      log(`task sent to=${item.senderId}`);
    } catch (error) {
      if (activeTask) {
        const finishedAt = nowIso();
        const errorTask = {
          id: activeTask.id,
          status: 'error',
          command: activeTask.command,
          result: String(error && error.message ? error.message : error).slice(0, 1000),
          updatedAt: finishedAt,
          finishedAt,
          startedAt: activeTask.startedAt,
        };
        upsertTask(errorTask);
        try {
          const account = loadAccount();
          if (account) await sendText(account, item.senderId, buildTaskCompletionNotice(errorTask));
        } catch (sendError) {
          log(`task error notice failed: ${sendError && sendError.stack ? sendError.stack : String(sendError)}`);
        }
        activeTask = null;
      }
      log(`task process error: ${error && error.stack ? error.stack : String(error)}`);
    }
  }
  processingTask = false;
}

async function pollOnce() {
  updateState({
    heartbeatAt: nowIso(),
    pid: process.pid,
    processingChat,
    processingTask,
    chatQueue: chatQueue.length,
    taskQueue: taskQueue.length,
    activeTask,
  });
  const account = loadAccount();
  if (!account || !account.token) {
    log('missing account.json; run setup first');
    await new Promise((r) => setTimeout(r, 10000));
    return;
  }

  const syncBuf = fs.existsSync(SYNC_BUF_FILE) ? fs.readFileSync(SYNC_BUF_FILE, 'utf8') : '';
  const updates = await apiPost(account, 'ilink/bot/getupdates', {
    get_updates_buf: syncBuf,
    base_info: { channel_version: CHANNEL_VERSION },
  }, 35000);

  if (updates.get_updates_buf) {
    fs.writeFileSync(SYNC_BUF_FILE, updates.get_updates_buf, 'utf8');
  }

  const processed = readJson(PROCESSED_FILE, []);
  const processedSet = new Set(processed);
  const keep = processed.slice(-300);

  for (const msg of updates.msgs || []) {
    const senderId = msg.from_user_id || '';
    const text = extractText(msg);
    if (!senderId || senderId === account.accountId || !text) continue;
    if (msg.context_token) rememberContext(senderId, msg.context_token);

    const id = messageId(msg, text);
    if (processedSet.has(id)) continue;
    processedSet.add(id);
    keep.push(id);
    writeJson(PROCESSED_FILE, keep.slice(-300));

    log(`incoming from=${senderId} text=${text.slice(0, 80)}`);
    queueIncoming(senderId, text);
  }
}

async function main() {
  log('wechat-codex-bot started');
  while (true) {
    try {
      await pollOnce();
    } catch (error) {
      log(`error: ${error && error.stack ? error.stack : String(error)}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main();
