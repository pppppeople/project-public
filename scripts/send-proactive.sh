#!/bin/bash
# 主动发送微信消息

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 用 Codex 生成消息内容
MESSAGE=$("$PROJECT_ROOT/bin/codex-generate-message.sh" "请用中文生成一条简短的主动消息（1-2句话）。可以是关心、有趣的想法、或者休息提醒。风格自然、简短。直接输出消息内容，不要加任何前缀。" 2>/dev/null)

if [ -z "$MESSAGE" ]; then
  MESSAGE="记得喝水，休息一下。"
fi

node "$PROJECT_ROOT/src/send-core.js" "$MESSAGE" > /dev/null

echo "[$(date)] 已发送: $MESSAGE" >> "$HOME/.claude/wechat-send.log"
