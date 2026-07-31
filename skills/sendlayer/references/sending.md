# Sending email

`POST /email`. One call per message. There is no batch endpoint and no idempotency key.

## Parameters

Names below are the Node.js / Ruby / Go form. Python uses `sender` instead of `from` and
`reply_to` instead of `replyTo`; Ruby uses `reply_to`; Go uses `ReplyTo`.

| Parameter | Required | Type | Notes |
|---|---|---|---|
| `from` | yes | string or `{email, name}` | Must be on a domain verified in SendLayer. |
| `to` | yes | string, object, or array | See recipient formats below. |
| `subject` | yes | string | |
| `text` | one of `text`/`html` | string | Plain-text body. **Dropped if `html` is also set.** |
| `html` | one of `text`/`html` | string | HTML body. Wins over `text`. |
| `cc` | no | string, object, or array | |
| `bcc` | no | string, object, or array | |
| `replyTo` | no | string, object, or array | |
| `tags` | no | array of strings | For filtering in the dashboard. Must be strings. |
| `headers` | no | object of string → string | Custom `X-` headers. |
| `attachments` | no | array | See [attachments.md](attachments.md). |

Omitting both `text` and `html` raises a validation error locally, before any request.

## Recipient formats

All recipient fields accept three shapes, and the SDK normalizes them:

```js
to: 'a@example.com'
to: { email: 'a@example.com', name: 'Ada Lovelace' }
to: [
  { email: 'a@example.com', name: 'Ada' },
  'b@example.com',
]
```

On the wire these become arrays of `{email, name}` objects. `From` is always normalized to a
single object, not an array.

Addresses are validated client-side; an invalid one raises a validation error naming the field
(`recipient`, `cc`, `bcc`, `replyTo`) before the request is sent.

Per-message recipient limits depend on your plan — exceeding them returns code 20 or 27. See
https://sendlayer.com/docs/getting-started-with-the-sendlayer-api/

## Content type is derived, not chosen

You do not set `ContentType` yourself. Every SDK computes it:

```
ContentType = html ? "HTML" : "Text"
body field  = html ? "HTMLContent" : "PlainContent"
body value  = html || text
```

**Consequence: passing both `html` and `text` sends only the HTML.** The plain-text argument is
accepted, ignored, and never transmitted. There is no way to send a true multipart
`text/plain` + `text/html` message through `Emails.send()`.

If a user asks for "HTML with a plain-text fallback", tell them the SDK cannot do it rather than
writing code that appears to. A workable compromise is HTML that degrades well, or sending the
plain-text version to clients you know cannot render HTML.

## Tags

```js
tags: ['receipt', 'billing']
```

Must be an array of strings — a non-string element raises a validation error. Tags are for
grouping and filtering in the SendLayer dashboard; they are not transmitted as email headers and
recipients never see them.

## Custom headers

```js
headers: {
  'X-Order-Id': '12345',
  'X-Mailer': 'my-app/1.2.3',
}
```

Passed through as-is. Use `X-`-prefixed names. Do not attempt to set `From`, `To`, `Subject`,
`Reply-To`, or other envelope headers this way — use the dedicated parameters.

## Response

```json
{ "MessageID": "8912e59e-ec88-bcd6-45dd-0012fe223ab6" }
```

Store `MessageID` if you want to correlate later webhook events or `Events.get` records with this
send. It is the only handle you get.

## Retries and duplicate sends

SendLayer has **no idempotency key**. If a send times out you cannot safely retry — the message
may already have gone out. Practical approach:

1. Persist your own request ID before calling `send()`.
2. On timeout, do not retry immediately. Query `Events.get` filtered by a recent time window and
   look for the message.
3. Only retry if you are confident nothing was sent.

Automatic blind retry logic around `Emails.send()` will eventually double-send.

## Full field example

```js
const response = await sendlayer.Emails.send({
  from: { email: 'billing@yourdomain.com', name: 'Acme Billing' },
  to: [{ email: 'customer@example.com', name: 'Ada Lovelace' }],
  cc: 'records@yourdomain.com',
  bcc: 'audit@yourdomain.com',
  replyTo: { email: 'support@yourdomain.com', name: 'Acme Support' },
  subject: 'Invoice #12345',
  html: '<html><body><p>Your invoice is attached.</p></body></html>',
  tags: ['invoice', 'billing'],
  headers: { 'X-Invoice-Id': '12345' },
  attachments: [{ path: './invoice.pdf', type: 'application/pdf' }],
});
```
