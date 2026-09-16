# Android apps

Two co-installable Android 10+ clients are included: `app` is the native Material 3 client and `webapp` is the full hosted-interface wrapper. Both require HTTPS, validate certificates, and never persist passwords.

Build and test with `gradle testDebugUnitTest lintDebug assembleDebug` from this directory.

The native client keeps the server's `HttpOnly` session cookie in private app storage. Its OIDC flow uses the system browser, PKCE, a short-lived one-use handoff code and the `tracking-native://oidc/callback` URI. The server must include the corresponding mobile OIDC endpoints before that option is enabled.
