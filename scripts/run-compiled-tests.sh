#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
set -euo pipefail
cd "$(dirname "$0")/.."
: "${JAVA_HOME:?Set JAVA_HOME to the pinned JDK}"
python3 scripts/assert-network-denied.py
repo_root="$PWD"
cd rea-compat
"$JAVA_HOME/bin/java" -Xmx1g -cp "$(cat build/test-classpath.txt)" org.junit.platform.console.ConsoleLauncher execute --scan-class-path --disable-banner --details=summary --reports-dir build/no-network-junit
cd "$repo_root"
python3 rea-compat/tests/integration.py
npm test
