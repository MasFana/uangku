#!/bin/sh
# Smoke test Uangku. Pakai: sh scripts/smoke.sh <base-url>
# Contoh: sh scripts/smoke.sh https://uangku.example.workers.dev
# Gagal bila binding D1 tidak terbaca (gejala: 500 "Database binding APP_DB missing").
BASE=${1:-${BASE_URL:-}}
if [ -z "$BASE" ]; then
	echo "Pakai: sh scripts/smoke.sh <base-url>" >&2
	exit 2
fi
fail=0

check() {
	got=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$1")
	if [ "$got" != "$2" ]; then
		echo "GAGAL $1: harap $2, dapat $got"
		fail=1
	else
		echo "OK    $1: $got"
	fi
}

check /login 200
check /api/auth/get-session 200
check / 303

[ "$fail" -eq 0 ] && echo '=== SMOKE PASSED ===' || echo '=== SMOKE FAILED ==='
exit $fail
