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
  const kind = process.argv[2] || 'random';
  const dynamicMemory = readText(config.DYNAMIC_MEMORY_FILE, '').slice(0, 8000);
  const longMemory = readText(config.MEMORY_FILE, '').slice(0, 12000);
  const lastProactive = readText(config.LAST_PROACTIVE_FILE, '').trim();
  const state = readJson(config.STATE_FILE, {});
  const tasks = readJson(config.TASKS_FILE, []);

  const recentMessages = (state.recentMessages || []).slice(-20)
    .map((item) => `[${item.at}] ${item.kind}: ${item.text}`)
    .join('\n');
  const recentTasks = (Array.isArray(tasks) ? tasks : []).slice(-10)
    .map((task) => `[${task.updatedAt || task.startedAt}] ${task.status}: ${task.command}${task.result ? ` -> ${task.result.slice(0, 180)}` : ''}`)
    .join('\n');

  const intentByKind = {
    evening: '现在是下班/晚间节点。生成一句自然的关心或收束消息，可以轻轻跟进今天状态。',
    followup: '用户在固定消息后暂时没有回复。生成一句不催促、不施压的轻柔 follow-up。',
    manual: '生成一条自然的主动消息。',
    random: '生成一条随机但贴合最近状态的日间主动消息。',
  };

  const prompt = [
    '你要生成一条将通过微信发送的中文消息。',
    '只输出消息正文，不要解释，不要 markdown，不要前缀。',
    '长度 1-3 句话，像熟悉的人自然发消息，不要像通知模板。',
    '不要使用固定语料库；必须结合动态记忆、最近聊天或最近任务生成。',
    '如果最近没有足够信息，就发一条轻量、自然、不冒犯的问候。',
    '避免重复最近主动发过的内容。',
    '',
    `消息场景：${kind}`,
    intentByKind[kind] || intentByKind.random,
    '',
    lastProactive ? `最近主动消息：${lastProactive}` : '最近主动消息：无',
    '',
    dynamicMemory ? `动态状态记忆：\n${dynamicMemory}` : '动态状态记忆：暂无',
    '',
    longMemory ? `长期背景记忆：\n${longMemory}` : '长期背景记忆：暂无',
    '',
    recentMessages ? `最近微信消息：\n${recentMessages}` : '最近微信消息：暂无',
    '',
    recentTasks ? `最近电脑任务：\n${recentTasks}` : '最近电脑任务：暂无',
  ].join('\n');

  const output = await generate(prompt);
  process.stdout.write(output.replace(/^["“]|["”]$/g, '').trim());
}

main().catch(() => process.exit(1));
