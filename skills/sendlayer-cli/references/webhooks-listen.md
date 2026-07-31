# `sendlayer webhooks listen`

Receive SendLayer webhook events on your machine during development, and optionally forward each to
a local server. This replaces polling `events list` in a loop, which you should never do.

```sh
sendlayer webhooks listen --port 4000 \
  --public-url https://abc123.ngrok.io \
  --forward-to http://localhost:3000/webhooks/sendlayer
```

## It does not create the tunnel

This is the single most important thing to know. `--public-url` is **required** and the command
does not open a tunnel — you run one yourself, and tell the CLI the public URL it produced.

```sh
# terminal 1 — start a tunnel to your chosen --port
ngrok http 4000
# or
cloudflared tunnel --url http://localhost:4000

# terminal 2 — pass the HTTPS URL the tunnel printed
sendlayer webhooks listen --port 4000 \
  --public-url https://abc123.ngrok.io \
  --forward-to http://localhost:3000/webhooks/sendlayer
```

`--public-url` must start with `https://` — an `http://` URL is rejected immediately. SendLayer has
to be able to reach it from the public internet, which is exactly why the tunnel is needed.

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--port <n>` | `4000` | Local port the listener binds. Point your tunnel here. |
| `--public-url <url>` | — | **Required.** HTTPS URL of your tunnel. |
| `--forward-to <url>` | — | Optional. Each event is re-POSTed here. |
| `--events <list>` | all six | Comma-separated subset. |
| `--skip-cleanup-prompt` | off | Do not ask about orphans from a crashed run. |

Plus globals `--api-key`, `--profile`, `--json`.

## What it actually does

1. Checks for orphaned webhooks left by a previous crashed run and offers to delete them.
2. Registers **one webhook per event type** at `--public-url` — six API calls by default.
3. Records the created IDs to a state file so a crash is recoverable.
4. Starts an HTTP server on `--port` that accepts `POST` (anything else gets `405`).
5. Logs each event, and forwards it to `--forward-to` if set.
6. On Ctrl+C, **deletes the webhooks it created** and clears the state file.

Because it registers real webhooks against your account, running it consumes your webhook list
while active — and leaves junk behind if it dies without cleanup.

## `--events`

```sh
sendlayer webhooks listen --port 4000 --public-url https://abc.ngrok.io --events bounce,click
```

Uses the **subscription** vocabulary: `bounce`, `delivery`, `open`, `click`, `unsubscribe`,
`complaint`. An unknown name aborts before anything is registered.

Narrowing to the events you care about means fewer webhooks created and fewer to clean up. Useful
when debugging one specific flow.

## Forwarding

With `--forward-to`, each received event is re-POSTed to your local app with:

- the original body, unmodified
- the original `content-type`
- `x-sendlayer-event: <event type>`
- `x-sendlayer-cli-forwarded: 1`

Use `x-sendlayer-cli-forwarded` to distinguish tunnel-forwarded traffic from real production
webhooks in shared handler code.

A failed forward (your app is down, or throws) is logged as a warning and **does not stop the
listener** — the event is not retried locally. Restart your app and trigger a new event.

## The console label reads `unknown`

The listener labels each line by looking for a **top-level** `Event` key in the payload. Real
SendLayer payloads nest it at `event.body.EventData.Event`, so the label falls back to `unknown`:

```
2026-05-09T10:15:30.000Z [unknown] {"event":{"method":"POST",...
```

This is a display bug in the CLI, not a delivery problem — **the forwarded body is complete and
correct.** Do not chase it. To see the real event type, read the truncated JSON on the line, or log
it from your own handler at `req.body.event.body.EventData.Event`.

Note the console preview truncates the payload to 200 characters, so it is a liveness indicator, not
a debugging tool. Log from your handler for real inspection.

## Recovery after a crash

State lives in `listen-state.json` next to your credentials
(`~/.config/sendlayer/listen-state.json` on Linux/macOS, `%APPDATA%\sendlayer\` on Windows), keyed
by a hash of the API key, mode `0600`.

If the process was killed (`SIGKILL`, a crash, a closed laptop), the webhooks survive. The next run
notices:

```
Found 6 stale webhook(s) from a previous session.
? Delete them now? › (Y/n)
```

**Accept.** Declining leaves webhooks pointed at a dead tunnel URL, which SendLayer keeps retrying —
and your `webhooks list` fills with junk.

`--skip-cleanup-prompt` suppresses the question, which is right for scripted runs but means orphans
accumulate silently. Prefer letting it prompt interactively.

Manual cleanup if the state file was lost:

```sh
sendlayer webhooks list --json \
  | jq -r '.[] | select(.WebhookURL | test("ngrok|trycloudflare|loca.lt")) | .WebhookID' \
  | while read -r id; do sendlayer webhooks delete "$id" --json; done
```

## Full local development loop

```sh
# 1. tunnel
ngrok http 4000

# 2. your app
npm run dev                      # listening on :3000

# 3. listener
sendlayer webhooks listen --port 4000 \
  --public-url https://abc123.ngrok.io \
  --forward-to http://localhost:3000/webhooks/sendlayer

# 4. trigger something — in a fourth terminal
sendlayer emails send \
  --from you@yourdomain.com \
  --to test@example.com \
  --subject "webhook test" \
  --text "trigger"
```

You should see a `delivery` event within a few seconds. Opens and clicks require you to actually
open the message and click a tracked link.

To test a bounce deliberately, send to an address you know is invalid at a real domain. Do **not**
hammer this — repeated hard bounces damage your sending reputation. One or two is enough.

## Not for production

This is a development tool. It creates and destroys real webhooks and depends on a tunnel process
staying alive. For production, create webhooks once against a stable HTTPS endpoint
([webhooks.md](webhooks.md)) and handle them in your application.

## Alternatives when the CLI is unavailable

Since the CLI is not published yet, the equivalent by hand:

1. Start a tunnel: `ngrok http 3000`.
2. Create the webhooks against the tunnel URL with the SDK or curl.
3. Handle POSTs in your app at `req.body.event.body.EventData`.
4. **Delete the webhooks when you finish** — this is the step the CLI automates, and the one people
   forget.
