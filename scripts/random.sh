#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RAND=$((RANDOM % 10))
[ $RAND -gt 2 ] && exit 0

HOUR=$(date +%H)
[ "$HOUR" -eq 17 ] || [ "$HOUR" -eq 18 ] && exit 0
[ "$HOUR" -lt 8 ] && exit 0

node "$PROJECT_ROOT/scripts/refresh-memory.js" "random" >/dev/null 2>&1 || true
MESSAGE=$(node "$PROJECT_ROOT/scripts/generate-proactive.js" "random" 2>/dev/null)
echo "$MESSAGE" | grep -qi "not logged in\|please run\|login\|error\|错误" && MESSAGE=""
[ -z "$MESSAGE" ] && MESSAGE="想到你了，过来轻轻敲一下。"

node "$PROJECT_ROOT/src/send-core.js" "$MESSAGE"
echo "[$(date)] 随机: $MESSAGE" >> "$HOME/.claude/wechat-send.log"
echo "$(date '+%Y-%m-%d %H:%M') 【主动发送的消息】: $MESSAGE" > "$HOME/.claude/last_proactive.txt"
