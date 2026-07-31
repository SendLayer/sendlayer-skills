# Scripting and CI

## JSON output

`--json` emits `JSON.stringify(payload, null, 2)` — the raw API response, PascalCase keys.

**It is enabled automatically when stdout is not a TTY.** Piping or redirecting gives you JSON
without the flag:

```sh
sendlayer events list | jq '.TotalRecords'      # JSON, because stdout is a pipe
sendlayer events list                            # human table, because stdout is a terminal
```

Pass `--json` explicitly anyway — it documents intent and protects against a future change in TTY
detection.

Errors in JSON mode go to **stderr** as a structured object:

```json
{
  "error": "Invalid --header value (expected Key=Value): X-Id: 1",
  "code": "VALIDATION",
  "details": null
}
```

So `2>/dev/null` discards your only diagnostic. Capture both streams when scripting.

## Exit codes

| Code | Constant | Meaning |
|---|---|---|
| 0 | `OK` | success |
| 1 | `GENERIC` | unclassified error |
| 2 | `USAGE` | bad flags or arguments |
| 3 | `AUTH_MISSING` | no API key found in flag, env, or credentials |
| 4 | `AUTH_INVALID` | key rejected — HTTP 401 or 403 |
| 5 | `VALIDATION` | client-side validation failed |
| 6 | `API` | the API rejected the request (including 429 rate limits) |
| 7 | `NETWORK` | connection failure |
| 130 | `INTERRUPTED` | Ctrl+C |

Two traps:

- **2 is *usage*, not auth.** Auth failures are 3 and 4. Scripts written against the older Go CLI's
  codes will misclassify.
- **Rate limiting is 6, not a distinct code.** To detect a 429 specifically, inspect the JSON error
  payload rather than the exit code.

Branching on them:

```sh
sendlayer emails send --from "$FROM" --to "$TO" --subject "$SUBJ" --text "$BODY" --json
case $? in
  0) echo "sent" ;;
  3|4) echo "fix SENDLAYER_API_KEY" >&2; exit 1 ;;
  5) echo "bad input, not retrying" >&2; exit 1 ;;
  6) echo "API error — may be rate limiting, retry with backoff" >&2 ;;
  7) echo "network problem, retry" >&2 ;;
  *) echo "unexpected failure" >&2; exit 1 ;;
esac
```

## Retrying safely

**There is no idempotency key.** A send that times out may already have been delivered, so a blind
retry can double-send. Only retry on codes that prove nothing was sent — and 7 (network) is *not*
one of them, because the request may have arrived.

```sh
# Safe: retry rate limiting with backoff
for attempt in 1 2 3; do
  OUT=$(sendlayer emails send --file ./payload.json --json 2>&1) && break
  STATUS=$?
  [ "$STATUS" -eq 6 ] || { echo "$OUT" >&2; exit "$STATUS"; }
  sleep $((attempt * 5))
done
```

Never wrap a send in an unconditional retry loop.

## GitHub Actions

```yaml
name: Notify on release
on:
  release:
    types: [published]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      # The CLI is not published yet — until it is, use the SDK or curl here.
      - name: Send notification
        env:
          SENDLAYER_API_KEY: ${{ secrets.SENDLAYER_API_KEY }}
        run: |
          curl -sS --fail-with-body \
            --url https://console.sendlayer.com/api/v1/email \
            --header "Authorization: Bearer $SENDLAYER_API_KEY" \
            --header 'Content-Type: application/json' \
            --data @- <<JSON
          {
            "From": {"name": "CI", "email": "ci@yourdomain.com"},
            "To": [{"name": "Team", "email": "team@yourdomain.com"}],
            "Subject": "Released ${{ github.event.release.tag_name }}",
            "ContentType": "HTML",
            "HTMLContent": "<p>${{ github.event.release.html_url }}</p>"
          }
          JSON
```

Once the CLI ships, the send step becomes:

```yaml
      - run: |
          sendlayer emails send \
            --from "CI <ci@yourdomain.com>" \
            --to team@yourdomain.com \
            --subject "Released ${{ github.event.release.tag_name }}" \
            --html "<p>${{ github.event.release.html_url }}</p>" \
            --json
        env:
          SENDLAYER_API_KEY: ${{ secrets.SENDLAYER_API_KEY }}
```

Never `sendlayer login` in CI — it writes a key to the runner's disk.

## Monitoring script

Nightly delivery-failure check:

```sh
#!/usr/bin/env bash
set -euo pipefail

: "${SENDLAYER_API_KEY:?SENDLAYER_API_KEY is required}"

RESULT=$(sendlayer events list --event failed --limit 100 --json)
COUNT=$(jq '.TotalRecords' <<<"$RESULT")

if [ "$COUNT" -eq 0 ]; then
  echo "no delivery failures"
  exit 0
fi

echo "$COUNT delivery failures:"
jq -r '.Events[] | "\(.Message.Headers.To[0])\t\(.Reason)"' <<<"$RESULT"

# Group reasons to spot a systemic problem
jq -r '.Events[].Reason' <<<"$RESULT" | sort | uniq -c | sort -rn

[ "$COUNT" -lt 10 ] || exit 1     # fail the job past a threshold
```

`set -euo pipefail` matters: without `-o pipefail` a failing `sendlayer` in a pipe is invisible.

## Webhook health check

```sh
BROKEN=$(sendlayer webhooks list --json \
  | jq '[.[] | select(.LastResponseCode != "200")] | length')

if [ "$BROKEN" -gt 0 ]; then
  echo "::error::$BROKEN SendLayer webhook(s) failing"
  sendlayer webhooks list --json \
    | jq -r '.[] | select(.LastResponseCode != "200") | "\(.Event)\t\(.WebhookURL)\t\(.LastResponseCode)"'
  exit 1
fi
```

## Things the CLI cannot do

Reach for an SDK or curl when you need:

- **Pagination** — no offset flag, so you cannot read past the newest 100 events. PHP, Python, Ruby,
  and Go have `startFrom`.
- **Batch sending** — no such endpoint anywhere; it is one call per message. Loop with a delay.
- **A true multipart body** — passing HTML and text transmits only the HTML.
- **Updating a webhook** — delete and recreate.
- **Filtering events by address** — not exposed by the CLI (and broken in the Node SDK).
