// SPDX-License-Identifier: AGPL-3.0-only
package com.atxx.jhmcp
import io.modelcontextprotocol.kotlin.sdk.server.Server
fun registerXrefTools(server: Server, holder: SessionHolder) {
    registerCompat(server,holder,"get_xrefs_to_class")
    registerCompat(server,holder,"get_xrefs_to_method")
}
