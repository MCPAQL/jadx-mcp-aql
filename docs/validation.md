<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Validation

Both components build and all **36 tests pass**, including with outbound
networking denied: 21 TypeScript tests, 8 JVM unit tests and 7 tests that compile
and launch the unmodified REA 6.5.0 source bridge against the shim. This includes
all original 30 tests and six confinement/signal regression checks. Fixture APKs
are built from repository sources and are never executed.

The primary package is `@mcpaql/jadx-aql@0.1.0`. Its five tools dispatch 20
operations, including introspection. The JVM shim contains no main class and
no MCP-AQL implementation.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| rea-compat.jar | 20,608,592 | `3548e1fc968154a3c40923ebf538fdeb0d9fb266b18a91c2567eb45970dfe1a7` |
| mcpaql-jadx-aql-0.1.0.tgz | 34,734 | `277214ce05ae74ca6a41ee52bcde22bdad2b6d09a6cd785c943fc68e1f69bd85` |

The JAR rebuilt identically from **two clean source trees in different paths**,
using pinned Temurin 17.0.20.1+1 and SOURCE_DATE_EPOCH=1783641600.
The npm tarball also rebuilt identically from two clean source trees, using
offline dependency installs. Normal build artifacts match both clean-build
hashes. The tarball contains 16 files and passed the public-content
and SPDX-header checks. Build output modes are normalized, including an
executable server entry point.

The repository NOTICE contains the entire unmodified JADX 1.5.6 NOTICE,
including Skylot, AOSP and component notices. The same bytes appear inside the
shim at META-INF/NOTICE and in the npm package. The independent compatibility
implementation credits jadx-headless-mcp's public interface and Apache-2.0
licence; the unmodified licence is retained. Vendored bridge files retain their
original bytes and now have MIT sidecars. Original code remains AGPL-3.0-only.

Confinement regression checks reject input/export paths outside operator roots,
including symlink escapes. SIGINT, SIGTERM and SIGHUP remove loaded caches;
SIGHUP also cancels an active CLI load and removes its partial cache. The release
workflow builds with read-only permissions and grants write permissions only to
the separate publishing job. Network-namespace tests drop to the normal build
user after namespace creation.

| Measured tools/list result | Tools | Characters | cl100k_base tokens |
| --- | ---: | ---: | ---: |
| TypeScript MCP-AQL | 5 | 1,702 | 365 |
| REA bridge against the shim | 9 | 2,556 | 545 |

The TS list reduces characters by 33.41%
and local tokenizer tokens by 33.03%.
Introspection's summary costs 2,682 characters /
545 tokens; all operation details
cost 10,840 characters /
2496 tokens. Projecting a fixture
class summary reduces its CallToolResult from 1,275
characters / 307 tokens to
137 characters /
35 tokens. Counts use tiktoken
0.12.0 / cl100k_base, not Anthropic count_tokens. The exact legacy tools/list
baseline is unavailable.

In the network-denied integration run, the REA bridge initialized in
0.665 seconds, emitted 269 aggregate
stderr bytes and had a largest stdout frame of 1,048,867 bytes.
The TypeScript stdio integration test checks that server stderr is empty.

NOTICE and dependencies.json list 262 resolved dependency
records, including shim runtime/test components, npm runtime/development
components and the upstream cross-platform CLI bundle. Every record has a
publisher licence. The optional tokenizer is listed separately from runtime
dependencies.

CI/release workflow YAML and job permission boundaries were checked locally.
Neither workflow has been executed remotely; no release or npm publication
has been performed. First-publish authentication, trusted publishing and the
release environment require maintainer configuration before the first tag.
See RELEASING.md for the fresh-clone publication procedure and release gates.
The adapter has not been tested against a live REA installation.

CLI limitation: method-call graph edges are not a complete class/field use
inventory. Raw smali and bodies folded out by Java generation are unavailable
through the CLI. These remain REA-only shim capabilities. No large third-party
APK corpus was tested.

See validation.json, reproducibility.json, npm-reproducibility.json,
artifact.sha256 and measurements/footprint.json for machine-readable evidence.
