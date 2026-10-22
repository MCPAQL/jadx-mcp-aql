// SPDX-License-Identifier: AGPL-3.0-only
import java.util.zip.ZipFile
import java.security.MessageDigest
plugins { kotlin("jvm") }
group = "org.mcpaql"
version = "0.1.0"
kotlin { jvmToolchain { languageVersion.set(JavaLanguageVersion.of(17)); vendor.set(JvmVendorSpec.ADOPTIUM) } }
val epoch = providers.environmentVariable("SOURCE_DATE_EPOCH").orElse(rootProject.file(".source-date-epoch").readText().trim())
val verifyToolchain by tasks.registering {
    doLast {
        check(System.getProperty("java.runtime.version") == "17.0.20.1+1") { "Use the pinned Temurin 17.0.20.1+1 JDK (scripts/bootstrap.py)" }
        check(epoch.get() == rootProject.file(".source-date-epoch").readText().trim()) { "SOURCE_DATE_EPOCH differs from the pinned epoch" }
    }
}
tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach { dependsOn(verifyToolchain) }
val cliInventory by configurations.creating
dependencies {
    cliInventory("io.github.skylot:jadx-gui:1.5.6")
    implementation("io.github.skylot:jadx-core:1.5.6")
    implementation("io.github.skylot:jadx-dex-input:1.5.6")
    implementation("io.modelcontextprotocol:kotlin-sdk-server:0.15.0")
    implementation("org.slf4j:slf4j-nop:2.0.18")
    implementation("com.google.code.gson:gson:2.14.0")
    testImplementation("org.junit.jupiter:junit-jupiter:5.13.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.13.4")
    testRuntimeOnly("org.junit.platform:junit-platform-console-standalone:1.13.4")
    testImplementation("com.android.tools.smali:smali:3.0.9")
}
dependencyLocking { lockAllConfigurations() }
tasks.withType<AbstractArchiveTask>().configureEach {
    isPreserveFileTimestamps = false; isReproducibleFileOrder = true
    inputs.property("SOURCE_DATE_EPOCH",epoch)
}
tasks.test { useJUnitPlatform(); maxHeapSize = "1g" }
val mergeServices by tasks.registering {
    inputs.files(configurations.runtimeClasspath)
    outputs.dir(layout.buildDirectory.dir("merged-services"))
    doLast {
        val root = layout.buildDirectory.dir("merged-services").get().asFile
        root.deleteRecursively()
        val services = sortedMapOf<String, MutableSet<String>>()
        configurations.runtimeClasspath.get().filter { it.extension == "jar" }.forEach { jar ->
            ZipFile(jar).use { zip ->
                zip.entries().asSequence().filter { !it.isDirectory && Regex("(?i)(^|/)(license|notice|copying)[^/]*$").containsMatchIn(it.name) }.forEach { entry ->
                    val coordinate = "${jar.parentFile.parentFile.parentFile.name}-${jar.parentFile.parentFile.name}"
                    root.resolve("META-INF/dependency-notices/$coordinate/${entry.name}").apply { parentFile.mkdirs(); writeBytes(zip.getInputStream(entry).readBytes()) }
                }
                zip.entries().asSequence().filter { !it.isDirectory && it.name.startsWith("META-INF/services/") }.forEach { entry ->
                    services.getOrPut(entry.name) { sortedSetOf() }.addAll(zip.getInputStream(entry).bufferedReader().readLines().filter { it.isNotBlank() })
                }
            }
        }
        services.forEach { (name, lines) -> root.resolve(name).apply { parentFile.mkdirs(); writeText(lines.joinToString("\n", postfix="\n")) } }
    }
}
val fatJar by tasks.registering(Jar::class) {
    archiveFileName.set("rea-compat.jar")
    duplicatesStrategy = DuplicatesStrategy.EXCLUDE
    from(sourceSets.main.get().output)
    into("META-INF/mcpaql") { from(rootProject.file("LICENSE"),rootProject.file("NOTICE")) }
    from({ configurations.runtimeClasspath.get().filter { it.extension == "jar" }.map { zipTree(it) } }) { exclude("META-INF/services/**") }
    exclude("META-INF/*.SF", "META-INF/*.RSA", "META-INF/*.DSA", "module-info.class", "META-INF/versions/**/module-info.class")
    from(layout.buildDirectory.dir("merged-services"))
    dependsOn(mergeServices)
}
tasks.assemble { dependsOn(fatJar) }
val buildFixture by tasks.registering(Exec::class) {
    dependsOn(fatJar)
    inputs.dir("tests/fixture"); inputs.file(rootProject.file("scripts/build-fixture.py"))
    outputs.dir(rootProject.layout.buildDirectory.dir("fixture"))
    environment("JAVA_HOME",System.getProperty("java.home"))
    doFirst { environment("FIXTURE_CLASSPATH",configurations.testRuntimeClasspath.get().asPath) }
    workingDir(rootProject.projectDir)
    commandLine("python3", "scripts/build-fixture.py")
}
tasks.test { dependsOn(buildFixture) }
val integrationTest by tasks.registering(Exec::class) {
    dependsOn(buildFixture)
    environment("JAVA_HOME",System.getProperty("java.home"))
    workingDir(rootProject.projectDir)
    commandLine("python3", "rea-compat/tests/integration.py")
}
tasks.check { dependsOn(integrationTest) }
tasks.register("testClasspath") {
    dependsOn("testClasses",buildFixture)
    doLast { layout.buildDirectory.file("test-classpath.txt").get().asFile.writeText(sourceSets.test.get().runtimeClasspath.asPath) }
}
tasks.register("dependencyReport") {
    doLast {
        val artifacts = (configurations.runtimeClasspath.get().resolvedConfiguration.resolvedArtifacts + configurations.testRuntimeClasspath.get().resolvedConfiguration.resolvedArtifacts).distinctBy { it.moduleVersion.id.toString() }
        val f=rootProject.file("build/jvm-dependencies.tsv"); f.parentFile.mkdirs();f.writeText("coordinate\tscope\tsha256\tpath\n")
        val runtime = configurations.runtimeClasspath.get().files
        artifacts.sortedBy { it.moduleVersion.id.toString() }.forEach {
            val hash=MessageDigest.getInstance("SHA-256").digest(it.file.readBytes()).joinToString("") { b -> "%02x".format(b) }
            f.appendText("${it.moduleVersion.id}\t${if (it.file in runtime) "runtime" else "test"}\t$hash\t${it.file}\n")
        }
    }
}

tasks.register("cliDependencyReport") {
    doLast {
        val f=rootProject.file("build/cli-dependencies.tsv");f.parentFile.mkdirs();f.writeText("coordinate\tscope\tsha256\tpath\n")
        cliInventory.resolvedConfiguration.resolvedArtifacts.sortedBy { it.moduleVersion.id.toString() }.forEach {
            val hash=MessageDigest.getInstance("SHA-256").digest(it.file.readBytes()).joinToString("") { b -> "%02x".format(b) }
            f.appendText("${it.moduleVersion.id}\tofficial-cli-bundle\t$hash\t${it.file}\n")
        }
    }
}
