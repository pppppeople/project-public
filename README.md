# WeChat Remote Codex

> A WeChat-to-Codex bridge for local automation, task execution, and live progress reporting.

This project turns WeChat messages into a local assistant interface.

It supports conversational replies, status checks, scheduled notifications, and remote task execution on a trusted local machine.

Scheduled messages are generated from recent context instead of a fixed phrase bank.

* * *

## Overview

WeChat Remote Codex runs as a local always-on service.

It polls a WeChat bot channel, classifies incoming messages, and routes them into either chat mode or task mode.

Task mode can:

* start Codex from a WeChat command
* run commands in a local workspace
* edit files on the machine
* open a live Terminal log for visible progress
* return status updates through WeChat
* send a completion notice when work finishes
* summarize recent interactions into a small dynamic memory
* generate proactive messages from current state instead of static templates

Credentials, message context, runtime state, and task logs are stored outside the repository.

* * *

## Capabilities

Feature | Status | Notes
--- | --- | ---
Chat replies | Ready | Batches short message bursts and replies conversationally
Remote task execution | Ready | Runs Codex tasks from trusted WeChat commands
Live desktop log | Ready | Opens a Terminal tail for each new task
Instant status query | Ready | Returns task state without waiting for long jobs to finish
Completion notification | Ready | Pushes success or failure back to WeChat
Dynamic memory | Ready | Summarizes recent messages and tasks into local state
Scheduled messages | Ready | Generates fixed-time and randomized proactive messages from dynamic context

* * *

## Commands

Control commands:

```text
状态
任务
最近回复
记忆
日志
帮助
```

The bot also accepts the configured assistant name as a prefix, for example:

```text
扣子状态
扣子任务
扣子记忆
扣子日志
```

Remote task examples:

```text
执行：运行项目检查
Codex：整理一下当前项目结构
扣子，查看当前 git 状态
打开微信
```

Only the configured trusted WeChat sender can trigger computer-control mode.

* * *

## Project Layout

Path | Purpose
--- | ---
`src/codex-bot.js` | Long-running WeChat listener, router, and task runner
`src/send-core.js` | Shared WeChat sender for proactive messages
`src/config.js` | Runtime paths and environment overrides
`bin/wechat-codex-bot.sh` | LaunchAgent entry point
`bin/codex-generate-message.sh` | Codex CLI wrapper for generated short messages
`scripts/refresh-memory.js` | Summarizes recent messages and tasks into dynamic memory
`scripts/generate-proactive.js` | Generates proactive messages from dynamic memory
`scripts/notify-complete.sh` | Manual completion notification sender
`scripts/6pm.sh` | Fixed-time proactive message
`scripts/check-reply.sh` | Follow-up detector
`scripts/random.sh` | Randomized proactive message

* * *

## Runtime Files

LaunchAgent:

```text
~/Library/LaunchAgents/com.example.wechat-codex-bot.plist
```

Logs and state:

```text
~/.claude/wechat-codex-bot.log
~/.claude/wechat-codex-bot.err
~/.claude/wechat-send.log
~/.claude/wechat-codex-state.json
~/.claude/wechat-codex-tasks.json
~/.claude/wechat-codex-live/<task-id>.log
~/.claude/wechat-memory-events.json
~/.claude/wechat-dynamic-memory.md
~/.claude/wechat-memory-refresh-state.json
```

WeChat channel files:

```text
~/.claude/channels/wechat/account.json
~/.claude/channels/wechat/context_tokens.json
~/.claude/channels/wechat/sync_buf.txt
```

These files are local runtime data and should not be committed.

* * *

## Maintenance

Check syntax:

```bash
npm run check
```

Run locally:

```bash
npm start
```

Restart the always-on service:

```bash
launchctl kickstart -k gui/$(id -u)/com.example.wechat-codex-bot
```

Check service status:

```bash
launchctl print gui/$(id -u)/com.example.wechat-codex-bot
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

Set `WECHAT_CODEX_OPEN_TERMINAL=0` to keep task execution quiet on the desktop.

* * *

## Changelog

### 2026-07-09

* Added dynamic memory for recent WeChat messages, proactive replies, and task history.
* Added context-aware proactive message generation for fixed-time, random, follow-up, and manual sends.
* Added `记忆` / configured-prefix memory commands for checking the current dynamic state.
* Added live task logs and instant status responses for long-running remote tasks.
* Reworked the public README and publishing flow so runtime credentials and local state stay outside the repository.
