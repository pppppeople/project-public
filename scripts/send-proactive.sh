#!/bin/bash
# 主动发送微信消息

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

node "$PROJECT_ROOT/scripts/refresh-memory.js" "manual" >/dev/null 2>&1 || true
MESSAGE=$(node "$PROJECT_ROOT/scripts/generate-proactive.js" "manual" 2>/dev/null)

if [ -z "$MESSAGE" ]; then
  MESSAGE="记得喝水休息一下。"
fi

node "$PROJECT_ROOT/src/send-core.js" "$MESSAGE" > /dev/null

echo "[$(date)] 已发送: $MESSAGE" >> "$HOME/.claude/wechat-send.log"
