# Error codes

Failures come back as an `Errors` array, not a bare object:

```json
{ "Errors": [ { "Code": 13, "Message": "Invalid SenderAPIKey" } ] }
```

There can be more than one entry. Read all of them — the first is not always the useful one.

## Complete code table

| Code | Message | Cause and fix |
|---|---|---|
| 1 | Missing SenderAPIKey | No key sent. Check `SENDLAYER_API_KEY` is set and non-empty. |
| 2 | Missing FromName | Sender name required but absent. Pass `{email, name}` for `from`. |
| 3 | Missing FromEmail | No sender address. |
| 4 | Missing ReplyToName | Reply-to given without a name. Pass `{email, name}`. |
| 5 | Missing ReplyToEmail | Reply-to object without an `email`. |
| 6 | Missing ToName | Recipient name required but absent. |
| 7 | Missing ToEmail | Recipient object without an `email`. |
| 8 | Missing Subject | Subject is required. |
| 9 | Missing ContentType | The SDK sets this for you; seeing it means a hand-rolled REST call. |
| 10 | Missing HTMLContent | `ContentType: HTML` with no `HTMLContent`. |
| 11 | Missing PlainContent | `ContentType: Text` with no `PlainContent`. |
| 12 | Invalid user | The account behind the key is not usable. Contact support. |
| 13 | Invalid sender API key | Wrong, revoked, or truncated key. Regenerate it. |
| 14 | Recipient email is suppressed | The address previously bounced or complained. **Do not retry** — remove it from your list. |
| 15 | Invalid TemplateID | Template does not exist. |
| 16 | Invalid TargetListID | List does not exist. |
| 17 | Email quota reached | Plan limit hit. Retrying will not help; upgrade or wait for the reset. |
| 18 | Recipient name or email address is missing | Malformed recipient object. |
| 19 | Recipient email address is invalid | Validate addresses before sending. |
| 20 | No recipient set, **or** too many recipients | Empty `To`, or over your plan's per-message limit. |
| 21 | CC name or email address is missing | Malformed CC entry. |
| 22 | CC email address is invalid | |
| 23 | Invalid from email address format | Malformed sender address. |
| 24 | BCC email addresses must be set as an array | Pass an array. |
| 25 | BCC name or email address is missing | |
| 26 | BCC email address is invalid | |
| 27 | Too many BCC email addresses | Over the per-message BCC limit. |
| 28 | Reply-To email addresses must be set as an array | Pass an array. |
| 29 | Reply-To name or email address is missing | |
| 30 | Reply-To email address is invalid | |
| 31 | Too many Reply-To email addresses | |
| 32 | Domain is not activated | The sender domain is not verified. See https://sendlayer.com/docs/authorizing-your-domain/ |
| 404 | Resource not found | Wrong path, or a webhook ID that does not exist. |
| 422 | Invalid request parameters | Malformed payload. |
| 429 | Too many requests | Rate limited. Back off exponentially. |

Codes 1–11 and 18–31 generally mean a malformed request that the SDK would have caught — if you
see them while using an SDK, you are probably calling REST directly somewhere.

## Which are worth retrying

| Retry | Codes |
|---|---|
| **Yes, with backoff** | 429, any 5xx |
| **No — permanent for this request** | 13, 14, 15, 16, 17, 19, 23, 32, and every "missing"/"invalid" code |
| **Careful** | network timeouts. There is no idempotency key, so the message may already have been sent. |

Retrying code 14 (suppressed) or 32 (unverified domain) in a loop will never succeed and can look
like abuse. Fail fast and surface the problem.

## Mapping to exceptions

The SDKs (1.1.0+) translate these into typed errors, the same way in all five:

| Class | Triggered by |
|---|---|
| `SendLayerValidationError` | client-side validation, HTTP 400 or 422 |
| `SendLayerAuthenticationError` | HTTP 401 (codes 1, 12, 13) |
| `SendLayerNotFoundError` | HTTP 404 |
| `SendLayerRateLimitError` | HTTP 429 |
| `SendLayerInternalServerError` | HTTP 500 only |
| `SendLayerAPIError` | any other status, including 502, 503 and 504 |
| `SendLayerError` | base class; raised directly for timeouts and connection failures |

PHP appends `Exception` instead of `Error` (`SendLayerValidationException`) and its base class is
`SendLayer\Exceptions\SendLayerException`. Go returns these as pointer types; use `errors.As`
or `sendlayer.AsError`.

Every error carries the API's own message (multiple `Errors` messages joined with `; `) and the
raw `Errors` entries. Node, Python, Ruby and Go also expose the HTTP status and a `codes` helper
on every type; PHP exposes `$errors` on every exception and `$statusCode` on
`SendLayerAPIException`. A local validation error has no status; any **other** error with an
empty status (`undefined` / `None` / `nil` / `0`) means no response arrived — a timeout or
connection failure.

## Handling pattern

```js
import { SendLayerError, SendLayerRateLimitError, SendLayerValidationError } from 'sendlayer';

const PERMANENT = [13, 14, 15, 16, 17, 19, 23, 32];

async function send(sendlayer, params) {
  try {
    return await sendlayer.Emails.send(params);
  } catch (err) {
    if (!(err instanceof SendLayerError)) throw err; // programmer error — do not swallow

    if (err instanceof SendLayerValidationError && err.statusCode === undefined) {
      return { failed: true, retryable: false };       // caught locally, nothing was sent
    }
    if (err.statusCode === undefined) {
      // timeout or connection failure: the message may already have been sent
      return { failed: true, retryable: 'check-events-first' };
    }
    if (err instanceof SendLayerRateLimitError || err.statusCode >= 500) {
      return { failed: true, retryable: true };          // back off, then retry
    }
    if (err.codes.some((code) => PERMANENT.includes(code))) {
      console.error('SendLayer rejected the send:', err.message, err.codes);
    }
    return { failed: true, retryable: false };
  }
}
```

Do not catch broadly and retry. Decide based on the code: suppression and quota are terminal,
rate limits are not.
