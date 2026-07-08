#!/bin/bash
# Send a desktop-side completion notice to PP's WeChat.

set -euo pipefail

TITLE="${1:-桌面任务}"
DETAIL="${2:-已完成。}"
NOW="$(date '+%Y-%m-%d %H:%M:%S')"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MESSAGE="任务完成：${TITLE}
时间：${NOW}
结果：${DETAIL}"

node "$PROJECT_ROOT/src/send-core.js" "$MESSAGE" > /dev/null
echo "[$(date)] 桌面完成通知: ${TITLE} - ${DETAIL}" >> "$HOME/.claude/wechat-send.log"
