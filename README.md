# Unnamed Tracking Apps

Official companion clients for a self-hosted Unnamed Tracking server.

## Applications

- **Android Native** — Material 3 sign-in, OIDC, dashboard and library views.
- **Android Web** — a hardened WebView wrapper for the complete hosted interface.
- **Windows** — a WinUI 3 desktop shell with connection management and WebView2.
- **PWA** — install metadata, offline fallback and service-worker assets.

All clients require an `https://` server. Passwords are submitted only inside encrypted HTTPS requests, are never stored by these clients, and authentication error bodies are never reflected to users.

See [docs/CLIENTS.md](docs/CLIENTS.md) for setup and release details.
