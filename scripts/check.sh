#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/../uangku-app" ]; then
	APP_DIR="$(cd "$SCRIPT_DIR/../uangku-app" && pwd)"
elif [ -f "$SCRIPT_DIR/../package.json" ]; then
	APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
else
	APP_DIR="$(pwd)"
fi

cd "$APP_DIR"

echo "=== [1/4] Typecheck (svelte-check) ==="
npm run check

echo "=== [2/4] Build (SvelteKit + Cloudflare Adapter) ==="
npm run build

echo "=== [3/4] Impeccable Design Smell Detection ==="
IMPECCABLE_BIN="${IMPECCABLE_BIN:-/root/.claude/skills/impeccable/scripts/impeccable}"
if [ -x "$IMPECCABLE_BIN" ]; then
	ISSUES="$("$IMPECCABLE_BIN" detect --json src/)"
	echo "Impeccable results: $ISSUES"
	if [ "$ISSUES" != "[]" ] && [ -n "$ISSUES" ]; then
		echo "Impeccable detected issues in src/"
		exit 1
	fi
else
	echo "Impeccable binary not found at $IMPECCABLE_BIN; skipping."
fi

echo "=== [4/4] Vitest Suite ==="
if [ -f "/usr/local/lib/libresinit.so" ]; then
	export LD_PRELOAD="/usr/local/lib/libresinit.so"
fi
npm test

echo "=== ALL CHECKS PASSED ==="
