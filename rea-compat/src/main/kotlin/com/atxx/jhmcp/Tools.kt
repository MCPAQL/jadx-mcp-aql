// SPDX-License-Identifier: AGPL-3.0-only
package com.atxx.jhmcp

import com.google.gson.GsonBuilder
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import io.modelcontextprotocol.kotlin.sdk.server.Server
import io.modelcontextprotocol.kotlin.sdk.types.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

internal val json = GsonBuilder().disableHtmlEscaping().create()
private fun JsonObject.string(name: String, fallback: String? = null): String {
    val value = get(name) ?: return fallback ?: throw IllegalArgumentException("$name is required")
    require(value.isJsonPrimitive && value.asJsonPrimitive.isString) { "$name must be a string" }
    return value.asString
}
private fun JsonObject.integer(name: String, fallback: Int): Int {
    val v=get(name) ?: return fallback
    require(v.isJsonPrimitive && v.asJsonPrimitive.isNumber) { "$name must be a nonnegative integer" }
    val n=try { v.asBigDecimal.intValueExact() } catch (_: ArithmeticException) { throw IllegalArgumentException("$name must be an integer") }
    require(n>=0) { "$name must be nonnegative" };return n
}
private fun text(value: Any, failed: Boolean = false): CallToolResult {
    val s=if(value is String) value else json.toJson(value)
    if(json.toJson(s).toByteArray().size > 7*1024*1024) return CallToolResult(listOf(TextContent("output exceeds limit")),isError=true)
    return CallToolResult(listOf(TextContent(s)),isError=failed)
}
internal fun registerCompat(server: Server, holder: SessionHolder, name: String) {
    fun str()=mapOf("type" to "string")
    fun int(default: Int)=mapOf("type" to "integer","minimum" to 0,"default" to default)
    val cls=mapOf("class_name" to str())
    val method=cls+mapOf("method_name" to str(),"overload_index" to int(0))
    val props: Map<String,Any> = when(name) {
        "load_apk" -> mapOf("path" to str(),"threads" to int(1),"resources" to mapOf("type" to "string","enum" to listOf("full","lite","none")),"include_packages" to str(),"exclude_packages" to str(),"code_cache_size" to int(64))
        "get_android_manifest" -> mapOf("section" to str(),"max_bytes" to int(1048576))
        "list_classes" -> mapOf("offset" to int(0),"limit" to int(200))
        "get_method_body","get_xrefs_to_method" -> method
        "get_class_summary","get_xrefs_to_class" -> cls
        else -> emptyMap()
    }
    val required=when(name) { "load_apk" -> listOf("path"); "get_method_body","get_xrefs_to_method" -> listOf("class_name","method_name"); "get_class_summary","get_xrefs_to_class" -> listOf("class_name"); else -> emptyList() }
    server.addTool(Tool(name,ToolSchema(properties=Json.parseToJsonElement(json.toJson(props)).jsonObject,required=required),"REA compatibility: $name")) { request ->
        try {
            val p=JsonParser.parseString(request.arguments?.toString() ?: "{}").asJsonObject
            val result: Any=when(name) {
                "load_apk" -> {
                    val path=p.string("path"); require(path.isNotBlank()) { "path is required" }
                    fun packages(key: String)=if(p.has(key)) p.string(key).split(',').map { it.trim() }.filter { it.isNotEmpty() } else null
                    val cfg=holder.defaults.withLoadOverrides(packages("include_packages"),packages("exclude_packages"),if(p.has("threads")) p.integer("threads",1) else null,if(p.has("code_cache_size")) p.integer("code_cache_size",64) else null,if(p.has("resources")) ResourceMode.parse(p.string("resources")) else null)
                    try { holder.load(path,cfg) } catch(e: Exception) { throw IllegalArgumentException("load failed: ${e.message}") }
                }
                "get_app_info" -> (holder.current() ?: throw IllegalArgumentException("No APK loaded")).appInfo()
                "get_android_manifest" -> {
                    val s=holder.current() ?: throw IllegalArgumentException("No APK loaded")
                    truncateToBytes(s.manifestSection(if(p.has("section")) p.string("section") else null),p.integer("max_bytes",s.maxSourceBytes).coerceAtMost(s.maxSourceBytes))
                }
                else -> throw IllegalArgumentException("This schema is implemented by the REA bridge")
            }
            text(result)
        } catch(e: Exception) { text((e.message ?: "operation failed").take(4096),true) }
    }
}
