# Installation and client construction

Get an API key: https://sendlayer.com/docs/managing-api-keys/
Authorize your sending domain first, or every send fails with code 32:
https://sendlayer.com/docs/authorizing-your-domain/

Always read the key from the environment (`SENDLAYER_API_KEY`).

## Node.js — npm `sendlayer` ≥ 1.1.0

```sh
npm install sendlayer
```

Ships both CommonJS and ESM, with TypeScript types.

```js
import { SendLayer } from 'sendlayer';          // ESM
// const { SendLayer } = require('sendlayer');   // CommonJS

const sendlayer = new SendLayer(process.env.SENDLAYER_API_KEY);

// Optional config (1.1.0+):
const tuned = new SendLayer(process.env.SENDLAYER_API_KEY, {
  timeout: 10000,               // ms, default 30000
  attachmentURLTimeout: 30000,  // ms, for fetching remote attachments
  // axios: { ... }             // extra axios options; `headers` are merged with the SDK's own
});
```

`sendlayer.Emails`, `sendlayer.Webhooks`, `sendlayer.Events`.

Requests time out after **30 seconds** by default (1.0.x had no timeout at all).

Useful exported enums:

```js
import {
  ContentType,           // HTML | Text
  ContentDisposition,    // attachment | inline
  EventType,             // the 8 history event types
  WebhookEventOptions,   // the 6 subscribable webhook events
} from 'sendlayer';
```

Prefer these over string literals — they stop you mixing up the subscription and history event
vocabularies. Note neither enum covers the *payload* vocabulary you receive at a webhook endpoint
(`opened`, `bounced`, …); those are plain strings on the wire.

## Python — PyPI `sendlayer` ≥ 1.1.0 (Python 3.7+)

```sh
pip install sendlayer
```

```python
import os
from sendlayer import SendLayer

sendlayer = SendLayer(os.environ["SENDLAYER_API_KEY"])

# Optional config (1.1.0+):
tuned = SendLayer(os.environ["SENDLAYER_API_KEY"], {
    "timeout": 10,                  # seconds, default 30
    "attachmentURLTimeout": 30000,  # ms — camelCase even in Python
})
```

`sendlayer.Emails`, `sendlayer.Webhooks`, `sendlayer.Events` (capitalized).

All seven exception types are exported from the top-level package (1.1.0+):

```python
from sendlayer import SendLayerError, SendLayerValidationError, SendLayerRateLimitError
```

## PHP — Composer `sendlayer/sendlayer-php` ^1.1 (PHP 7.4+, Guzzle 7 or 8)

```sh
composer require sendlayer/sendlayer-php
```

```php
use SendLayer\SendLayer;

$sendlayer = new SendLayer(getenv('SENDLAYER_API_KEY'), [
    'timeout' => 30,                 // seconds, Guzzle request timeout
    'attachmentURLTimeout' => 30000, // ms, for fetching remote attachments
    // 'guzzle' => [...]             // raw Guzzle client options
]);
```

Public properties: `$sendlayer->Emails`, `->Webhooks`, `->Events`.

PHP 8 named arguments work and are much more readable than the 11-positional-parameter form —
see [php.md](php.md).

## Ruby — RubyGems `sendlayer` ≥ 1.1.0 (Ruby 2.7+)

```sh
gem install sendlayer
# or in a Gemfile:  gem 'sendlayer'
```

```ruby
require 'sendlayer'

sendlayer = SendLayer::SendLayer.new(ENV['SENDLAYER_API_KEY'], {
  timeout: 30,                   # seconds, default 30
  attachment_url_timeout: 30000, # ms
  headers: {}                    # extra request headers (1.1.0+); cannot override Authorization
})
```

Note the doubled name: the class is `SendLayer::SendLayer`.

Accessors are **lowercase**: `sendlayer.emails`, `sendlayer.webhooks`, `sendlayer.events`. This
is the one SDK that differs.

## Go — `github.com/sendlayer/sendlayer-go` v1.1.0 (Go 1.23+)

```sh
go get github.com/sendlayer/sendlayer-go@v1.1.0
```

Zero external dependencies.

```go
import (
    "os"
    "time"

    "github.com/sendlayer/sendlayer-go"
)

sl := sendlayer.New(
    os.Getenv("SENDLAYER_API_KEY"),
    sendlayer.WithTimeout(30*time.Second),  // default sendlayer.DefaultTimeout (30s)
    // sendlayer.WithBaseURL("..."),          // for testing against a mock
    // sendlayer.WithHeaders(map[string]string{...}),  // v1.1.0+, cannot override Authorization
    // sendlayer.WithHTTPClient(&http.Client{...}),    // v1.1.0+
)
```

Fields: `sl.Emails`, `sl.Webhooks`, `sl.Events`. All take pointer-to-request structs.

## No SDK for your language?

There is no official Java, .NET, Rust, PHP-framework, or Elixir client. Use the REST API —
[curl.md](curl.md) documents the exact JSON payloads. It is a plain JSON API with Bearer auth;
any HTTP client will do.

The `sendlayer-mailer` (Symfony Mailer transport), `sendlayer-laravel`, and `sendlayer-bundle`
packages exist in development but are **not yet published to Packagist**. Do not write code
against them.

## Verifying setup

The cheapest authenticated call is listing webhooks — it needs no verified domain and sends no
email:

```sh
curl -sS https://console.sendlayer.com/api/v1/webhooks \
  -H "Authorization: Bearer $SENDLAYER_API_KEY"
```

A `200` with a `Webhooks` array means the key works. A code 13 means it does not.
