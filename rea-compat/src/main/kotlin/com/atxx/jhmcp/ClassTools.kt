// SPDX-License-Identifier: AGPL-3.0-only
package com.atxx.jhmcp
import io.modelcontextprotocol.kotlin.sdk.server.Server
fun registerClassTools(server: Server, holder: SessionHolder) {
    registerCompat(server,holder,"list_classes")
    registerCompat(server,holder,"get_class_summary")
}
