# Remote control

## Web workflow

1. At `http://127.0.0.1:34719/remote`, select the profiles and saved scenarios to
   grant. Select individual variables only if the remote account may override
   them; click **Lưu quyền điều khiển**.
2. Enter the HTTPS control origin and a device name; create a pairing code.
3. Sign in to the VPS web UI, submit that code under **Ghép thiết bị mới**.
4. Return to the local Remote page, review the exact VPS/account, then approve.
   No connection is created if the local owner declines or lets the code expire.
5. On the VPS, select the device. Its last heartbeat, CPU/RAM/uptime, per-profile
   extension connection, granted scenarios and remote command history appear.
   Choose profile/scenario, optionally enable a granted variable override and run.
6. Expand history to see step outcomes and the stopping step. Stop targets that
   specific execution. Revoke in the VPS or disconnect locally to remove access.

The main dashboard and extension options link to the local Remote page. Existing
scenario editing, content manager and upload/download behavior are unchanged.
The web UI polls while visible and preserves unfinished permission/variable edits.
An offline device cannot accept new runs. The device owner must keep the local
agent, Chrome and the relevant extension running for browser actions.

## VPS deployment

Provision a Linux VPS with Node 24 LTS, a DNS name pointing to it, and nginx with
a valid TLS certificate. The remote service needs no Chrome, Playwright, MongoDB
connection or video tools. Do not copy the local `.env`, Chrome profile or data.

### Container option (Linux host networking)

From a checkout on the VPS:

```sh
cp .env.control.example .env.control
# Edit CONTROL_PUBLIC_URL to the exact https:// origin (no path).
chmod 600 .env.control
docker compose -f deploy/control/compose.yaml build
# Create a user without putting the password in argv or shell history:
read -r -s -p 'New account password: ' CONTROL_PASSWORD; printf '\n'
printf '%s' "$CONTROL_PASSWORD" | docker compose -f deploy/control/compose.yaml run --rm -T control node remote-control.js user you@example.com
unset CONTROL_PASSWORD
docker compose -f deploy/control/compose.yaml up -d
```

The compose file uses a persistent named volume for SQLite, an unprivileged user,
a read-only application filesystem and host networking on a Linux VPS. It binds
only `127.0.0.1:34800`. Use one service replica. Install/adapt
`deploy/control/nginx.conf.example`, replace its domain/certificate paths and test
the nginx configuration before reloading. Expose HTTPS 443 and the HTTP redirect
80; keep 34800 and local 34719 private. The public URL must match the Host nginx
passes. nginx replaces forwarded-IP headers; enable `CONTROL_TRUST_PROXY=1` only
with that trusted loopback proxy. `/health` is a minimal liveness check and never
returns account/device information. There is no WebSocket configuration to add.

### Native service option

Copy `remote-control.js`, `src/remote/` and `control-web/` to
`/opt/local-agent-control`. Create the dedicated `local-agent-control` system user;
put the example environment in `/etc/local-agent-control.env`, readable by that
user only. Install/adapt `deploy/control/local-agent-control.service`; its Node
path assumes `/usr/bin/node`. Create `/var/lib/local-agent-control` owned by that
user, then run the account bootstrap command as the same user with
`CONTROL_ENV_FILE=/etc/local-agent-control.env` and
`CONTROL_DATABASE=/var/lib/local-agent-control/control.sqlite`. Install nginx TLS
as above and enable/start the systemd unit. Use either native service or compose,
never both on the same port/database. These are deployment templates; no real VPS
was provisioned or modified during implementation.

## Local machine 24/24

Use Node 22.13+ (Node 24 LTS recommended), keep the existing local `.env`, install
dependencies with `npm ci`, and run:

```powershell
node local-agent.js --daemon
```

The usual `node local-agent.js` remains the interactive entry; CLI commands also
keep working. Daemon mode ignores stdin EOF. SIGINT/SIGTERM stops workflows and
closes the agent/Mongo connection; interrupted hard exits are recovered through
the existing activity store and remote journal. Disconnected transports reconnect
automatically with bounded backoff. The local server remains loopback-only.

For automatic startup in the current Windows user's interactive session:

```powershell
powershell -NoProfile -File scripts/install-remote-startup.ps1
# After closing an existing foreground agent, start now if desired:
Start-ScheduledTask -TaskName LocalAgentRemote
# Removal:
powershell -NoProfile -File scripts/install-remote-startup.ps1 -Remove
```

Registration runs at the next sign-in, with a hidden window and limited user
privileges. It does not install a Session 0 Windows service or start/replace your
existing Chrome session. The wrapper forwards the Node exit code so Task
Scheduler can retry a failed launch three times. Logs are separated by launch in
`data/daemon-logs/`; manage retention according to available disk space. Keep
Chrome/extension active in that same session and configure Windows power settings
to avoid sleep while the machine is expected to be online. Locking the desktop
keeps the session; signing out closes interactive applications. No startup task
was actually registered during development.

## Maintenance and limits

Back up SQLite while the service is stopped, including its containing directory
(WAL/SHM files may exist), or use a SQLite-aware live backup tool. Protect backups
as credentials. Back up local `remote.json`, `remote-journal.json` and activity
history together. On Windows restrict the data directory ACL to the agent user
and administrators. On Linux newly created control directories/files use private
permissions. Rotate a device credential by revoking and pairing again.

UI history is capped to 200 commands per device; durable queue/journal retention
is currently manual. Do not delete an active command/journal record. Step previews
send the first 100 steps with bounded labels; full history is local. A policy has
up to 100 profiles/200 scenarios and variable payloads are bounded. Command start
deadlines are five minutes, execution timeout one hour. These defaults can be
changed in the modules after reviewing their replay/expiry behavior.

Check device `lastSeen` plus its extension status; an online agent alone does not
prove Chrome can interact with a website. Agent CPU/RAM metrics refer to the Node
process, not the entire machine. TLS termination, certificate renewal, DNS,
firewall and real-site locators must be configured/verified in your environment.

Local verification: `npm test` and `node --check` run on fixture accounts/devices,
HTTP mocks and isolated browser profiles. Real VPS deployment, Windows task
installation, account/device pairing and Facebook automation were deliberately
not performed for this delivery.

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
editing, shell commands, profile launching nor the standalone `uploadPath` override
are exposed through remote commands. A granted variable can affect any field that
the saved scenario references; grant path/URL variables with that scope in mind.
Saving a local scenario changes its next execution; the
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
stopped. The agent does not automatically export download paths, source URLs,
variable defaults or full error messages. Explicit remote variable overrides are
stored with the command; detailed content/upload history remains in the local/Atlas
content manager. Remote authority does not grant Atlas credentials or direct file
access. Back up both the local journal and control SQLite database; deleting or
restoring old journals can remove replay protection.
