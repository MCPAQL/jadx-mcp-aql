// SPDX-License-Identifier: AGPL-3.0-only
package com.atxx.jhmcp

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class SessionHolder(val defaults: SessionConfig) {
    private val mutex = Mutex()
    @Volatile private var session: JadxSession? = null
    fun current(): JadxSession? = session
    suspend fun load(path: String, cfg: SessionConfig): LoadResult = mutex.withLock {
        val start = System.nanoTime()
        val replacement = JadxSession(path, cfg)
        val old = session
        session = replacement
        old?.close()
        LoadResult("LOADED", path, replacement.classFqns.size, replacement.resourceCount,
            cfg.threads, cfg.resourceMode.name.lowercase(), replacement.rawClassCount,
            (System.nanoTime() - start) / 1_000_000, cfg.decompileTimeoutMs, cfg.codeCacheSize,
            cfg.includePackages, cfg.excludePackages)
    }
    suspend fun unload(): Boolean = mutex.withLock {
        val old = session ?: return@withLock false
        session = null
        old.close()
        true
    }
    fun snapshot(): Map<String, Any> = linkedMapOf(
        "state" to if (session == null) "UNLOADED" else "LOADED",
        "engine_reported_version" to BuildInfo.VERSION, "adapter_version" to AdapterBuildInfo.VERSION,
        "max_heap_bytes" to Runtime.getRuntime().maxMemory(), "available_processors" to Runtime.getRuntime().availableProcessors(),
        "java_version" to System.getProperty("java.version"), "metadata_scope" to "parsed_members"
    ).apply { session?.let { put("apk_path", it.path); put("class_count", it.classFqns.size); put("decompile_count", it.decompileCount.get()) } }
}
data class LoadResult(
    val state: String, val apk_path: String, val class_count: Int, val resource_count: Int,
    val threads: Int, val resources: String, val raw_class_count: Int, val load_duration_ms: Long,
    val decompile_timeout_ms: Long, val code_cache_size: Int,
    val include_packages: List<String>, val exclude_packages: List<String>
)
