// SPDX-License-Identifier: AGPL-3.0-only
package com.atxx.jhmcp

fun truncateToBytes(s: String?, maxBytes: Int): String {
    if (s == null || maxBytes <= 0) return ""
    val bytes = s.toByteArray(Charsets.UTF_8)
    if (bytes.size <= maxBytes) return s
    var end = maxBytes
    while (end > 0 && (bytes[end].toInt() and 0xc0) == 0x80) end--
    return String(bytes, 0, end, Charsets.UTF_8) + "\n\n... [truncated: exceeds $maxBytes bytes, total ${bytes.size} bytes]"
}
