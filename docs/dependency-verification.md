<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Dependency verification provenance

## Kotlin coroutines BOM 1.8.0

The clean CI build resolves `org.jetbrains.kotlinx:kotlinx-coroutines-bom:1.8.0`
while configuring the Kotlin plugin classpath. Its POM was absent from the
committed verification metadata; the runtime BOM 1.11.0 was already covered.
The added entry pins only the missing POM and does not change dependency
versions, disable metadata verification, or broaden trusted groups or keys.

Verified on 2026-10-29:

- [Maven Central POM](https://repo.maven.apache.org/maven2/org/jetbrains/kotlinx/kotlinx-coroutines-bom/1.8.0/kotlinx-coroutines-bom-1.8.0.pom)
  SHA-256: `1239e9dbe1397cd5971342956b2511bc3ace7b641842e4372a088dcfa8b9ad55`.
  The published `.sha256` sidecar matches.
- The POM's detached `.asc` signature, dated 2024-02-15, verifies with signing
  subkey `E7DC75FC24FB3C8DFE8086AD3D5839A2262CBBFB`, under primary key
  `BC900CD2FC9A9D906ECBA48BE3822B59020A349D` (Kotlin Libraries Release).
- The signer is independently identified for `org.jetbrains.kotlinx` in
  [Gradle v8.14.3's verification metadata](https://github.com/gradle/gradle/blob/v8.14.3/gradle/verification-metadata.xml),
  rather than trusted solely from the keyserver's self-described identity.
- The coordinates, platform constraints, and POM-only publication agree with
  [the upstream 1.8.0 BOM source](https://github.com/Kotlin/kotlinx.coroutines/blob/1.8.0/kotlinx-coroutines-bom/build.gradle.kts).

For future failures, distinguish a missing entry from a mismatched checksum.
Verify the precise artifact and its upstream provenance before editing its pin.
Do not regenerate or accept verification metadata from a populated cache without
review; fresh resolution can require metadata that cached builds did not revisit.
