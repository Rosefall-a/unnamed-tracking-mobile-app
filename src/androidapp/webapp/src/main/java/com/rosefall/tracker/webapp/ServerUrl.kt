package com.rosefall.tracker.webapp

import java.net.URI

object ServerUrl {
    fun normalize(rawValue: String): String {
        val trimmed = rawValue.trim()
        require(trimmed.isNotEmpty()) { "Enter your tracking server address." }
        val withScheme = if ("://" in trimmed) trimmed else "https://$trimmed"
        val uri = URI(withScheme)
        require(uri.scheme == "https") { "Use an https:// server address so credentials are encrypted." }
        require(!uri.host.isNullOrBlank() && uri.userInfo == null) { "Enter a valid server address." }
        require(uri.fragment == null && uri.query == null) { "The server address cannot contain a query or fragment." }
        return withScheme.trimEnd('/')
    }

}
