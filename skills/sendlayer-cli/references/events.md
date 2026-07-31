# `sendlayer events list`

Alias: `sendlayer events`.

Queries delivery and engagement history. For real-time streaming use
[webhooks-listen.md](webhooks-listen.md) — do not loop this command.

## Flags

| Flag | Notes |
|---|---|
| `--event <name>` | One history event name. See vocabulary below. |
| `--start <date>` | ISO 8601. Anything `new Date()` parses. |
| `--end <date>` | Must be after `--start`; neither may be in the future. |
| `--message-id <id>` | The `MessageID` from a send. |
| `--limit <n>` | 1–100. Enforced by the flag parser. |

Plus globals `--api-key`, `--profile`, `--json`.

There is **no offset/pagination flag**, so you cannot page past the newest 100 records from the
CLI. Narrow the window with `--start`/`--end` instead, or use an SDK with `startFrom` (PHP, Python,
Ruby, Go).

## Event names — history vocabulary

`accepted`, `rejected`, `delivered`, `opened`, `clicked`, `unsubscribed`, `complained`, `failed`

Past-tense. These are **not** the webhook subscription names (`delivery`, `open`, `click`,
`bounce`, …). `--event delivery` fails validation.

There is no `bounce` history event — a bounce appears as `failed`, with the SMTP explanation in the
`Reason` field.

## Dates

Parsed with the JavaScript `Date` constructor, so ISO 8601 and most common forms work:

```sh
--start 2026-05-01
--start 2026-05-01T00:00:00Z
--start "2026-05-01 09:00:00"
```

An unparseable value errors with a hint. Two things to watch:

- A bare `2026-05-01` is interpreted as **UTC midnight**, not local midnight.
- Neither date may be in the future — validated by the SDK. `--end` set to end-of-day today will
  be rejected. Omit `--end` to mean "up to now".

## Examples

```sh
# Everything recent
sendlayer events list

# Failures in the last window, JSON
sendlayer events list --event failed --limit 100 --json

# One message's full history
sendlayer events list --message-id 8912e59e-ec88-bcd6-45dd-0012fe223ab6 --json

# A date range
sendlayer events list --start 2026-05-01 --end 2026-05-09 --event opened --limit 50
```

## Output

**Human mode** — a table with `loggedAt` (converted to an ISO string), `event`, `recipient`,
`messageId`, `subject`, preceded by the total record count. Empty results print
`No events found (total N).`

**JSON mode** — the raw API response, PascalCase:

```json
{
  "TotalRecords": 42,
  "Events": [
    {
      "Event": "failed",
      "LoggedAt": 1717171717,
      "LogLevel": "error",
      "Reason": "smtp;550 5.1.1 User Unknown",
      "Ip": "203.0.113.10",
      "GeoLocation": { "City": "", "Region": "", "Country": "" },
      "Message": {
        "Headers": {
          "MessageId": "8912e59e-ec88-bcd6-45dd-0012fe223ab6",
          "From": ["you@yourdomain.com"],
          "To": ["recipient@example.com"],
          "Subject": "Your receipt"
        }
      }
    }
  ]
}
```

`LoggedAt` in JSON mode is a **raw Unix timestamp in seconds** — only the human table converts it.
Note `Message.Headers.MessageId` has a lowercase `d`, unlike the `MessageID` a send returns.

`TotalRecords` is the total matching your filter, not the number returned — with `--limit 20` and
500 matches, you get 20 rows and `TotalRecords: 500`.

## Scripting

```sh
# Addresses that failed
sendlayer events list --event failed --limit 100 --json \
  | jq -r '.Events[].Message.Headers.To[0]'

# Reasons, grouped
sendlayer events list --event failed --limit 100 --json \
  | jq -r '.Events[].Reason' | sort | uniq -c | sort -rn

# Did this message get delivered?
sendlayer events list --message-id "$MSG" --json \
  | jq -e '[.Events[].Event] | index("delivered")' >/dev/null \
  && echo delivered || echo "not delivered"

# Alert if failures exceed a threshold
COUNT=$(sendlayer events list --event failed --limit 100 --json | jq '.TotalRecords')
if [ "$COUNT" -gt 10 ]; then
  echo "::warning::$COUNT delivery failures"
fi
```

Remember `--json` is implied when stdout is a pipe, so it can be omitted in the examples above —
include it anyway for clarity.

## Diagnosing a delivery problem

1. Confirm it was accepted at all:
   `sendlayer events list --message-id "$MSG" --json | jq -r '.Events[].Event'`
2. No events? The send never registered — check the send's own response and error code.
3. `rejected` or `failed`? Read `Reason` for the SMTP response.
4. `delivered` but the user says otherwise? It reached the mail server; the problem is spam
   filtering or client-side filing. See the `email-best-practices` skill.
