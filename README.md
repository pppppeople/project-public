# WeChat Codex Bot

> Remote-control my Mac from WeChat. Slightly cursed, surprisingly useful.

A personal WeChat bridge for Codex.

Chat normally, ask for status, or send a task from the phone and let the Mac do the boring part.

* * *

## About

This is a local always-on assistant bridge.

It listens to WeChat messages, decides whether PP is chatting or asking the computer to work, and routes the message into the right lane.

Task Mode is the fun part:

* start Codex from WeChat
* run commands on the Mac
* edit files in the local workspace
* show a live Terminal log on the computer
* report progress back through WeChat
* push a completion notice when the job is done

No account tokens or chat credentials live in this repo. Runtime state stays under the local `.claude` folder.

* * *

## Feature Taste

Feature | Rating | Notes
--- | --- | ---
WeChat chat reply | ★★★★☆ | Normal conversation, short replies, less corporate nonsense
Remote Mac task | ★★★★★ | The reason this exists
Live desktop log | ★★★★☆ | New tasks open a Terminal window so the invisible background work is no longer invisible
Status query | ★★★★★ | `扣子状态` answers immediately, even while a long task is running
Completion push | ★★★★☆ | Finished jobs proactively report back to WeChat
Scheduled nudges | ★★★☆☆ | 6pm, random daytime messages, and a tiny after-work detector

* * *

## Commands

Normal messages are treated as chat.

Control commands:

```text
扣子状态
扣子任务
扣子最近回复
扣子日志
扣子帮助
```

Remote task examples:

```text
扣子，帮我看一下 project 文件夹现在有哪些 git 改动
执行：运行微信项目的检查
Codex：整理一下 wechat 项目结构
帮我打开微信
```

Only PP's configured WeChat sender id can trigger computer-control mode.

* * *

## How It Works

Path | Job
--- | ---
`src/codex-bot.js` | Long-running WeChat listener, router, task runner
`src/send-core.js` | Shared sender for proactive messages
`src/config.js` | Runtime paths and environment overrides
`bin/wechat-codex-bot.sh` | LaunchAgent entry point
`bin/codex-generate-message.sh` | Codex CLI wrapper for short generated messages
`scripts/notify-complete.sh` | Desktop-side completion push
`scripts/6pm.sh` | After-work message
`scripts/check-reply.sh` | 18:10 follow-up detector
`scripts/random.sh` | Occasional daytime nudge

* * *

## Runtime

LaunchAgent:

```text
~/Library/LaunchAgents/com.pp.wechat-codex-bot.plist
```

Local state and logs:

```text
~/.claude/wechat-codex-bot.log
~/.claude/wechat-codex-bot.err
~/.claude/wechat-send.log
~/.claude/wechat-codex-state.json
~/.claude/wechat-codex-tasks.json
~/.claude/wechat-codex-live/<task-id>.log
```

Credentials and WeChat context:

```text
~/.claude/channels/wechat/account.json
~/.claude/channels/wechat/context_tokens.json
~/.claude/channels/wechat/sync_buf.txt
```

Those files are local runtime files. Do not commit them. Seriously. The bot is useful; credential leaks are not.

* * *

## Maintenance

Quick check:

```bash
npm run check
```

Run locally:

```bash
npm start
```

Restart the always-on bot:

```bash
launchctl kickstart -k gui/$(id -u)/com.pp.wechat-codex-bot
```

Check service status:

```bash
launchctl print gui/$(id -u)/com.pp.wechat-codex-bot
```

Refresh WeChat login:

```bash
npx -y claude-code-wechat-channel setup
```

* * *

## Environment

Useful overrides:

```bash
CODEX_WORKSPACE=/path/to/workspace
CODEX_BIN=/Applications/Codex.app/Contents/Resources/codex
CLAUDE_HOME=$HOME/.claude
WECHAT_CODEX_MEMORY_FILE=$HOME/CLAUDE.md
WECHAT_CODEX_OPEN_TERMINAL=1
```

Set `WECHAT_CODEX_OPEN_TERMINAL=0` if you want remote tasks to stay quiet on the desktop.
