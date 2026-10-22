<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Validation

Both components build and all **30 tests pass**, including with outbound
networking denied: 16 TypeScript tests, 7 JVM unit tests and 7 tests that compile
and launch the unmodified REA 6.5.0 source bridge against the shim. The fixture
APKs are built from repository sources and are never executed.

The primary package is `@mcpaql/jadx-aql@0.1.0`. Its five tools dispatch 20
operations, including introspection. The JVM shim contains no main class and
no MCP-AQL implementation; its own source is 341 lines across 10 Kotlin files.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| rea-compat.jar | 20,590,803 | `7deac1765a3d788bfda43bab67f44ff62c73f191ff68e50dd075727d3fa4b9ca` |
| mcpaql-jadx-aql-0.1.0.tgz | 31,017 | `520b85f13d79b4b7c3ae21cf45c0b6e1b3cfd9cb52b32b40ecddb576f0a1c796` |

The JAR rebuilt identically from **two clean source trees in different paths**,
using pinned Temurin 17.0.20.1+1 and SOURCE_DATE_EPOCH=1783641600.
The normal build's JAR has the same hash. The npm tarball contains 16
files and passed the public-content and SPDX-header checks.

| Measured tools/list result | Tools | Characters | cl100k_base tokens |
| --- | ---: | ---: | ---: |
| TypeScript MCP-AQL | 5 | 1,702 | 365 |
| REA bridge against the shim | 9 | 2,556 | 545 |

The TS list reduces characters by 33.41%
and local tokenizer tokens by 33.03%.
Introspection's summary costs 2,682 characters /
545 tokens; requesting every
operation's details separately totals 10,840
characters / 2496 tokens.
Projecting a fixture class summary reduces its CallToolResult from
1,275 characters / 307
tokens to 137 characters /
35 tokens.
Counts use tiktoken 0.12.0 / cl100k_base, not Anthropic count_tokens.
An exact original tools/list baseline was not supplied and remains unavailable.

In the network-denied integration run, the REA bridge initialized in
0.512 seconds, emitted 269 aggregate
stderr bytes and had a largest stdout frame of 1,048,867 bytes.
The TypeScript stdio integration test checks that server stderr is empty.

`NOTICE` and `dependencies.json` list 262 resolved dependency records,
including shim runtime/test components, npm runtime/development components and
the upstream cross-platform CLI bundle. Every record has a publisher licence.
The optional tokenizer is listed separately from runtime dependencies.

CI/release workflow YAML was parsed locally. The CI workflow repeats the builds,
network-denied tests and clean-build comparison on Linux. The release workflow
packages checksums, uses actions/attest-build-provenance, and publishes the exact
npm tarball with --provenance. Neither workflow has been executed remotely and
no release, npm publish, GitHub repository creation or live REA installation was
performed during this work. Trusted npm publishing and the release environment
must be configured in the target public repository before a release.

CLI limitation: method-call graph edges are not a complete class/field use
inventory. Raw smali and bodies folded out by Java generation are unavailable
through the CLI. Those capabilities remain in the REA-only shim as required by
its interface. No large third-party APK corpus was downloaded or tested.

See `validation.json`, `reproducibility.json`, `artifact.sha256`, and
`measurements/footprint.json` for machine-readable evidence.
