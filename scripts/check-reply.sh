#!/bin/bash
# 6:10pm 检测是否回复，没回复说明在加班

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ACCOUNT_FILE="$HOME/.claude/channels/wechat/account.json"
SENT_FILE="$HOME/.claude/wechat_6pm_sent"
SYNC_BUF_FILE="$HOME/.claude/channels/wechat/sync_buf.txt"
LOG="$HOME/.claude/wechat-send.log"

# 如果没有发送记录就跳过
[ ! -f "$SENT_FILE" ] && exit 0

TOKEN=$(python3 -c "import json; d=json.load(open('$ACCOUNT_FILE')); print(d['token'])")
BASE_URL=$(python3 -c "import json; d=json.load(open('$ACCOUNT_FILE')); print(d['baseUrl'])")
TO_USER=$(python3 -c "import json; d=json.load(open('$ACCOUNT_FILE')); print(d['userId'])")
SENT_AT=$(cat "$SENT_FILE")

# 用 getupdates 检查是否有新消息（非阻塞，超时1秒）
SYNC_BUF=""
[ -f "$SYNC_BUF_FILE" ] && SYNC_BUF=$(cat "$SYNC_BUF_FILE")

UPDATES=$(curl -s --max-time 5 -X POST "$BASE_URL/ilink/bot/getupdates" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"get_updates_buf\": \"$SYNC_BUF\", \"base_info\": {\"channel_version\": \"1.0\"}}")

# 检查是否有来自用户的消息
HAS_REPLY=$(echo "$UPDATES" | python3 -c "
import json, sys, time
try:
    d = json.load(sys.stdin)
    msgs = d.get('msgs', [])
    sent_at = $SENT_AT
    for m in msgs:
        from_id = m.get('from_user_id', '')
        ts = m.get('create_time', 0)
        if '$TO_USER' in from_id and ts > sent_at:
            print('yes')
            sys.exit()
    print('no')
except:
    print('no')
")

if [ "$HAS_REPLY" = "no" ]; then
    # 没回复，发加班关心消息
    MESSAGE=$("$PROJECT_ROOT/bin/codex-generate-message.sh" "PP发消息10分钟了没回复，说明她可能在加班。请用中文发一条简短的关心消息（1-2句话），温柔地acknowledge她在加班，告诉她别太累了。直接输出消息内容。" 2>/dev/null)
    [ -z "$MESSAGE" ] && MESSAGE="看来PP在加班呢…别太拼了，记得吃东西。"

    node "$PROJECT_ROOT/src/send-core.js" "$MESSAGE" > /dev/null

    echo "[$(date)] 加班检测触发: $MESSAGE" >> "$LOG"
else
    echo "[$(date)] PP已回复，未触发加班消息" >> "$LOG"
fi

rm -f "$SENT_FILE"
