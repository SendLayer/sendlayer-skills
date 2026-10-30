# Python

PyPI `sendlayer` ≥ 1.1.0. Python 3.7+. Uses `requests`. Synchronous — there is no async client.

```sh
pip install sendlayer
```

## The one thing to remember

**The first parameter is `sender`, not `from`.** `from` is a reserved keyword in Python, so the
SDK cannot use it. Every other SendLayer SDK calls this parameter `from`.

```python
sendlayer.Emails.send(sender="you@yourdomain.com", ...)   # correct
sendlayer.Emails.send(from="you@yourdomain.com", ...)     # SyntaxError
```

## Complete program

```python
import os
from datetime import datetime, timedelta

from sendlayer import (
    SendLayer,
    SendLayerError,
    SendLayerValidationError,
    SendLayerRateLimitError,
)

sendlayer = SendLayer(os.environ["SENDLAYER_API_KEY"])

# ---- Send ---------------------------------------------------------------
try:
    response = sendlayer.Emails.send(
        sender={"email": "billing@yourdomain.com", "name": "Acme Billing"},
        to=[{"email": "customer@example.com", "name": "Ada Lovelace"}],
        reply_to="support@yourdomain.com",
        subject="Invoice #12345",
        html="<html><body><p>Your invoice is attached.</p></body></html>",
        text="Your invoice is attached.",   # plain-text fallback, sent alongside the HTML
        tags=["invoice", "billing"],
        headers={"X-Invoice-Id": "12345"},
        attachments=[{"path": "/abs/path/invoice.pdf", "type": "application/pdf"}],
    )
    print("sent", response["MessageID"])
except SendLayerRateLimitError:
    print("rate limited — back off and retry")
except SendLayerValidationError as exc:
    print("bad request:", exc.message, exc.codes)   # do not retry
except SendLayerError as exc:
    # every exception carries status_code (None for local/network errors), response, errors, codes
    print("send failed:", exc.status_code, exc.message)

# ---- Query events -------------------------------------------------------
result = sendlayer.Events.get(
    start_date=datetime.now() - timedelta(days=1),
    end_date=datetime.now(),
    event="failed",              # history vocabulary
    retrieve_count=100,
)

print(f"{len(result['Events'])} of {result['TotalRecords']}")
for e in result["Events"]:
    print(e["Event"], e["Message"]["Headers"]["To"], e["Reason"])

# ---- Webhooks -----------------------------------------------------------
created = sendlayer.Webhooks.create(
    url="https://your-domain.com/webhooks/sendlayer",
    event="delivery",            # subscription vocabulary — NOT "delivered"
)
print(created["NewWebhookID"])

webhooks = sendlayer.Webhooks.get()["Webhooks"]    # note: envelope not unwrapped
sendlayer.Webhooks.delete(int(webhooks[0]["WebhookID"]))   # cast: it is a string
```

## API

| Call | Returns |
|---|---|
| `SendLayer(api_key, config=None)` | client with `.Emails`, `.Webhooks`, `.Events` (capitalized) |
| `Emails.send(sender, to, subject, text=None, html=None, cc=None, bcc=None, reply_to=None, attachments=None, headers=None, tags=None)` | `dict` with `MessageID` |
| `Events.get(start_date=None, end_date=None, event=None, message_id=None, start_from=None, retrieve_count=None)` | `dict` with `TotalRecords`, `Events` |
| `Webhooks.create(url, event)` | `dict` with `NewWebhookID` |
| `Webhooks.get()` | `dict` with `Webhooks` list |
| `Webhooks.delete(webhook_id)` | the decoded response (`{}` when the body is empty) |

Parameter names are snake_case (`reply_to`, `start_date`, `message_id`, `retrieve_count`) but
**response keys are PascalCase** (`MessageID`, `TotalRecords`, `Events`, `Webhooks`,
`NewWebhookID`). Do not expect snake_case coming back.

## Exceptions

All seven are exported from the top-level package (1.1.0+; on 1.0.0 only `SendLayerError` and
`SendLayerAPIError` were, and the rest needed `sendlayer.exceptions`):

```python
from sendlayer import (
    SendLayerError,                  # base
    SendLayerAPIError,
    SendLayerAuthenticationError,
    SendLayerValidationError,
    SendLayerNotFoundError,
    SendLayerRateLimitError,
    SendLayerInternalServerError,
)
```

Every exception carries `message`, `status_code`, `response`, `errors` (the raw `Errors`
entries) and a `codes` property listing SendLayer's numeric codes — so
`if 14 in exc.codes:` works whichever subclass you caught. `status_code` is `None` for local
validation, timeouts and connection errors. `SendLayerAPIError`'s `str()` is prefixed
`API Error <status>: `; `exc.message` is not.

HTTP mapping: 400/422 → `SendLayerValidationError`, 401 → `SendLayerAuthenticationError`,
404 → `SendLayerNotFoundError`, 429 → `SendLayerRateLimitError`, 500 →
`SendLayerInternalServerError`, any other status (including 502/503/504) → `SendLayerAPIError`.
A timeout or connection failure raises plain `SendLayerError` — `requests` exceptions never
escape the SDK.

## Client configuration

```python
sendlayer = SendLayer(api_key, {
    "timeout": 30,                   # seconds, default 30
    "attachmentURLTimeout": 30000,   # ms
    "requests": {"headers": {}},     # extra session options
})
```

Requests time out after **30 seconds** by default (1.0.0 had no effective timeout). Note the key
is camelCase `attachmentURLTimeout` even in Python — it matches the wire name, not PEP 8.

## Pagination

Python has `start_from`, so unlike Node you can page through history:

```python
offset, page_size = 0, 100
while True:
    page = sendlayer.Events.get(start_from=offset, retrieve_count=page_size)
    events = page["Events"]
    if not events:
        break
    for e in events:
        handle(e)
    offset += len(events)
    if offset >= page["TotalRecords"]:
        break
```

## Flask webhook handler

```python
from flask import Flask, request

app = Flask(__name__)

@app.post("/webhooks/sendlayer")
def sendlayer_webhook():
    payload = request.get_json(silent=True) or {}
    data = payload.get("event", {}).get("body", {}).get("EventData")   # note the nesting
    if not data:
        return "", 200

    # payload names are past-tense
    if data["Event"] == "bounced":
        addr = data.get("BouncedEmailAddress", {}).get("EmailAddress")
        suppress(addr, data.get("Reason"))
    elif data["Event"] == "opened":
        record_open(data["MessageID"], data.get("To"))

    return "", 200      # acknowledge fast; SendLayer retries slow endpoints
```

Do the slow work in a background task — returning late causes a retry and a duplicate event.

## Django settings pattern

```python
# settings.py
SENDLAYER_API_KEY = os.environ["SENDLAYER_API_KEY"]

# mail.py
from django.conf import settings
from sendlayer import SendLayer

_client = None

def client() -> SendLayer:
    global _client
    if _client is None:
        _client = SendLayer(settings.SENDLAYER_API_KEY)
    return _client
```

There is no SendLayer Django email backend. If you want `django.core.mail` to work, write a thin
`BaseEmailBackend` subclass that calls `Emails.send()` — and remember that `html_message` and the
plain body cannot both be transmitted, so pick one.
