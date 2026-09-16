# Client applications

## Security model

Every client accepts only HTTPS server origins. The native Android app sends passwords only in an HTTPS JSON request and keeps only the returned session cookie. It replaces authentication error bodies with a generic message. The WebView clients disable password persistence; neither logs, stores, nor reflects passwords. The PWA service worker never intercepts or caches `/api/` traffic.

## Android Native

Open `src/androidapp` in Android Studio or run `gradle -p src/androidapp :app:assembleDebug`. It provides native setup, password/OIDC sign-in, dashboard and library navigation.

## Android Web

Run `gradle -p src/androidapp :webapp:assembleDebug`. This app exposes the entire hosted interface while retaining downloads, file uploads, cookies, navigation history and external-link handling.

## Windows (WinUI 3)

Build on Windows with `dotnet build src/windowsapp/Tracking.Windows/Tracking.Windows.csproj -c Release -p:Platform=x64`.

The client uses the Windows App SDK and WebView2. It includes saved server configuration, app navigation, refresh, open-in-browser, certificate failure handling and a secure connection setup screen.

## PWA

Copy `pwa/*` into the hosted frontend public root and register the service worker. API and authentication traffic is always network-only.

## Releases

Tags matching `v*` run tests and builds, then publish both Android APKs, the self-contained Windows x64 app, and a PWA asset archive in one GitHub release.

Android release APKs are unsigned unless repository signing secrets are added. They are suitable for sideload testing; production distribution should configure a protected keystore.
