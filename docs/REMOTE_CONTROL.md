# Remote control

Remote control is a separate VPS service (`node remote-control.js`). The local
agent keeps its existing loopback port 34719 and establishes outbound HTTPS
connections. Do not expose 34719 through a router or reverse proxy.

The VPS stores accounts, sessions, pairing requests and device grants in a separate
SQLite database. It never needs the local `.env` or MongoDB Atlas credential.
The VPS runtime is Node 24 LTS; SQLite is not loaded by the normal local entry.

An operator provisions accounts using `node remote-control.js user email@example.com`
with the password supplied on stdin (12–256 characters). No public registration.
Passwords use salted scrypt; sessions expire after 12 hours. Production uses an
HTTPS public origin, HttpOnly Secure SameSite cookies, Origin checks and CSRF.

The local dashboard generates a short-lived pairing code. A signed-in account
claims it on the VPS, then the local owner reviews that account and approves.
Only both approvals create a device grant. Pairing expires after ten minutes.
Account/device tokens are hashed on the VPS; the raw device token is stored only
in the ignored local data directory. Protect that directory as a credential store.
Pair approval is idempotent if the network drops its response. Either side can
revoke; a revoked grant requires a new pairing. Local pairing endpoints always
require the local dashboard session, even when the legacy API token is disabled.

Implementation references: [Node SQLite](https://nodejs.org/api/sqlite.html),
[Node scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback),
[OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
