# Webhooks

Real-time event notification. `POST /webhooks`, `GET /webhooks`, `DELETE /webhooks/{id}`.

**One webhook subscribes to exactly one event.** To listen for six event types you create six
webhooks, all pointing at the same URL. There is no multi-event subscription and **no update
endpoint** — to change a webhook you delete it and create a new one.

## Subscribable events — the webhook vocabulary

`bounce`, `delivery`, `open`, `click`, `unsubscribe`, `complaint`

| Event | Fires when |
|---|---|
| `delivery` | accepted by the recipient's mail server |
| `open` | recipient opened the message |
| `click` | recipient clicked a tracked link |
| `bounce` | delivery failed permanently |
| `unsubscribe` | recipient unsubscribed |
| `complaint` | recipient marked it as spam |

Anything else raises `SendLayerValidationError` client-side. In particular `delivered`, `opened`,
`clicked` are **event-history** names and are rejected here.

## Creating

```js
const { NewWebhookID } = await sendlayer.Webhooks.create({
  url: 'https://your-domain.com/webhooks/sendlayer',
  event: 'delivery',
});
```

The URL is validated against `^https?://…` client-side. Use HTTPS in production.

Per language:

```python
response = sendlayer.Webhooks.create(url="https://…", event="delivery")   # -> {"NewWebhookID": 972}
```

```php
$response = $sendlayer->Webhooks->create('https://…', 'delivery');
```

> The published PHP example in the SendLayer docs passes a single array
> (`$sendlayer->Webhooks->create($params)`). That is wrong for the current SDK — the signature is
> `create(string $url, string $event)` and an array argument raises a `TypeError`.

```ruby
webhook = sendlayer.webhooks.create(url: 'https://…', event: 'delivery')
```

```go
resp, err := sl.Webhooks.Create(&sendlayer.WebhookCreateRequest{
    WebhookURL: "https://…",   // note: WebhookURL, not URL
    Event:      "delivery",
})
```

Response is `{"NewWebhookID": 972}` — an **integer**.

## Listing

```js
const webhooks = await sendlayer.Webhooks.get();   // Node returns the array directly
```

Node unwraps the envelope and returns `Webhook[]`. Python, PHP, and Ruby return the raw object,
so you index `['Webhooks']`. Go returns `[]Webhook`.

Each record:

```json
{
  "WebhookID": "23718",
  "CreatedAt": "2025-04-11 09:43:07",
  "UpdatedAt": "2025-04-11 09:43:07",
  "Status": "Enabled",
  "WebhookURL": "https://your-domain.com/webhook",
  "Event": "open",
  "LastResponseCode": "200",
  "LastResponseBody": "",
  "LastResponseAt": "2025-04-11 10:15:30",
  "LastResponseTryCounter": "0"
}
```

`LastResponseCode` and `LastResponseTryCounter` are your debugging tools: a non-2xx code or a
climbing try counter means your endpoint is failing. SendLayer retries failed deliveries.

## Deleting — mind the type

```js
const webhooks = await sendlayer.Webhooks.get();
await sendlayer.Webhooks.delete(Number(webhooks[0].WebhookID));   // cast required
```

`WebhookID` comes back as a **string** (`"23718"`), but `delete()` requires an **integer** greater
than zero and validates that locally. Passing the string straight through raises
`SendLayerValidationError: WebhookID must be an integer`.

(The OpenAPI schema types `WebhookID` as a number while the API returns a quoted string. Trust the
string, and cast.)

## The payload vocabulary — a third set of names

The names inside the delivered payload are **not** the names you subscribed with. This is the
single most common webhook-handler bug.

| You subscribe with | `EventData.Event` in the payload |
|---|---|
| `delivery` | `delivered` |
| `open` | `opened` |
| `click` | `clicked` |
| `unsubscribe` | `unsubscribed` |
| `complaint` | `complained` |
| `bounce` | `bounced` (plus `EventType: "failed"`) |

So `if (body.EventData.Event === 'open')` **never matches**. Compare against `'opened'`.

## Payload shape

The event data is nested four levels deep, inside a wrapper describing the HTTP request itself:

```json
{
  "event": {
    "method": "POST",
    "path": "/",
    "query": {},
    "client_ip": "0.0.0.0",
    "url": "https://your-domain.com/webhook",
    "headers": { "host": "…", "content-type": "application/json" },
    "body": {
      "Signature": {
        "Timestamp": 1758100959,
        "Token": "c0a6c82bdde01faab7e857",
        "Signature": "3d1bf89405e4b71ed80bc240cd512aa7ed9db9dcfb17"
      },
      "EventData": {
        "Event": "opened",
        "Domain": "example.com",
        "MessageID": "4331c06-2d1d-4387-969e-697835",
        "To": "recipient@example.com",
        "IPAddress": "10.30.126.18"
      }
    }
  }
}
```

**The data you want is at `event.body.EventData`.** Note the outer `event` key is lowercase while
everything inside `body` is PascalCase.

A bounce carries more:

```json
"EventData": {
  "Event": "bounced",
  "EventType": "failed",
  "Domain": "example.com",
  "MessageID": "4331c06-2d1d-4387-969e-697835",
  "BouncedEmailAddress": {
    "EmailAddress": "recipient@example.com",
    "Status": "smtp;550 5.1.1 User Unknown",
    "DiagnosticCode": "5.1.1 (bad destination mailbox address)"
  },
  "Reason": "smtp;550 5.1.1 User Unknown",
  "Code": "5.1.1 (bad destination mailbox address)"
}
```

A bounce has **no top-level `To`** — the address is at
`EventData.BouncedEmailAddress.EmailAddress`. Handlers that read `EventData.To` for every event
type will get `undefined` on bounces.

`IPAddress` appears on open, click, and unsubscribe (tracking data); it is absent on delivery.

## Signature

Each payload includes a `Signature` object with `Timestamp`, `Token`, and `Signature` — the shape
used for HMAC verification.

**The verification algorithm is not published in the SendLayer API reference.** Do not invent one:
guessing at the concatenation order or hash function produces a check that either rejects
everything or verifies nothing. If you need authenticated webhooks, contact SendLayer support for
the signing scheme, and in the meantime defend the endpoint with measures you control:

- A long unguessable path segment (`/webhooks/sendlayer/8f2c…`).
- Treat the payload as untrusted input; look up `MessageID` in your own database rather than
  acting on payload contents directly.
- Make the handler idempotent — SendLayer retries, so the same event will arrive more than once.

## Handler skeleton (Express)

```js
import express from 'express';

const app = express();
app.use(express.json());

app.post('/webhooks/sendlayer', (req, res) => {
  // Acknowledge immediately — SendLayer retries on non-2xx or a slow response.
  res.sendStatus(200);

  const data = req.body?.event?.body?.EventData;
  if (!data) return;

  switch (data.Event) {
    case 'delivered':
      markDelivered(data.MessageID);
      break;
    case 'opened':
      recordOpen(data.MessageID, data.To, data.IPAddress);
      break;
    case 'clicked':
      recordClick(data.MessageID, data.To);
      break;
    case 'bounced':
      // address is nested, not data.To
      suppress(data.BouncedEmailAddress?.EmailAddress, data.Reason);
      break;
    case 'unsubscribed':
      unsubscribe(data.To);
      break;
    case 'complained':
      suppress(data.To, 'spam complaint');
      break;
  }
});
```

Respond 2xx **before** doing slow work. A handler that takes seconds will be retried while it is
still running.

## Local development

Do not build a polling loop over `Events.get`. The CLI has a purpose-built command:

```sh
sendlayer webhooks listen --forward-to http://localhost:3000/webhooks/sendlayer
```

It registers temporary webhooks, forwards events to your local server, and deletes them on
Ctrl+C. See the `sendlayer-cli` skill.

Failing that, `webhook.site` or an `ngrok` tunnel plus a manually created webhook works — just
remember to delete the webhook afterwards, since a dead URL accumulates retries.

## Cleaning up

Orphaned webhooks pointing at dead tunnels are the usual cause of "why is my webhook list full of
junk". List and prune:

```js
for (const w of await sendlayer.Webhooks.get()) {
  if (w.WebhookURL.includes('ngrok') || w.LastResponseCode !== '200') {
    await sendlayer.Webhooks.delete(Number(w.WebhookID));
  }
}
```
