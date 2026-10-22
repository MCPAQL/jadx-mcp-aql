// SPDX-License-Identifier: AGPL-3.0-only
package com.atxx.jhmcp

object BuildInfo { const val VERSION = "0.7.1" }
object AdapterBuildInfo { const val VERSION = "0.1.0" }
enum class ResourceMode {
    FULL, LITE, NONE;
    companion object {
        @JvmStatic fun parse(raw: String): ResourceMode = when (raw.lowercase()) {
            "full" -> FULL; "lite" -> LITE; "none", "skip", "no" -> NONE
            else -> throw IllegalArgumentException("resources must be full, lite or none")
        }
    }
}
data class SessionConfig(
    val maxSourceBytes: Int = 1048576, val codeScanCap: Int = 0,
    val decompileTimeoutMs: Long = 90000, val threads: Int = 1,
    val includePackages: List<String> = emptyList(), val excludePackages: List<String> = emptyList(),
    val codeCacheSize: Int = 64, val resourceMode: ResourceMode = ResourceMode.FULL
) {
    init {
        require(maxSourceBytes in 1..1048576) { "maxSourceBytes must be 1..1048576" }
        require(decompileTimeoutMs > 0) { "decompileTimeoutMs must be positive" }
        require(threads >= 0 && codeCacheSize >= 0 && codeScanCap >= 0) { "counts must be nonnegative" }
    }
    fun withLoadOverrides(include: List<String>?, exclude: List<String>?, threads: Int?, cacheSize: Int?, resources: ResourceMode?) =
        copy(includePackages = include ?: includePackages, excludePackages = exclude ?: excludePackages,
            threads = threads ?: this.threads, codeCacheSize = cacheSize ?: codeCacheSize, resourceMode = resources ?: resourceMode)
}
