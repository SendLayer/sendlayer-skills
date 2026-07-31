# `sendlayer webhooks`

Manage webhook subscriptions. For local development, see
[webhooks-listen.md](webhooks-listen.md).

## Commands

```sh
sendlayer webhooks list                                    # alias: sendlayer webhooks
sendlayer webhooks create --url <url> --event <event>       # short: -u, -e
sendlayer webhooks delete <id>
```

Globals apply: `--api-key`, `--profile`, `--json`.

There is **no update command** — the API has no update endpoint. To change a webhook, delete it and
create a new one.

## One webhook = one event

Each webhook subscribes to exactly one event type. To receive all six, create six webhooks pointing
at the same URL:

```sh
for e in bounce delivery open click unsubscribe complaint; do
  sendlayer webhooks create --url https://example.com/hooks/sendlayer --event "$e" --json
done
```

## Event names — subscription vocabulary

`bounce`, `delivery`, `open`, `click`, `unsubscribe`, `complaint`

Nouns. **Not** the history names used by `events list`:

```sh
sendlayer webhooks create --url https://x.com/h --event delivered   # fails
sendlayer webhooks create --url https://x.com/h --event delivery    # correct
```

And note the payload your endpoint receives uses a *third* set of names — subscribe to `open` and
the payload says `opened`. See the `sendlayer` skill's `references/webhooks.md`.

## Creating

```sh
sendlayer webhooks create --url https://example.com/hooks/sendlayer --event delivery
sendlayer webhooks create -u https://example.com/hooks/sendlayer -e bounce --json
```

The URL is validated as `http(s)://…`. Use HTTPS in production.

JSON output:

```json
{ "NewWebhookID": 972 }
```

Capture the ID if you plan to clean up later:

```sh
ID=$(sendlayer webhooks create -u https://example.com/h -e delivery --json | jq -r '.NewWebhookID')
```

## Listing

```sh
sendlayer webhooks list
sendlayer webhooks --json
```

Human mode is a table of `id`, `event`, `status`, `url`.

JSON mode is the SDK's array of webhook records:

```json
[
  {
    "WebhookID": "23718",
    "WebhookURL": "https://example.com/hooks/sendlayer",
    "Event": "delivery",
    "Status": "Enabled",
    "CreatedAt": "2026-04-11 09:43:07",
    "LastResponseCode": "200",
    "LastResponseTryCounter": "0"
  }
]
```

`WebhookID` is a **string** even though it is numeric.

`LastResponseCode` and `LastResponseTryCounter` are your health check. A non-2xx code or a climbing
counter means your endpoint is failing and SendLayer is retrying.

## Deleting

The ID is a positional argument, not a flag:

```sh
sendlayer webhooks delete 23718        # correct
sendlayer webhooks delete --id 23718   # wrong — no --id flag
```

Deletion is permanent.

## Useful recipes

Delete every webhook (destructive — confirm first):

```sh
sendlayer webhooks list --json | jq -r '.[].WebhookID' | while read -r id; do
  sendlayer webhooks delete "$id" --json
done
```

Prune only the broken ones:

```sh
sendlayer webhooks list --json \
  | jq -r '.[] | select(.LastResponseCode != "200") | .WebhookID' \
  | while read -r id; do sendlayer webhooks delete "$id" --json; done
```

Prune leftover tunnels from past development sessions:

```sh
sendlayer webhooks list --json \
  | jq -r '.[] | select(.WebhookURL | test("ngrok|trycloudflare|loca.lt")) | .WebhookID' \
  | while read -r id; do sendlayer webhooks delete "$id" --json; done
```

Re-point all webhooks at a new URL (delete-and-recreate, since there is no update):

```sh
OLD=https://old.example.com/hooks
NEW=https://new.example.com/hooks

sendlayer webhooks list --json \
  | jq -r --arg old "$OLD" '.[] | select(.WebhookURL == $old) | "\(.WebhookID) \(.Event)"' \
  | while read -r id event; do
      sendlayer webhooks create --url "$NEW" --event "$event" --json
      sendlayer webhooks delete "$id" --json
    done
```

Create the new one before deleting the old, so you do not drop events in between.

## Health check for CI

```sh
BROKEN=$(sendlayer webhooks list --json | jq '[.[] | select(.LastResponseCode != "200")] | length')
if [ "$BROKEN" -gt 0 ]; then
  echo "::error::$BROKEN SendLayer webhook(s) are failing"
  exit 1
fi
```
