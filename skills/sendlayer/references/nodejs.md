# Node.js

npm `sendlayer` ≥ 1.1.0. Node 18+. CommonJS and ESM, TypeScript types included. Uses `axios`.

```sh
npm install sendlayer
```

## Complete program

```js
import {
  SendLayer,
  EventType,
  WebhookEventOptions,
  SendLayerError,
  SendLayerRateLimitError,
  SendLayerValidationError,
} from 'sendlayer';

const sendlayer = new SendLayer(process.env.SENDLAYER_API_KEY);

// ---- Send ----------------------------------------------------------------
try {
  const { MessageID } = await sendlayer.Emails.send({
    from: { email: 'billing@yourdomain.com', name: 'Acme Billing' },
    to: [{ email: 'customer@example.com', name: 'Ada Lovelace' }],
    replyTo: 'support@yourdomain.com',
    subject: 'Invoice #12345',
    html: '<html><body><p>Your invoice is attached.</p></body></html>',
    text: 'Your invoice is attached.',   // plain-text fallback, sent alongside the HTML
    tags: ['invoice', 'billing'],
    headers: { 'X-Invoice-Id': '12345' },
    attachments: [
      { path: '/abs/path/invoice.pdf', type: 'application/pdf', filename: 'invoice.pdf' },
    ],
  });
  console.log('sent', MessageID);
} catch (err) {
  if (err instanceof SendLayerRateLimitError) {
    // back off and retry
  } else if (err instanceof SendLayerValidationError) {
    console.error('bad request:', err.message, err.codes);   // e.g. [19] invalid recipient
  } else if (err instanceof SendLayerError) {
    // every SDK error carries statusCode (undefined for local/network errors), errors and codes
    console.error('send failed:', err.statusCode, err.message);
  } else {
    throw err;
  }
}

// ---- Query events --------------------------------------------------------
const { TotalRecords, Events } = await sendlayer.Events.get({
  startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
  endDate: new Date(),
  event: EventType.FAILED,     // 'failed' — use the enum, not a literal
  retrieveCount: 100,
});

console.log(`${Events.length} of ${TotalRecords}`);
for (const e of Events) {
  console.log(e.Event, e.Message.Headers.To, e.Reason, new Date(e.LoggedAt * 1000));
}

// ---- Webhooks ------------------------------------------------------------
const { NewWebhookID } = await sendlayer.Webhooks.create({
  url: 'https://your-domain.com/webhooks/sendlayer',
  event: WebhookEventOptions.DELIVERY,   // 'delivery' — NOT 'delivered'
});

const webhooks = await sendlayer.Webhooks.get();   // returns Webhook[] directly
await sendlayer.Webhooks.delete(Number(webhooks[0].WebhookID));  // cast: it is a string
```

## API

| Call | Returns |
|---|---|
| `new SendLayer(apiKey, config?)` | client with `.Emails`, `.Webhooks`, `.Events`. `config`: `timeout` (ms, default 30000), `attachmentURLTimeout`, `axios` |
| `Emails.send(options)` | `Promise<{ MessageID: string }>` |
| `Events.get(options?)` | `Promise<{ TotalRecords: number, Events: Event[] }>` |
| `Webhooks.create({url, event})` | `Promise<{ NewWebhookID: number }>` |
| `Webhooks.get()` | `Promise<Webhook[]>` — envelope already unwrapped |
| `Webhooks.delete(id)` | `Promise<void>` — `id` must be an integer |

## Use the exported enums

```js
import { ContentType, ContentDisposition, EventType, WebhookEventOptions } from 'sendlayer';
```

`EventType` (history) and `WebhookEventOptions` (subscription) are different sets. Using the enums
makes it impossible to mix them up — the whole reason the mistake is so common is that both are
plain strings.

## Node-specific limitations

These are real gaps in the Node SDK, not in the API:

1. **`Events.get` ignores `fromEmail` and `toEmail`.** They exist in the `GetEventsOptions`
   TypeScript type — so your editor will autocomplete them — but they are never added to the query
   string. Filtering by address does not work. Filter client-side on
   `e.Message.Headers.To` instead.
2. **No `startFrom`.** Pagination is not possible from Node. PHP, Python, Ruby, and Go have it.

If you need any of these, call the REST endpoint directly with `fetch` — see [curl.md](curl.md).

## TypeScript

Types are bundled. The useful ones:

```ts
import type {
  EmailOptions, EmailRecipient, EmailAttachment, SendEmailResponse,
  GetEventsOptions, GetEventsResponse, Event, Message, MessageHeaders, GeoLocation,
  Webhook, CreateWebhookOptions, CreateWebhookResponse,
} from 'sendlayer';
```

`EmailOptions.to` is `string | EmailRecipient | EmailRecipient[]`, so a helper that always passes
an array is fine.

Note `Event.LoggedAt` is `number` (Unix seconds) — multiply by 1000 before `new Date()`.

## Express webhook handler

```js
import express from 'express';

const app = express();
app.use(express.json());

app.post('/webhooks/sendlayer', (req, res) => {
  res.sendStatus(200);   // acknowledge first; SendLayer retries slow endpoints

  const data = req.body?.event?.body?.EventData;   // note the nesting
  if (!data) return;

  // payload names are past-tense: delivered / opened / clicked / bounced / …
  if (data.Event === 'bounced') {
    suppress(data.BouncedEmailAddress?.EmailAddress, data.Reason);
  } else if (data.Event === 'opened') {
    recordOpen(data.MessageID, data.To);
  }
});

app.listen(3000);
```

## Testing without sending

Point tests at a mock rather than the real API. Either pass a mock server's URL through the axios
config (`new SendLayer(key, { axios: { baseURL: 'http://localhost:4010/' } })`, 1.1.0+), or stub
at the module boundary:

```js
import { vi } from 'vitest';

vi.mock('sendlayer', () => ({
  SendLayer: class {
    Emails = { send: vi.fn().mockResolvedValue({ MessageID: 'test-id' }) };
    Webhooks = { get: vi.fn().mockResolvedValue([]) };
    Events = { get: vi.fn().mockResolvedValue({ TotalRecords: 0, Events: [] }) };
  },
}));
```
