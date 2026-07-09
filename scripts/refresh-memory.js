#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const config = require('../src/config');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(file, fallback = '') {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}

function writeText(file, text) {
  fs.mkdirSync(require('path').dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function generate(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.GENERATOR, ['-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 120000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || !stdout.trim()) {
        reject(new Error(stderr.trim() || stdout.trim() || `exit ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin.end(prompt);
  });
}

async function main() {
  const reason = process.argv[2] || 'manual';
  const events = readJson(config.MEMORY_EVENTS_FILE, []);
  const tasks = readJson(config.TASKS_FILE, []);
  const state = readJson(config.STATE_FILE, {});
  const previous = readText(config.DYNAMIC_MEMORY_FILE, '').slice(0, 8000);

  const recentEvents = (Array.isArray(events) ? events : []).slice(-80)
    .map((event) => `[${event.at}] ${event.kind}: ${event.text}`)
    .join('\n');
  const recentMessages = (state.recentMessages || []).slice(-40)
    .map((item) => `[${item.at}] ${item.kind}: ${item.text}`)
    .join('\n');
  const recentTasks = (Array.isArray(tasks) ? tasks : []).slice(-20)
    .map((task) => `[${task.updatedAt || task.startedAt}] ${task.status}: ${task.command}${task.result ? ` -> ${task.result.slice(0, 240)}` : ''}`)
    .join('\n');

  const prompt = [
    '请把微信助手的最近互动压缩成一份动态状态记忆，用中文输出 Markdown。',
    '这份记忆会用于之后自动生成定时消息。请只保留对关心、提醒、跟进有帮助的信息。',
    '不要编造没有证据的事实。不要写隐私敏感的账号、token、URL 参数或长日志。',
    '保留这些部分：',
    '1. 最近状态：用户最近在忙什么、情绪/节奏如何。',
    '2. 可跟进事项：之后可以自然问起或提醒的事情。',
    '3. 说话偏好：用户喜欢/不喜欢怎样的语气。',
    '4. 避免事项：不要重复、不要踩的点。',
    '5. 最近一次更新时间。',
    '整体控制在 600 字以内。',
    '',
    `刷新原因：${reason}`,
    '',
    previous ? `上一版动态记忆：\n${previous}` : '上一版动态记忆：无',
    '',
    `最近微信事件：\n${recentEvents || '无'}`,
    '',
    `状态文件里的最近微信消息：\n${recentMessages || '无'}`,
    '',
    `最近电脑任务：\n${recentTasks || '无'}`,
  ].join('\n');

  const output = await generate(prompt);
  writeText(config.DYNAMIC_MEMORY_FILE, `${output}\n`);
  fs.writeFileSync(config.MEMORY_REFRESH_STATE_FILE, JSON.stringify({
    lastFinishedAt: new Date().toISOString(),
    reason,
    eventCount: Array.isArray(events) ? events.length : 0,
    recentMessageCount: Array.isArray(state.recentMessages) ? state.recentMessages.length : 0,
  }, null, 2), 'utf8');
}

main().catch((error) => {
  fs.mkdirSync(require('path').dirname(config.LOG_FILE), { recursive: true });
  fs.appendFileSync(config.LOG_FILE, `[${new Date().toISOString()}] memory refresh failed: ${error.stack || error}\n`);
  process.exit(1);
});
