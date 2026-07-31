---
name: sendlayer
description: Use when working with the SendLayer email API — sending transactional email (HTML or plain text, CC/BCC, reply-to, tags, custom headers, attachments), retrieving delivery events, or creating and managing webhooks, in Node.js, Python, PHP, Ruby, Go, or over raw REST. Always use this skill when the user mentions SendLayer, even for simple tasks like "send an email with SendLayer" — it contains critical gotchas (three separate event vocabularies, silently-dropped plain-text bodies, deeply-nested webhook payloads, PascalCase response keys, the verified-sender-domain requirement) that prevent common production failures.
license: MIT
metadata:
  author: sendlayer
  version: "1.0.0"
  homepage: https://sendlayer.com
  source: https://github.com/SendLayer/sendlayer-skills
  documentation: https://developers.sendlayer.com
---

# SendLayer

Transactional email API. Base URL `https://console.sendlayer.com/api/v1/`, Bearer token auth.
Three resources: **Emails**, **Events**, **Webhooks**.

Set `SENDLAYER_API_KEY` in the environment. Never hardcode a key.

## Quick Send — Node.js

```js
import { SendLayer } from 'sendlayer';

const sendlayer = new SendLayer(process.env.SENDLAYER_API_KEY);

const response = await sendlayer.Emails.send({
  from: 'you@yourdomain.com',   // must be on a domain verified in SendLayer
  to: 'recipient@example.com',  // string | {email, name} | array of either
  subject: 'Your receipt',
  html: '<p>Thanks for your order.</p>',
});

console.log(response.MessageID);
```

**Key gotcha:** the response key is `MessageID` — PascalCase with a capital `ID`. Every SendLayer
response field is PascalCase (`MessageID`, `TotalRecords`, `Events`, `Webhooks`, `NewWebhookID`).

## Quick Send — Python

```python
import os
from sendlayer import SendLayer

sendlayer = SendLayer(os.environ["SENDLAYER_API_KEY"])

response = sendlayer.Emails.send(
    sender="you@yourdomain.com",   # NOT from= — `from` is a Python keyword
    to="recipient@example.com",
    subject="Your receipt",
    html="<p>Thanks for your order.</p>",
)

print(response["MessageID"])
```

**Key gotcha:** Python's first parameter is `sender`. Every other SDK calls it `from`. Passing
`from=` is a `TypeError`; the SDK cannot accept it because `from` is reserved in Python.

## Three different event vocabularies — read this first

SendLayer uses **three non-interchangeable sets of event names** depending on where you are.
Mixing them up is by far the most common SendLayer bug.

| Where | Used by | Accepted / emitted values |
|---|---|---|
| **1. Querying history** | `Events.get({ event })` | `accepted`, `rejected`, `delivered`, `opened`, `clicked`, `unsubscribed`, `complained`, `failed` |
| **2. Subscribing to a webhook** | `Webhooks.create({ event })` | `bounce`, `delivery`, `open`, `click`, `unsubscribe`, `complaint` |
| **3. Reading a delivered webhook payload** | `EventData.Event` | `delivered`, `opened`, `clicked`, `unsubscribed`, `complained`, `bounced` |

Two consequences:

**Subscribing** — vocabulary 2 is the only thing `Webhooks.create` accepts. Both vocabularies are
validated client-side in every SDK, so mistakes throw locally rather than reaching the API:

- `Webhooks.create({ url, event: 'delivered' })` → `SendLayerValidationError`. Use `delivery`.
- `Events.get({ event: 'delivery' })` → `SendLayerValidationError`. Use `delivered`.

**Handling** — you subscribe with `open` but the payload says `opened`. Nothing validates this;
your handler just silently never fires:

| Subscribe with | Payload contains |
|---|---|
| `delivery` | `delivered` |
| `open` | `opened` |
| `click` | `clicked` |
| `unsubscribe` | `unsubscribed` |
| `complaint` | `complained` |
| `bounce` | `bounced` (plus `EventType: "failed"`) |

So `if (data.Event === 'open')` is always false. Compare against `'opened'`.

Also note there is **no** `bounce` history type — a bounce appears as `failed` — and **no**
`accepted`, `rejected`, or `failed` webhook you can subscribe to.

## What do you need?

| Task | Reference |
|---|---|
| Install and construct the client, configure timeouts | [references/installation.md](references/installation.md) |
| Every field of a send request, recipient formats, tags, headers | [references/sending.md](references/sending.md) |
| File attachments, remote URLs, inline images | [references/attachments.md](references/attachments.md) |
| Query delivery history, filters, response shape | [references/events.md](references/events.md) |
| Create, list, delete webhooks; receive and handle payloads | [references/webhooks.md](references/webhooks.md) |
| Complete runnable Node.js program | [references/nodejs.md](references/nodejs.md) |
| Complete runnable Python program | [references/python.md](references/python.md) |
| Complete runnable PHP program | [references/php.md](references/php.md) |
| Complete runnable Ruby program | [references/ruby.md](references/ruby.md) |
| Complete runnable Go program | [references/go.md](references/go.md) |
| Raw REST / curl, for languages with no SDK | [references/curl.md](references/curl.md) |
| What error code 14 or 32 means and how to fix it | [references/error-codes.md](references/error-codes.md) |
| Use the SendLayer MCP server instead of writing code | [references/mcp.md](references/mcp.md) |

Tailing events during local development is the CLI's job — see the `sendlayer-cli` skill for
`sendlayer webhooks listen`. Do not build a polling loop over `Events.get`.

## Detect the project's language

| Marker file | SDK | Reference |
|---|---|---|
| `package.json` | npm `sendlayer` | [references/nodejs.md](references/nodejs.md) |
| `pyproject.toml`, `requirements.txt`, `setup.py` | PyPI `sendlayer` | [references/python.md](references/python.md) |
| `composer.json` | Composer `sendlayer/sendlayer-php` | [references/php.md](references/php.md) |
| `Gemfile`, `*.gemspec` | RubyGems `sendlayer` | [references/ruby.md](references/ruby.md) |
| `go.mod` | `github.com/sendlayer/sendlayer-go` | [references/go.md](references/go.md) |
| none of the above | REST | [references/curl.md](references/curl.md) |

If the project already imports SendLayer somewhere, match the existing import style and client
construction rather than introducing a second pattern.

## SDK versions

| Language | Package | Minimum | Runtime |
|---|---|---|---|
| Node.js | npm `sendlayer` | 1.0.3 | Node 18+ |
| Python | PyPI `sendlayer` | 1.0.0 | Python 3.7+ |
| PHP | Composer `sendlayer/sendlayer-php` | ^1.0 | PHP 7.4+ |
| Ruby | RubyGems `sendlayer` | 1.0.0 | Ruby 2.7+ |
| Go | `github.com/sendlayer/sendlayer-go` | v1.0.0 | Go 1.23+ |

The Go SDK has zero external dependencies. Node uses `axios`, Python uses `requests`, PHP uses
Guzzle, Ruby uses the standard library.

There is no official Java, .NET, Rust, or Elixir SDK. For those, use REST directly —
[references/curl.md](references/curl.md) has the exact payload shape.

## Common mistakes

| # | Mistake | Fix |
|---|---|---|
| 1 | `Webhooks.create({ event: 'delivered' })` | Webhooks subscribe with `delivery`. See the vocabularies table above. |
| 2 | `Events.get({ event: 'delivery' })` | Event history uses `delivered`. |
| 3 | Handler checking `EventData.Event === 'open'` | The payload says `opened`. Your handler silently never fires. |
| 4 | Reading the payload at `req.body.EventData` | It is nested: `req.body.event.body.EventData`. |
| 5 | Reading `EventData.To` on a bounce | Bounces have no top-level `To` — it is at `EventData.BouncedEmailAddress.EmailAddress`. |
| 6 | Passing both `text` and `html` and expecting a multipart email | **All five SDKs send only one body.** If `html` is set, `text` is silently discarded. See "Plain text is dropped" below. |
| 7 | `from=` in Python | Python uses `sender=`. |
| 8 | `sendlayer.Emails` in Ruby | Ruby exposes lowercase `emails`, `webhooks`, `events`. |
| 9 | `response.messageId` / `response['message_id']` | It is `MessageID`. All response keys are PascalCase. |
| 10 | Feeding `WebhookID` from a list straight into `delete()` | `Webhooks.get()` returns `WebhookID` as a **string**; `delete()` requires an **integer** > 0. Cast it. |
| 11 | Sending from an unverified domain | The `From` address must be on a domain authorized in SendLayer, or you get error code 32, "Domain is not activated". |
| 12 | `retrieveCount: 500` | Must be an integer between 1 and 100 inclusive. |
| 13 | ISO 8601 strings for event date filters | Pass native date objects; the SDK converts to Unix **seconds**. `endDate` must be after `startDate`, and neither may be in the future — both validated client-side. |
| 14 | Using `fromEmail` / `toEmail` in the Node `Events.get` options | Declared in the TypeScript type but **never sent**. Filtering by address does not work in the Node SDK. `startFrom` is also missing in Node (PHP, Python, Ruby, and Go all have it). |
| 15 | Base64-encoding an attachment by hand | Set `path` to a local file path **or** an `http(s)` URL — the SDK reads/fetches and encodes it. |
| 16 | Setting `attachmentURLTimeout` in Node | Not reachable: `new SendLayer(key)` does not forward a config object to the internal client. Other SDKs accept it. |
| 17 | `https://sendlayer.com/api/v1/...` | The API host is `console.sendlayer.com`. |
| 18 | Retrying a failed send blindly | SendLayer has **no idempotency key**. A retry after a timeout can deliver twice. Track `MessageID` yourself before retrying. |
| 19 | Expecting one webhook to cover several events | One webhook = one event. Create six pointing at the same URL. There is no update endpoint. |
| 20 | Writing an HMAC check for the `Signature` object | The signing algorithm is **not published**. Do not invent one — see [references/webhooks.md](references/webhooks.md). |

### Plain text is dropped when you send HTML

Every SDK builds the payload as *either* `HTMLContent` *or* `PlainContent`, never both:

```
ContentType: html ? 'HTML' : 'Text'
[html ? 'HTMLContent' : 'PlainContent']: html || text
```

So `send({ subject, html, text })` transmits only the HTML. The `text` argument is accepted and
then thrown away. This matters because a missing plain-text alternative hurts deliverability and
spam scoring.

If you need a genuine multipart message, you cannot get it from `Emails.send()` — send the
plain-text alternative as a separate concern, or raise it with SendLayer support. Do not tell the
user their multipart email "should work"; it does not.

## Error handling

Every SDK exposes the same hierarchy. Catch the base class to catch everything:

| Class | Raised when |
|---|---|
| `SendLayerError` | base class for everything below |
| `SendLayerValidationError` | client-side validation failed, or HTTP 422 |
| `SendLayerAuthenticationError` | bad or missing API key (codes 1, 12, 13) |
| `SendLayerNotFoundError` | HTTP 404 |
| `SendLayerRateLimitError` | HTTP 429 |
| `SendLayerInternalServerError` | HTTP 5xx |
| `SendLayerAPIError` | any other API-reported failure |

Naming per language: PHP uses `SendLayer\Exceptions\SendLayerException` as the base and the
`…Exception` suffix throughout; Python and Ruby use `SendLayerError`; Go returns
`*SendLayerError` values rather than panicking.

The wire format is an `Errors` array:

```json
{ "Errors": [ { "Code": 13, "Message": "Invalid SenderAPIKey" } ] }
```

Codes 1–32 are SendLayer-specific; 404, 422, and 429 are HTTP-aligned. The ones you will
actually hit:

| Code | Meaning | What to do |
|---|---|---|
| 13 | Invalid sender API key | Check `SENDLAYER_API_KEY`. |
| 14 | Recipient email is suppressed | The address bounced or complained before. Do not retry; remove it from your list. |
| 17 | Email quota reached | Plan limit hit. Retrying will not help. |
| 19 | Recipient email address is invalid | Validate before sending. |
| 20 | No recipient set, or too many recipients | Check the `To` array and your plan's per-message recipient limit. |
| 32 | Domain is not activated | Verify the sender domain in the SendLayer dashboard. |
| 429 | Too many requests | Back off exponentially and retry. |

Full table with every code: [references/error-codes.md](references/error-codes.md).

## Resources

- API reference: https://developers.sendlayer.com
- Machine-readable docs index: https://developers.sendlayer.com/llms.txt
- Managing API keys: https://sendlayer.com/docs/managing-api-keys/
- Authorizing your sending domain: https://sendlayer.com/docs/authorizing-your-domain/
- Hosted MCP server: https://mcp.sendlayer.com — see [references/mcp.md](references/mcp.md)
