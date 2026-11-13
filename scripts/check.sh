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
IMPECCABLE_BIN="${IMPECCABLE_BIN:-impeccable}"
if command -v "$IMPECCABLE_BIN" >/dev/null 2>&1; then
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
# On musl hosts workerd can need a resolver shim. Pass its path in UANGKU_LD_PRELOAD.
if [ -n "${UANGKU_LD_PRELOAD:-}" ]; then
	export LD_PRELOAD="$UANGKU_LD_PRELOAD"
fi
npm test

echo "=== ALL CHECKS PASSED ==="
