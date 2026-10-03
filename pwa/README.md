# PWA assets

These existing assets are the foundation of the maintained `official.pwa` plugin.
PWA integration version is recorded in `version.json` and remains **0.0.1**;
native Android, Android WebView and Windows/WinUI versions are independent.

The host owns `/service-worker.js`, `/manifest.webmanifest`, and public `/pwa/`
routes. The plugin contributes validated install metadata and bounded PNG icons
through explicit `frontend.pwa` permission. A worker located under a plugin URL
does not automatically control `/`; do not deploy these files by copying them
into the host's public root. `service-worker.js` is a reviewed host template,
prefixed with host-derived enablement and installation generation metadata.
Without that metadata it fails safely by retiring its own registration.

The PWA exposes the complete existing application, with its normal sessions and
login/SSO. It stores no passwords or private offline data. Only a neutral waiting
for internet HTML page is cached; `/api/`, authentication and non-navigation
requests pass through. No runtime response is written to CacheStorage. Offline
content has no time expiry. Version changes replace the owned cache; removal or
disablement is observed on the next online contact, leaving other caches intact.

From the plugin repository run `python tools/sync_pwa.py --mobile-root PATH
--host-root PATH` and repeat with `--check` to verify source hashes/version and
host infrastructure. Increment the explicit `0.0.x` patch in both source and
plugin metadata for a changed release. Never automatically promote to 1.0.0.
Official releases require separately provisioned protected signing keys; unsigned
previews are visibly unverified. The PWA ZIP in the existing mobile release
workflow remains a source asset bundle, not another native client.

Run `node --test pwa/tests/service-worker.test.mjs`. Real host/plugin lifecycle
and browser acceptance lives in `unnamed_tracking_app/tools/check_pwa_lifecycle.py`.
