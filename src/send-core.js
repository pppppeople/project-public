#!/usr/bin/env node
// 用法: node wechat-send-core.js "消息内容"

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const message = process.argv[2];
if (!message) { console.error('缺少消息内容'); process.exit(1); }

const account = JSON.parse(fs.readFileSync(config.ACCOUNT_FILE, 'utf-8'));
const { token, baseUrl, userId } = account;

let contextToken = '';
try {
  const ct = JSON.parse(fs.readFileSync(config.CONTEXT_FILE, 'utf-8'));
  contextToken = ct[userId] || '';
} catch(e) {}

function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

const clientId = 'claude-code-wechat:' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
const body = JSON.stringify({
  msg: {
    from_user_id: '',
    to_user_id: userId,
    client_id: clientId,
    message_type: 2,
    message_state: 2,
    item_list: [{ type: 1, text_item: { text: message } }],
    context_token: contextToken
  },
  base_info: { channel_version: '0.1.0' }
});

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch(e) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
}

function appendRecentMessage(text) {
  const state = readJson(config.STATE_FILE, {});
  const recent = Array.isArray(state.recentMessages) ? state.recentMessages : [];
  const now = new Date().toISOString();
  recent.push({ at: now, kind: 'out', text: String(text).slice(0, 1200) });
  state.recentMessages = recent.slice(-20);
  state.updatedAt = now;
  writeJson(config.STATE_FILE, state);
}

function appendMemoryEvent(text) {
  const events = readJson(config.MEMORY_EVENTS_FILE, []);
  const list = Array.isArray(events) ? events : [];
  list.push({ at: new Date().toISOString(), kind: 'out', text: String(text).slice(0, 1200) });
  writeJson(config.MEMORY_EVENTS_FILE, list.slice(-200));
}

fetch(baseUrl + '/ilink/bot/sendmessage', {
  method: 'POST',
  headers: {
    'AuthorizationType': 'ilink_bot_token',
    'X-WECHAT-UIN': randomWechatUin(),
    'Authorization': 'Bearer ' + token.trim(),
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(body, 'utf-8'))
  },
  body
}).then(r => r.text()).then(text => {
  console.log(text);
  try {
    const data = JSON.parse(text || '{}');
    if (typeof data.ret === 'number' && data.ret !== 0) {
      process.exit(1);
    }
    appendRecentMessage(message);
    appendMemoryEvent(message);
  } catch(e) {}
}).catch(e => {
  console.error(e.message);
  process.exit(1);
});
