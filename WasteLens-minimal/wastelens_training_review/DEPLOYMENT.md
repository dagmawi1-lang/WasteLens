# WasteLens account and sync deployment notes

V21 provides an optional self-hosted account and sync API. It is not deployed by this repository and should not be exposed publicly until the production checklist below is completed.

## Local development

Terminal 1:

```bash
npm install
npm run server
```

Terminal 2:

```bash
npm run dev
```

The Vite development server proxies `/api` requests to `http://localhost:3001`.

## Account behavior

- Username: 3–24 letters, numbers, underscores, or hyphens.
- Password: 12–128 characters.
- Passwords are stored as salted scrypt hashes, never plaintext.
- Sessions use random opaque tokens in HttpOnly, SameSite=Strict cookies. Tokens are hashed in server memory.
- Sessions last up to seven days and are invalidated when the server restarts.
- Authentication attempts are rate-limited per client IP.
- There is no email collection or password-reset workflow. If a user forgets the password, the account cannot be recovered through this starter.

## Sync behavior

Sync is explicit. Users choose either **Load cloud copy to this device** or **Upload this device to cloud**. Revision checks reject stale writes so a device cannot silently overwrite a newer cloud revision. The API syncs only an allowlist of metadata/settings. Dataset image files and data-URI photos are rejected and are never uploaded by the client.

## Production checklist before public hosting

1. Serve the frontend and API through HTTPS on the same origin. Set `NODE_ENV=production` so session cookies use `Secure`.
2. Use a persistent, private server data volume for `server/data/`; back it up and restrict filesystem permissions.
3. Add a managed database, account deletion, password recovery, session revocation, audit logging, and stronger distributed rate limiting before real multi-user use.
4. Add monitoring, request-size limits at the reverse proxy, automated backups, and a tested restore procedure.
5. Review privacy notices, retention policy, age-appropriate account requirements, and applicable laws before accepting public users.
6. Do not store payment data, government identifiers, precise location, or other sensitive information in the sync payload.

This is a development-grade starting point, not a security audit or production hosting certification.

## V22 container deployment

Build and start the app with Docker Compose:

```bash
docker compose up --build
```

The container builds the Vite frontend, installs only the Express runtime dependency in the final image, serves the built frontend from the Node server, and persists server data in the `wastelens-data` named volume. The health check uses `/api/health`.

The PWA service worker caches the app shell and static assets only. It intentionally bypasses API requests, authentication, sync, and non-GET requests. First install requires network access. The general MobileNet model may also require a network download, so offline UI availability should not be described as guaranteed offline AI classification.

The server sets a Content Security Policy, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and a request ID. It also applies an API request limit and keeps atomic JSON writes with a previous-file backup. These are baseline protections, not a substitute for a security audit, managed database, monitoring, backups, TLS termination, and production incident response.
