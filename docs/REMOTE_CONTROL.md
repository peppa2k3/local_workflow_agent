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

## Commands and recovery

The device exchanges heartbeat/receipts/one queued command every three seconds.
Failures back off up to approximately one minute. Online means a heartbeat within
45 seconds; extension connectivity is shown separately for each allowed profile.
The VPS leases one process instance per device for 35 seconds. After a crash a new
process may wait for that lease to expire before reconnecting.

Local approval grants explicit saved scenario names, profile directories and
optional variable names. Variable overrides default to none. Neither scenario
editing, shell commands, profile launching nor file path overrides are exposed
through remote commands. Saving a local scenario changes its next execution; the
grant trusts that saved name. Remove its grant before editing sensitive scenarios.

Runs get a client-generated UUID/idempotency key, a durable VPS queue record and a
five-minute start deadline. Requests are accepted only while the device is online.
The local journal is persisted before starting a workflow. The execution UUID is
the command UUID, separate from the extension protocol UUID. Redelivery cannot
start it twice. After an ambiguous crash, report `unknown` and inspect local
history before submitting a new run. The system never promises exactly-once
effects at external websites; their acknowledgements can be lost.

Remote Stop targets a remote execution UUID, never the currently active local
profile indiscriminately. Stop can cancel an undelivered run. Timeout, failure,
cancelled, interrupted and succeeded states are retained. A network outage leaves
an already running job active; receipts resume after reconnect. Disconnect/revoke
stops remote-owned runs when the local process observes it; local-only jobs remain
independent. Removing a profile/scenario grant also stops its remote-owned runs.

VPS history contains step states, labels, start/end times and the step where a run
stopped. It excludes download paths, source URLs, variable defaults and full error
messages; detailed content/upload history remains in the existing local/Atlas
content manager. Remote authority does not grant Atlas credentials or direct file
access. Back up both the local journal and control SQLite database; deleting or
restoring old journals can remove replay protection.
