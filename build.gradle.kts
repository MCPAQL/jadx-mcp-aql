// SPDX-License-Identifier: AGPL-3.0-only
plugins { base; kotlin("jvm") version "2.4.0" apply false }
tasks.build { dependsOn(":rea-compat:build") }
