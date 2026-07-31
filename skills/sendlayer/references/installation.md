# Installation and client construction

Get an API key: https://sendlayer.com/docs/managing-api-keys/
Authorize your sending domain first, or every send fails with code 32:
https://sendlayer.com/docs/authorizing-your-domain/

Always read the key from the environment (`SENDLAYER_API_KEY`).

## Node.js — npm `sendlayer` ≥ 1.0.3

```sh
npm install sendlayer
```

Ships both CommonJS and ESM, with TypeScript types.

```js
import { SendLayer } from 'sendlayer';          // ESM
// const { SendLayer } = require('sendlayer');   // CommonJS

const sendlayer = new SendLayer(process.env.SENDLAYER_API_KEY);
```

`sendlayer.Emails`, `sendlayer.Webhooks`, `sendlayer.Events`.

**The Node constructor takes only an API key.** The internal client supports `timeout` and
`attachmentURLTimeout`, but `new SendLayer(key)` does not forward a config object, so those
options are unreachable from the public API. If you need a custom timeout, wrap the call in your
own `AbortController` / `Promise.race`, or use the REST API directly.

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

## Python — PyPI `sendlayer` ≥ 1.0.0 (Python 3.7+)

```sh
pip install sendlayer
```

```python
import os
from sendlayer import SendLayer

sendlayer = SendLayer(os.environ["SENDLAYER_API_KEY"])
```

`sendlayer.Emails`, `sendlayer.Webhooks`, `sendlayer.Events` (capitalized).

Exceptions live in `sendlayer.exceptions`. Only `SendLayer`, `SendLayerError`, and
`SendLayerAPIError` are re-exported from the top-level package — import the more specific ones
explicitly:

```python
from sendlayer.exceptions import SendLayerValidationError, SendLayerRateLimitError
```

## PHP — Composer `sendlayer/sendlayer-php` ^1.0 (PHP 7.4+)

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

## Ruby — RubyGems `sendlayer` ≥ 1.0.0 (Ruby 2.7+)

```sh
gem install sendlayer
# or in a Gemfile:  gem 'sendlayer'
```

```ruby
require 'sendlayer'

sendlayer = SendLayer::SendLayer.new(ENV['SENDLAYER_API_KEY'], {
  timeout: 30,                  # seconds, default 30
  attachment_url_timeout: 30000 # ms
})
```

Note the doubled name: the class is `SendLayer::SendLayer`.

Accessors are **lowercase**: `sendlayer.emails`, `sendlayer.webhooks`, `sendlayer.events`. This
is the one SDK that differs.

## Go — `github.com/sendlayer/sendlayer-go` v1.0.0 (Go 1.23+)

```sh
go get github.com/sendlayer/sendlayer-go@v1.0.0
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
    sendlayer.WithTimeout(30*time.Second),
    // sendlayer.WithBaseURL("..."),  // for testing against a mock
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
