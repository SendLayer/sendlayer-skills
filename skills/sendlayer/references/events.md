# Events — delivery history

`GET /events`. Queries what already happened. For real-time notification use webhooks
([webhooks.md](webhooks.md)); for local development use `sendlayer webhooks listen` from the CLI
skill. Do not poll this endpoint in a loop.

## Event types — the history vocabulary

`accepted`, `rejected`, `delivered`, `opened`, `clicked`, `unsubscribed`, `complained`, `failed`

Past-tense verbs. These are **not** the webhook event names — webhooks use `bounce`, `delivery`,
`open`, `click`, `unsubscribe`, `complaint`. Passing a webhook name here raises
`SendLayerValidationError` locally.

There is no `bounce` event type. A bounced message appears as `failed`, with the reason in the
`Reason` field.

## Filters

| Option | Type | Notes |
|---|---|---|
| `startDate` | date | Converted to Unix **seconds**. |
| `endDate` | date | Must be after `startDate`; neither may be in the future. |
| `event` | string | One of the eight above. |
| `messageId` | string | The `MessageID` returned by a send. |
| `startFrom` | integer | Offset for pagination. **Not supported by the Node SDK.** |
| `retrieveCount` | integer | 1–100. |

Names per language: Python and Ruby use `start_date`, `end_date`, `message_id`, `start_from`,
`retrieve_count`. Go uses `StartDate`, `EndDate`, `Event`, `MessageID`, `StartFrom`,
`RetrieveCount` (pointers for the optional numerics).

### Client-side validation you will hit

- `endDate <= startDate` → validation error.
- Either date in the future → validation error. This bites when you build an "up to now" range
  with a clock slightly ahead of the server, or when you pass an end-of-day timestamp for today.
  Use the current instant, not end-of-day.
- `retrieveCount` outside 1–100 → validation error in Node, PHP, Python, and Ruby. The **Go SDK
  only checks `> 0`**, so a value above 100 reaches the API and is clamped or rejected there.

### Node SDK gaps

`GetEventsOptions` declares `fromEmail` and `toEmail`, but `Events.get()` never puts them in the
query string — **filtering by address does not work in Node.** `startFrom` is also absent from
the Node options type. Both work in PHP, Python, Ruby, and Go.

If you need address filtering in Node, filter client-side on
`event.Message.Headers.To` / `.From`, or call the REST endpoint directly.

## Response shape

```json
{
  "TotalRecords": 42,
  "Events": [
    {
      "Event": "delivered",
      "LoggedAt": 1717171717,
      "LogLevel": "info",
      "Reason": "",
      "Ip": "203.0.113.10",
      "GeoLocation": { "City": "Austin", "Region": "TX", "Country": "US" },
      "Message": {
        "Headers": {
          "MessageId": "8912e59e-ec88-bcd6-45dd-0012fe223ab6",
          "From": ["you@yourdomain.com"],
          "To": ["recipient@example.com"],
          "Cc": [],
          "Bcc": [],
          "ReplyTo": [],
          "Subject": "Your receipt"
        }
      }
    }
  ]
}
```

Notes:

- `TotalRecords` is the total matching the filter, not the length of `Events`. Use it with
  `startFrom` to paginate.
- `LoggedAt` is a **Unix timestamp in seconds**. Multiply by 1000 for a JavaScript `Date`. The Go
  SDK unmarshals it into a `UnixTime` wrapping `time.Time`, so you get a real time value there.
- Inside `Message.Headers` the key is `MessageId` — lowercase `d`. The *send* response key is
  `MessageID` — uppercase `D`. They refer to the same value. This inconsistency is real; do not
  "correct" either one.
- `Reason` is populated for `failed` and `rejected` events and is where the bounce explanation
  lives.
- `GeoLocation` and `Ip` come from open/click tracking and are absent or empty for other events.

## Examples

**Node.js** — last 24 hours of failures:

```js
const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

const { TotalRecords, Events } = await sendlayer.Events.get({
  startDate: since,
  endDate: new Date(),
  event: 'failed',
  retrieveCount: 100,
});

for (const e of Events) {
  console.log(e.Message.Headers.To, e.Reason, new Date(e.LoggedAt * 1000));
}
console.log(`${Events.length} of ${TotalRecords} total`);
```

**Python** — everything that happened to one message:

```python
result = sendlayer.Events.get(message_id="8912e59e-ec88-bcd6-45dd-0012fe223ab6")
for e in result["Events"]:
    print(e["Event"], e["LoggedAt"])
```

**Ruby**:

```ruby
result = sendlayer.events.get(event: 'opened', retrieve_count: 50)
puts result['TotalRecords']
```

**Go**:

```go
start := time.Now().Add(-24 * time.Hour)
end := time.Now()
count := 100

resp, err := sl.Events.Get(&sendlayer.GetEventsRequest{
    StartDate:     &start,
    EndDate:       &end,
    Event:         "failed",
    RetrieveCount: &count,
})
```

`sl.Events.Get(nil)` is valid and returns unfiltered recent events.

## Paginating

Node cannot paginate (no `startFrom`). Elsewhere:

```python
offset, page_size = 0, 100
while True:
    page = sendlayer.Events.get(start_from=offset, retrieve_count=page_size)
    events = page["Events"]
    if not events:
        break
    handle(events)
    offset += len(events)
    if offset >= page["TotalRecords"]:
        break
```
