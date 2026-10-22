// SPDX-License-Identifier: AGPL-3.0-only
package com.atxx.jhmcp
import io.modelcontextprotocol.kotlin.sdk.server.Server
fun registerMethodTools(server: Server, holder: SessionHolder) = registerCompat(server,holder,"get_method_body")
