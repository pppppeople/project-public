#!/bin/bash
# 核心发消息函数，自动读取 context_token
# 用法: wechat-send-core.sh "消息内容"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

MESSAGE="$1"
[ -z "$MESSAGE" ] && exit 1

node -e "
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const account = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.claude/channels/wechat/account.json'), 'utf-8'));
const { token, baseUrl, userId } = account;

// 读取 context_token
let contextToken = '';
try {
  const ctFile = path.join(process.env.HOME, '.claude/channels/wechat/context_tokens.json');
  if (fs.existsSync(ctFile)) {
    const ct = JSON.parse(fs.readFileSync(ctFile, 'utf-8'));
    contextToken = ct[userId] || '';
  }
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
    item_list: [{ type: 1, text_item: { text: $(echo "$MESSAGE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))') } }],
    context_token: contextToken
  },
  base_info: { channel_version: '0.1.0' }
});

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
}).then(r => r.text()).then(console.log).catch(console.error);
"
