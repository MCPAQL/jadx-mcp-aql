// SPDX-License-Identifier: AGPL-3.0-only
package com.atxx.jhmcp

import jadx.api.*
import jadx.api.plugins.JadxPlugin
import jadx.api.plugins.loader.JadxPluginLoader
import java.io.Closeable
import java.io.File
import java.io.StringReader
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipFile
import com.google.gson.JsonParser
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicInteger
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.TransformerFactory
import javax.xml.transform.dom.DOMSource
import javax.xml.transform.stream.StreamResult
import org.w3c.dom.Element
import org.xml.sax.InputSource

/** No plugin manager, user plugin directories, network clients, or disk code cache. */
class JadxSession(val path: String, initialConfig: SessionConfig) : Closeable {
    var config: SessionConfig = initialConfig; private set
    val maxSourceBytes: Int get() = config.maxSourceBytes
    val decompileCount = AtomicInteger()
    private var extractedInput: Path? = null
    private val executor = Executors.newSingleThreadExecutor { r -> Thread(r, "jadx-decompile").apply { isDaemon = true } }
    @Volatile private var timedOut = false
    private val cache = BoundedCodeCache(config.codeCacheSize)
    val decompiler: JadxDecompiler
    val classes: List<JavaClass>
    val classFqns: List<String>
    val rawClassCount: Int
    val resourceCount: Int get() = resources.size
    private val resources: List<ResourceFile>
    init {
        require(File(path).isFile && File(path).canRead()) { "not a readable file: $path" }
        val input = InputPaths.requireAllowed(Path.of(path))
        val args = JadxArgs().apply {
            inputFiles = listOf(prepareInput(input.toString())); threadsCount = if (config.threads == 0) Runtime.getRuntime().availableProcessors() else config.threads
            isSkipResources = config.resourceMode == ResourceMode.NONE
            isSkipFilesSave = true
            codeCache = cache
            // A fixed allowlist constructs only bundled, pinned plugins. No ServiceLoader/user discovery.
            pluginLoader = object : JadxPluginLoader {
                override fun load(): List<JadxPlugin> = listOf(
                    "jadx.plugins.input.dex.DexInputPlugin"
                ).map { Class.forName(it).getDeclaredConstructor().newInstance() as JadxPlugin }
                override fun close() {}
            }
        }
        decompiler = JadxDecompiler(args)
        try {
            decompiler.load()
            val all = decompiler.classes
            rawClassCount = all.size
            fun included(c: JavaClass) = (config.includePackages.isEmpty() || config.includePackages.any { c.fullName.startsWith(it) }) &&
                config.excludePackages.none { c.fullName.startsWith(it) }
            classes = all.filter(::included).toList()
            classFqns = classes.map { it.fullName }
            resources = if (config.resourceMode == ResourceMode.NONE) emptyList() else decompiler.resources.toList()
        } catch (e: Throwable) { decompiler.close(); executor.shutdownNow(); extractedInput?.let { Files.deleteIfExists(it) }; throw e }
    }
    data class SmartCode(val text: String, val kind: String, val fellBack: Boolean, val markers: List<String>)
    data class MethodSmali(val name: String, val blocks: List<String>, val found: Boolean, val note: String?)
    private fun <T> generate(cls: JavaClass, body: () -> T): T {
        check(!timedOut) { "session decompiler timed out; reload the APK" }
        val future = executor.submit(Callable { if (!cache.contains(cls.topParentClass.fullName)) decompileCount.incrementAndGet(); body() })
        try { return future.get(config.decompileTimeoutMs, TimeUnit.MILLISECONDS) }
        catch (e: TimeoutException) { timedOut = true; future.cancel(true); throw IllegalStateException("decompile timed out", e) }
        catch (e: ExecutionException) { throw IllegalStateException(e.cause?.message ?: "decompile failed", e.cause) }
    }
    fun getMethodBodySmart(method: JavaMethod, maxBytes: Int, smaliFallback: Boolean): SmartCode {
        val flags = method.methodNode.accessFlags
        if (flags.isNative || flags.isAbstract) return SmartCode("// method exists but has no decompiled body (native/abstract)", "java", false, emptyList())
        val text = try { generate(method.declaringClass) { method.codeStr } ?: "" }
        catch (e: Exception) { return SmartCode(truncateToBytes("// ERROR: decompile timed out or failed for ${method.declaringClass.fullName}: ${e.message}", maxBytes), "java", false, listOf("decompile_failure")) }
        val markers = failureMarkers(text)
        if (smaliFallback && markers.isNotEmpty()) {
            val smali = getMethodSmali(method.declaringClass, method.name)
            if (smali.found) return SmartCode(truncateToBytes("// [jadx java-decompile failed → smali]\n" + smali.blocks.joinToString("\n\n"), maxBytes), "smali", true, markers)
        }
        return SmartCode(truncateToBytes(text, maxBytes), "java", false, markers)
    }
    fun getMethodSmali(cls: JavaClass, methodName: String): MethodSmali {
        val blocks = Regex("(?ms)^\\.method\\b.*?^\\.end method[^\\n]*").findAll(cls.smali.substringBefore("\n###### Class ")).map { it.value }
            .filter { Regex("(?m)^\\.method[^\\n]*\\s" + Regex.escape(methodName) + "\\(").containsMatchIn(it) }.toList()
        return MethodSmali(methodName, blocks, blocks.isNotEmpty(), if (blocks.isEmpty()) "method not found" else null)
    }
    fun describeUsage(node: JavaNode, resolveLine: Boolean): Map<String, Any> {
        val containing = if (node is JavaClass) node.fullName else node.declaringClass?.fullName ?: ""
        return linkedMapOf<String, Any>("kind" to when (node) { is JavaClass -> "class"; is JavaMethod -> "method"; is JavaField -> "field"; else -> node.javaClass.simpleName },
            "name" to node.name, "full_name" to node.fullName, "containing_class" to containing,
            "top_class" to (node.topParentClass?.fullName ?: containing), "def_pos" to node.defPos).apply {
                if (resolveLine) put("line", when(node) { is JavaMethod -> node.methodNode.sourceLine; is JavaClass -> node.classNode.sourceLine; is JavaField -> node.fieldNode.sourceLine; else -> 0 })
            }
    }
    fun manifest(): String = resources.firstOrNull { it.originalName.substringAfterLast('/') == "AndroidManifest.xml" }
        ?.loadContent()?.text?.codeStr ?: throw IllegalArgumentException("AndroidManifest.xml not found")
    private fun document() = DocumentBuilderFactory.newInstance().apply {
        isNamespaceAware = true
        setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        setFeature("http://xml.org/sax/features/external-general-entities", false)
        setFeature("http://xml.org/sax/features/external-parameter-entities", false)
        setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, ""); setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "")
    }.newDocumentBuilder().parse(InputSource(StringReader(manifest())))
    fun appInfo(): Map<String, Any> {
        val doc = document()
        val elements = doc.getElementsByTagName("*")
        fun first(attr: String): String { for (i in 0 until elements.length) { val e = elements.item(i) as Element; if (e.hasAttributeNS(ANDROID, attr)) return e.getAttributeNS(ANDROID, attr) }; return "" }
        val permissions = doc.getElementsByTagName("uses-permission")
        return linkedMapOf("package" to doc.documentElement.getAttribute("package"), "version_name" to first("versionName"),
            "version_code" to first("versionCode"), "min_sdk" to first("minSdkVersion"), "target_sdk" to first("targetSdkVersion"),
            "permissions" to (0 until permissions.length).map { (permissions.item(it) as Element).getAttributeNS(ANDROID, "name") })
    }
    fun manifestSection(section: String?): String {
        if (section == null) return manifest()
        val tag = mapOf("permissions" to "uses-permission", "activities" to "activity", "services" to "service", "providers" to "provider", "receivers" to "receiver", "application" to "application")[section]
            ?: throw IllegalArgumentException("unknown manifest section: $section")
        val doc = document(); val nodes = doc.getElementsByTagName(tag)
        val transformer = TransformerFactory.newInstance().apply { setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, ""); setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "") }.newTransformer()
        transformer.setOutputProperty("omit-xml-declaration", "yes")
        return (0 until nodes.length).joinToString("\n") { i -> java.io.StringWriter().also { transformer.transform(DOMSource(nodes.item(i)), StreamResult(it)) }.toString() }
    }
    private fun prepareInput(path: String): File {
        if (!path.endsWith(".xapk",true)) return File(path)
        // Extract only the declared base into our own temp file; never trust ZIP paths.
        return ZipFile(path).use { zip ->
            val manifest = zip.getEntry("manifest.json")?.let { entry ->
                require(entry.size in 0..1048576) { "XAPK manifest is too large" }
                JsonParser.parseString(zip.getInputStream(entry).bufferedReader().use { it.readText() }).asJsonObject
            }
            val declared = manifest?.getAsJsonArray("split_apks")?.firstOrNull { it.asJsonObject.get("id")?.asString == "base" }
                ?.asJsonObject?.get("file")?.asString
            val entry = zip.getEntry(declared ?: "base.apk")
                ?: manifest?.get("package_name")?.asString?.let { zip.getEntry("$it.apk") }
                ?: throw IllegalArgumentException("XAPK base APK not found")
            require(entry.size in 0..(1024L*1024*1024)) { "XAPK base APK is too large" }
            val temp = Files.createTempFile("jadx-compat-base-", ".apk")
            extractedInput = temp
            try {
                zip.getInputStream(entry).use { input -> Files.newOutputStream(temp).use { output -> input.copyTo(output) } }
                temp.toFile()
            } catch(e: Exception) { Files.deleteIfExists(temp); throw e }
        }
    }
    override fun close() {
        executor.shutdownNow()
        try { decompiler.close() } finally { cache.close(); extractedInput?.let { Files.deleteIfExists(it) } }
    }
    companion object {
        const val ANDROID = "http://schemas.android.com/apk/res/android"
        fun failureMarkers(text: String): List<String> = listOf("incorrect_decompile" to "Code decompiled incorrectly", "not_decompiled" to "Method not decompiled", "goto_stub" to "goto L").filter { text.contains(it.second) }.map { it.first }
    }
}

private class BoundedCodeCache(private var limit: Int) : ICodeCache {
    private val entries = LinkedHashMap<String, ICodeInfo>(16, 0.75f, true)
    @Synchronized fun resize(size: Int) { limit = size; trim() }
    private fun trim() { if (limit > 0) while (entries.size > limit) entries.remove(entries.keys.first()) }
    @Synchronized override fun add(name: String, code: ICodeInfo) { entries[name] = code; trim() }
    @Synchronized override fun remove(name: String) { entries.remove(name) }
    @Synchronized override fun get(name: String): ICodeInfo = entries[name] ?: ICodeInfo.EMPTY
    @Synchronized override fun getCode(name: String): String? = entries[name]?.codeStr
    @Synchronized override fun contains(name: String): Boolean = entries.containsKey(name)
    @Synchronized override fun close() { entries.clear() }
}
