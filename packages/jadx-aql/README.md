<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# JADX AQL

An offline MCP-AQL adapter for Android package analysis, with a separate JVM
compatibility library for REA 6.5.0. Original code is **AGPL-3.0-only**.
[JADX](https://github.com/skylot/jadx) is an independent Apache-2.0 project.

| Component | Purpose |
| --- | --- |
| `packages/jadx-aql` | Primary TypeScript stdio server. Runs the unmodified, checksum-pinned official JADX 1.5.6 CLI as a subprocess. |
| `rea-compat` | Minimal Kotlin/JVM shim over jadx-core 1.5.6 for REA's Java bridge. No standalone server or MCP-AQL implementation. |

## Build and test

Node.js 24.16.0, Eclipse Temurin 17.0.20.1+1, Gradle 8.14.3 and the official JADX
1.5.6 release are pinned in `toolchain.lock.json`. The bootstrap script downloads
and verifies build tools explicitly; neither runtime component downloads files.

```sh
python3 scripts/bootstrap.py
source .tools/env.sh
export SOURCE_DATE_EPOCH="$(cat .source-date-epoch)"
npm ci --ignore-scripts
npm run build
.tools/gradle-8.14.3/bin/gradle build :rea-compat:testClasspath
npm test
bash scripts/test-no-network.sh
```

Bootstrap supports Linux x64 and macOS arm64. The network-denied test runner uses
macOS `sandbox-exec` or Linux `unshare -n`; the latter needs network-namespace
permission. In Linux CI it runs with `sudo`. After dependency resolution, Gradle
builds support `--offline`. Fixtures are assembled from this repository's smali
and binary-XML encoder. No third-party APKs are downloaded or executed.

## TypeScript adapter

```sh
node packages/jadx-aql/dist/server.js \
  --jadx-jar "$PWD/.tools/jadx-1.5.6/lib/jadx-1.5.6-all.jar" \
  --java "$JAVA_HOME/bin/java"
```

The installed npm command is `jadx-aql`. `JADX_CLI_JAR` and `JADX_JAVA` can supply
the same paths. The JAR is verified against the official release's pinned hash
before any input is loaded. It is not bundled in the npm package.

Five CRUDE tools accept `{operation, params}`. Start with:

```json
{"name":"mcp_aql_read","arguments":{"operation":"introspect","params":{"query":"operations"}}}
```

Use `params.name` to fetch one operation's complete parameters and return shape,
or `query: "types"` for response type names. Introspection works through every
endpoint. Other operations must use their assigned endpoint:

| Endpoint | Operations |
| --- | --- |
| `mcp_aql_create` | `load_apk` |
| `mcp_aql_read` | `status`, `app_info`, `manifest`, `main_activity`, `list_classes`, `resolve_class`, `search_classes`, `search_methods`, `class_summary`, `class_source`, `method_body`, `xrefs`, `strings`, `list_resources`, `resource`, `introspect` |
| `mcp_aql_update` | `set_session_options` |
| `mcp_aql_delete` | `unload_apk` |
| `mcp_aql_execute` | `export_sources` |

Results use `{success:true,data}` or `{success:false,error:{code,message}}` inside
one MCP text item. Read operations support `params.fields: string[]` for selecting
properties. Pages default to 200 items and are capped at 4096. Text is limited to
1 MiB by default; serialized result bodies have a 2 MiB ceiling. Use pagination,
`max_bytes` or field selection to narrow larger results.

Loading runs the CLI twice, for its JSON metadata/call graph and exact Java source,
into a private temporary cache. Later reads consume that cache. Session replacement
and unload remove it. `export_sources` copies cached Java into a new caller-chosen
directory; it refuses an existing destination. The adapter never executes APK code.
Inputs are limited to APK, DEX, JAR, class and XAPK files, at most 512 MiB.
Each CLI subprocess has a timeout, bounded captured diagnostics, isolated config,
cache and home directories, and no inherited Java injection options.

The CLI's call graph supplies **method-call edges**, not a complete class/field
use inventory or instruction-level invoke sites. Xref responses declare that scope.
Raw smali is unavailable through the CLI. Constructors and static initializers can
be folded out of generated source; `method_body.available` reports missing bodies.
The separate REA shim provides its bridge's required raw metadata and smali API.

## REA compatibility

Build output is `rea-compat/build/libs/rea-compat.jar`. REA runs its own Java source
bridge with this JAR on the classpath. The shim implements the required
`com.atxx.jhmcp` API and executes only `load_apk`, `get_app_info`, and
`get_android_manifest`. Five additional tool registrations provide schemas that
REA replaces with its own handlers. There is no JAR entry point.

`BuildInfo.VERSION` is the required compatibility value `0.7.1`;
`AdapterBuildInfo.VERSION` is the implementation version `0.1.0`. The unmodified
REA 6.5.0 test bridge, MIT licence and hash provenance are in
`rea-compat/tests/vendor`. The shim intentionally supports APK/DEX and XAPK-base
loading; general JAR/class analysis belongs to the TypeScript CLI adapter.

## Verify this build

The release workflow builds the shim twice from clean source trees in different
paths using the pinned JDK, then compares SHA-256. Gradle enforces committed
version locks and dependency verification metadata. Archive timestamps are
normalized, entry order is reproducible, `SOURCE_DATE_EPOCH` is pinned, and the
manifest contains no build-time information.

Run the same comparison locally after resolving build dependencies:

```sh
source .tools/env.sh
python3 scripts/reproducible-build.py
```

Release artifacts include `rea-compat.jar`, the npm tarball, `SHA256SUMS`, and a
Sigstore build-provenance bundle generated by `actions/attest-build-provenance`.
After downloading the release files, verify their hashes and GitHub attestations:

```sh
sha256sum -c SHA256SUMS
# macOS: shasum -a 256 -c SHA256SUMS
gh attestation verify rea-compat.jar --repo MCPAQL/jadx-aql
gh attestation verify mcpaql-jadx-aql-0.1.0.tgz --repo MCPAQL/jadx-aql
```

The workflow publishes that exact npm tarball with `npm publish --provenance`.
Configure the workflow as the package's npm trusted publisher before releasing.
Consumers can use `npm audit signatures` to verify supported registry signatures
and provenance. The `release` environment can enforce repository release approval.
No releases or packages are published by a local build.

## Dependencies and measurements

`NOTICE` lists every resolved dependency and its publisher-declared licence.
`docs/dependencies.json` records versions, scopes, hashes and licence references.
`package-lock.json` pins npm integrity hashes; `gradle/verification-metadata.xml`
pins JVM build/test/plugin artifacts and metadata. The official CLI archive and
its executable JAR have separate checksum pins. Its cross-platform release also
contains GUI libraries; those are inventoried but are not bundled into our outputs.

JVM artifacts come from Maven Central except Google-only Android build/smali
artifacts, restricted to their group names in the repository configuration.

Tool-list and introspection captures are in `docs/measurements`. To reproduce
local tokenizer measurements after running the bridge tests:

```sh
npm run measure
python3 -m venv .tools/tokenizer
.tools/tokenizer/bin/pip install tiktoken==0.12.0
.tools/tokenizer/bin/python scripts/measure.py
```

Counts use `cl100k_base`, not Anthropic's API. No exact legacy tools/list baseline
was supplied; that comparison is recorded as unavailable. See
`docs/validation.md` for the measured results and test scope.
