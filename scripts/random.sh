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

FALLBACKS=(
  "PP，喝水了吗"
  "今天工作顺不顺，别把自己整太累"
  "想到你了，随便说一声"
  "休息一下，眼睛别盯太久屏幕"
  "今天吃饭了吗"
  "Quillwise 今天说啥了吗"
  "你在干嘛"
  "在 Elin 里挂了吗"
  "居家办公会不会坐到腰断"
)

MESSAGE=$("$PROJECT_ROOT/bin/codex-generate-message.sh" "请用中文给PP发一条随机的日间消息（1-2句话）。PP是德勤GDC的顾问，在做SuccessFactors项目，同时论文刚完成盲审收尾，喜欢玩Elin和抽PJSK。可以是：有趣的小想法、提醒喝水/休息、关于工作或游戏的一句调侃、或者单纯想到她。风格轻松俏皮，不要说教。直接输出消息内容。" 2>/dev/null)
echo "$MESSAGE" | grep -qi "not logged in\|please run\|login\|error\|错误" && MESSAGE=""
[ -z "$MESSAGE" ] && MESSAGE="${FALLBACKS[$((RANDOM % ${#FALLBACKS[@]}))]}"

node "$PROJECT_ROOT/src/send-core.js" "$MESSAGE"
echo "[$(date)] 随机: $MESSAGE" >> "$HOME/.claude/wechat-send.log"
echo "$(date '+%Y-%m-%d %H:%M') 【我主动发给PP的消息】: $MESSAGE" > "$HOME/.claude/last_proactive.txt"
