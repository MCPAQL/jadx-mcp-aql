// SPDX-License-Identifier: AGPL-3.0-only
pluginManagement { repositories { mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
    repositories {
        mavenCentral()
        // jadx 1.5.6 requires Google's R8 and smali 3.0.9, absent from Central.
        exclusiveContent {
            forRepository { maven { url = uri("https://dl.google.com/dl/android/maven2/") } }
            filter { includeGroup("com.android.tools"); includeGroup("com.android.tools.smali"); includeGroup("com.android.tools.build") }
        }
    }
}
rootProject.name = "jadx-mcp-aql"
include("rea-compat")
