#!/usr/bin/env bash
# The gate lives in the repository root. This wrapper keeps `bash scripts/check.sh` working from the app folder.
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/check.sh" "$@"
