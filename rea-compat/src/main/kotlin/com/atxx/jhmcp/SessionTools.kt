// SPDX-License-Identifier: AGPL-3.0-only
package com.atxx.jhmcp
import io.modelcontextprotocol.kotlin.sdk.server.Server
fun registerSessionTools(server: Server, holder: SessionHolder) {
    registerCompat(server,holder,"load_apk")
    registerCompat(server,holder,"get_app_info")
}
