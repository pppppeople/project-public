'use strict';

const path = require('path');

const HOME = process.env.HOME;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const WORKSPACE = process.env.CODEX_WORKSPACE || path.dirname(PROJECT_ROOT);
const CLAUDE_HOME = process.env.CLAUDE_HOME || path.join(HOME, '.claude');
const CRED_DIR = path.join(CLAUDE_HOME, 'channels/wechat');

module.exports = {
  HOME,
  PROJECT_ROOT,
  WORKSPACE,
  CLAUDE_HOME,
  CRED_DIR,
  ACCOUNT_FILE: path.join(CRED_DIR, 'account.json'),
  SYNC_BUF_FILE: path.join(CRED_DIR, 'sync_buf.txt'),
  CONTEXT_FILE: path.join(CRED_DIR, 'context_tokens.json'),
  PROCESSED_FILE: path.join(CRED_DIR, 'processed_messages.json'),
  STATE_FILE: path.join(CLAUDE_HOME, 'wechat-codex-state.json'),
  TASKS_FILE: path.join(CLAUDE_HOME, 'wechat-codex-tasks.json'),
  TASK_LIVE_DIR: path.join(CLAUDE_HOME, 'wechat-codex-live'),
  LOG_FILE: path.join(CLAUDE_HOME, 'wechat-codex-bot.log'),
  LAST_PROACTIVE_FILE: path.join(CLAUDE_HOME, 'last_proactive.txt'),
  MEMORY_FILE: process.env.WECHAT_CODEX_MEMORY_FILE || path.join(HOME, 'CLAUDE.md'),
  GENERATOR: path.join(PROJECT_ROOT, 'bin/codex-generate-message.sh'),
  CODEX_BIN: process.env.CODEX_BIN || '/Applications/Codex.app/Contents/Resources/codex',
  OPEN_TASK_TERMINAL: process.env.WECHAT_CODEX_OPEN_TERMINAL !== '0',
  CHANNEL_VERSION: '0.1.0',
};
