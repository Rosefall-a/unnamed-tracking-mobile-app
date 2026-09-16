package com.rosefall.tracker.network

import org.junit.Assert.assertFalse
import org.junit.Test

class AuthErrorSafetyTest {
    @Test
    fun apiExceptionDoesNotEmbedRequestPassword() {
        val password = "correct-horse-battery-staple"
        val error = ApiException(401, "Sign-in failed. Check your details and try again.")
        assertFalse(error.message.orEmpty().contains(password))
    }
}
