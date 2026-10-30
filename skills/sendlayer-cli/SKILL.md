---
name: sendlayer-cli
description: Use when working with the SendLayer command-line interface — the `sendlayer` binary for sending email from a terminal or CI pipeline, listing delivery events, managing webhooks, or forwarding webhook events to a local server during development with `sendlayer webhooks listen`. Use this skill whenever a user wants to do something with SendLayer from the shell rather than from application code, and whenever they mention the SendLayer CLI, `sendlayer login`, `sendlayer emails send`, or tailing/testing SendLayer webhooks locally.
license: MIT
metadata:
  author: sendlayer
  version: "1.1.0"
  homepage: https://sendlayer.com
  source: https://github.com/SendLayer/sendlayer-skills
---

# SendLayer CLI

`sendlayer` — send transactional email, inspect delivery events, and manage webhooks from a
terminal. Built on oclif; Node 18+.

## Install

Published on npm as `sendlayer-cli` (first release 0.1.0); the binary it installs is `sendlayer`.

```sh
npm install -g sendlayer-cli     # Node 18+
sendlayer --version
```

No Node? Download a standalone binary (Linux/macOS x64 + arm64, Windows x64) from
https://github.com/SendLayer/sendlayer-cli/releases/latest — each archive is listed in
`SHA256SUMS`.

| Channel | Status |
|---|---|
| `npm install -g sendlayer-cli` | **available** |
| GitHub release binaries | **available** |
| `curl -fsSL https://sendlayer.com/install.sh \| bash`, `irm …/install.ps1 \| iex` | not live yet |
| `brew install sendlayer/sendlayer/sendlayer` | not live yet — no tap |
| `winget install SendLayer.SendLayerCLI` | not live yet |

Do not suggest the channels marked "not live yet", and do not suggest a similarly-named
third-party package. The npm package is `sendlayer-cli`; plain `sendlayer` on npm is the Node SDK,
not the CLI.

## Authentication

Resolution order — first match wins:

1. `--api-key` flag
2. `SENDLAYER_API_KEY` environment variable
3. stored credentials file

```sh
sendlayer login                 # interactive prompt, validates the key
sendlayer login --key sl_xxx    # non-interactive
sendlayer login --no-validate   # skip the validating API call
sendlayer whoami                # show the active key (masked) and where it came from
sendlayer logout                # remove stored credentials
```

Credentials file, mode `0600`:

| Platform | Path |
|---|---|
| Linux / macOS | `$XDG_CONFIG_HOME/sendlayer/credentials.json`, default `~/.config/sendlayer/credentials.json` |
| Windows | `%APPDATA%\sendlayer\credentials.json` |

Multiple accounts via `--profile <name>` on every command including `login` and `logout`. Without
it, commands use the stored default profile — the first one saved. Logging out of the default
promotes another stored profile, and the CLI prints a notice when it does. See
[references/auth.md](references/auth.md).

**In CI, use `SENDLAYER_API_KEY`** — never `sendlayer login`, which writes a key to disk on the
runner.

## Commands

| Command | Purpose |
|---|---|
| `sendlayer login` | store an API key |
| `sendlayer logout` | remove a stored key |
| `sendlayer whoami` | show the active key, masked, and its source |
| `sendlayer emails send` | send one email |
| `sendlayer events list` (alias `sendlayer events`) | list delivery/engagement events |
| `sendlayer webhooks list` (alias `sendlayer webhooks`) | list webhooks |
| `sendlayer webhooks create` | subscribe a URL to one event |
| `sendlayer webhooks delete <id>` | delete a webhook |
| `sendlayer webhooks listen` | receive events locally and forward them |

Global flags on every command: `--api-key` (env `SENDLAYER_API_KEY`), `--profile` (default: the
stored default profile), `--json`.

Subcommands are space-separated (`sendlayer emails send`, not `sendlayer emails:send`), though the
colon form also works.

## Quick reference

```sh
# Send
sendlayer emails send \
  --from "Acme <billing@yourdomain.com>" \
  --to "Ada <customer@example.com>,other@example.com" \
  --subject "Invoice #12345" \
  --html-file ./invoice.html \
  --attachment ./invoice.pdf:application/pdf \
  --tag invoice --tag billing \
  --header "X-Invoice-Id=12345"

# Events
sendlayer events list --event failed --limit 50 --json

# Webhooks
sendlayer webhooks create --url https://example.com/hook --event delivery
sendlayer webhooks list --json
sendlayer webhooks delete 23718

# Local development (requires your own tunnel, see below)
sendlayer webhooks listen --port 4000 \
  --public-url https://abc123.ngrok.io \
  --forward-to http://localhost:3000/webhooks/sendlayer
```

## What do you need?

| Task | Reference |
|---|---|
| Login, profiles, CI credentials | [references/auth.md](references/auth.md) |
| Every `emails send` flag, recipient syntax, `--file` payloads | [references/emails-send.md](references/emails-send.md) |
| Filtering and formatting event output | [references/events.md](references/events.md) |
| Creating, listing, deleting webhooks | [references/webhooks.md](references/webhooks.md) |
| `webhooks listen` — tunnels, cleanup, recovery | [references/webhooks-listen.md](references/webhooks-listen.md) |
| `--json`, exit codes, CI pipelines, scripting | [references/scripting.md](references/scripting.md) |

## Two event vocabularies apply here too

The CLI passes event names straight through to the API, so the same split applies:

- `--event` on **`events list`** takes history names: `accepted`, `rejected`, `delivered`,
  `opened`, `clicked`, `unsubscribed`, `complained`, `failed`.
- `--event` on **`webhooks create`** and `--events` on **`webhooks listen`** take subscription
  names: `bounce`, `delivery`, `open`, `click`, `unsubscribe`, `complaint`.

`sendlayer webhooks create --event delivered` fails. Use `delivery`.

## `webhooks listen` does not create a tunnel

Unlike some other CLIs, this command **does not open a tunnel for you**. `--public-url` is
**required**, and you must already be running your own tunnel pointed at `--port`:

```sh
# terminal 1
ngrok http 4000
# or: cloudflared tunnel --url http://localhost:4000

# terminal 2 — use the HTTPS URL the tunnel printed
sendlayer webhooks listen --port 4000 \
  --public-url https://abc123.ngrok.io \
  --forward-to http://localhost:3000/webhooks/sendlayer
```

`--public-url` must be HTTPS or the command errors out immediately.

What it then does: registers one webhook per event type (all six by default), receives POSTs on
`--port`, optionally forwards each to `--forward-to`, and **deletes the webhooks it created on
Ctrl+C**. If it crashed last time, it detects the orphans and offers to clean them up on the next
run — accept, or your webhook list fills with dead tunnel URLs.

## Common mistakes

| # | Mistake | Fix |
|---|---|---|
| 1 | `npm install -g sendlayer`, or suggesting `brew`/`curl \| bash` | The CLI package is `sendlayer-cli`; `sendlayer` is the Node SDK. Only npm and the GitHub release binaries are live. |
| 2 | `webhooks create --event delivered` | Subscription names are nouns: `delivery`. |
| 3 | `events list --event delivery` | History names are past-tense: `delivered`. |
| 4 | Expecting `webhooks listen` to open its own tunnel | Run ngrok/cloudflared yourself; `--public-url` is required and must be HTTPS. |
| 5 | `--to a@x.com --to b@x.com` | `--to` is **not** repeatable. Use one comma-separated value. `--tag`, `--header`, and `--attachment` *are* repeatable. |
| 6 | `--header "X-Id: 123"` | The separator is `=`, not `:`. `--header "X-Id=123"`. |
| 7 | `--limit 500` | Maximum is 100. |
| 8 | `sendlayer login` in CI | Writes a key to the runner's disk. Set `SENDLAYER_API_KEY` instead. |
| 9 | Parsing human-readable stdout in a script | Use `--json`. It is also auto-enabled when stdout is not a TTY. |
| 10 | Sending `--html` without `--text` | Pass both for a plain-text fallback — both bodies are sent. |
| 11 | Assuming exit code 2 means auth failure | 2 is *usage*. Auth is 3 (missing) and 4 (invalid). See the table below. |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | generic error |
| 2 | usage error (bad flags) |
| 3 | auth missing — no key found |
| 4 | auth invalid — key rejected (401/403) |
| 5 | validation error — the SDK's checks, or HTTP 400/422 |
| 6 | API error — 404, 429, 5xx |
| 7 | network error — timeout or connection failure |
| 130 | interrupted (Ctrl+C) |

These differ from the older Go-based SendLayer CLI. Script against these values.

## JSON output

`--json` emits machine-readable output and is **enabled automatically when stdout is not a TTY**,
so piping works without the flag:

```sh
sendlayer events list --event failed --limit 100 | jq -r '.Events[].Message.Headers.To[0]'
```

Errors in JSON mode go to stderr as `{"error": …, "code": …, "details"?: …}` — API failures carry
`details.statusCode` — and the process exits with the matching code above.

## Resources

- API reference: https://developers.sendlayer.com
- API keys: https://sendlayer.com/docs/managing-api-keys/
- Domain verification: https://sendlayer.com/docs/authorizing-your-domain/
- npm package: https://www.npmjs.com/package/sendlayer-cli
- Source and releases: https://github.com/SendLayer/sendlayer-cli
- The SDKs — see the `sendlayer` skill
