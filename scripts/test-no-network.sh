#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
set -euo pipefail
cd "$(dirname "$0")/.."
# Compile/resolve dependencies before entering the sandbox. This runs every test,
# directly, so neither Gradle daemon sockets nor test worker sockets need exemptions.
case "$(uname -s)" in
    Darwin) exec sandbox-exec -f scripts/no-network.sb bash scripts/run-compiled-tests.sh ;;
    Linux) exec unshare -n bash scripts/run-compiled-tests.sh ;;
    *) echo 'No supported network-denial sandbox on this platform' >&2; exit 1 ;;
esac
