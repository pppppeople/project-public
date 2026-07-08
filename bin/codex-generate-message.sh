#!/bin/bash
# Generate a short WeChat message with Codex.
# Usage: codex-generate-message.sh "prompt"

PROMPT="$1"
if [ "$PROMPT" = "-" ] || [ -z "$PROMPT" ]; then
  PROMPT="$(cat)"
fi
[ -z "$PROMPT" ] && exit 1

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE="${CODEX_WORKSPACE:-$(dirname "$PROJECT_ROOT")}"

CODEX_BIN="${CODEX_BIN:-/Applications/Codex.app/Contents/Resources/codex}"
[ -x "$CODEX_BIN" ] || CODEX_BIN="$(command -v codex 2>/dev/null)"
[ -x "$CODEX_BIN" ] || exit 1

OUT_FILE="$(mktemp "${TMPDIR:-/tmp}/codex-wechat-message.XXXXXX")"

"$CODEX_BIN" exec \
  --ephemeral \
  --skip-git-repo-check \
  -C "$WORKSPACE" \
  -s read-only \
  -o "$OUT_FILE" \
  "$PROMPT" >/dev/null 2>/dev/null

STATUS=$?
if [ "$STATUS" -ne 0 ] || [ ! -s "$OUT_FILE" ]; then
  rm -f "$OUT_FILE"
  exit 1
fi

python3 -c "import pathlib,sys; text=pathlib.Path(sys.argv[1]).read_text().strip(); print(text)" "$OUT_FILE"
rm -f "$OUT_FILE"
