# PWA assets

Copy these files into the tracking frontend's public root, link `manifest.webmanifest`, and register `service-worker.js`. The worker deliberately excludes every `/api/` request so credentials and private API responses are never cached.
