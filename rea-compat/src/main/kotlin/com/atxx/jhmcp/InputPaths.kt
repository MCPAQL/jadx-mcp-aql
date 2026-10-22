// SPDX-License-Identifier: AGPL-3.0-only
package com.atxx.jhmcp

import java.io.File
import java.nio.file.Path

internal object InputPaths {
    fun requireAllowed(input: Path, roots: List<Path> = configuredRoots()): Path {
        val canonical=input.toRealPath()
        require(roots.any { canonical.startsWith(it.toRealPath()) }) { "path is outside the operator-configured allowed roots" }
        require(canonical.fileName.toString().substringAfterLast('.').lowercase() in setOf("apk","dex","xapk")) { "expected an APK, DEX or XAPK file" }
        return canonical
    }
    private fun configuredRoots(): List<Path> =
        System.getenv("JADX_ALLOWED_ROOTS")?.let { raw ->
            require(raw.isNotBlank()) { "JADX_ALLOWED_ROOTS must not be empty" }
            raw.split(File.pathSeparator).map { Path.of(it) }
        } ?: listOf(Path.of(System.getProperty("user.dir")))
}
