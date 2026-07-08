#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MESSAGE=$("$PROJECT_ROOT/bin/codex-generate-message.sh" "请用中文生成一条下班时间的简短问候消息（1-2句话）。风格：自然、温和。直接输出消息内容，不要加任何前缀。" 2>/dev/null)
echo "$MESSAGE" | grep -qi "not logged in\|please run\|login\|error\|错误" && MESSAGE=""
[ -z "$MESSAGE" ] && MESSAGE="下班啦，今天辛苦了，记得休息。"

node "$PROJECT_ROOT/src/send-core.js" "$MESSAGE"
echo "$(date +%s)" > "$HOME/.claude/wechat_6pm_sent"
echo "[$(date)] 6pm: $MESSAGE" >> "$HOME/.claude/wechat-send.log"
echo "$(date '+%Y-%m-%d %H:%M') 【主动发送的消息】: $MESSAGE" > "$HOME/.claude/last_proactive.txt"
