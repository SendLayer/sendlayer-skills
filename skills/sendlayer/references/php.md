# PHP

Composer `sendlayer/sendlayer-php` ^1.0. PHP 7.4+. Uses Guzzle 7.

```sh
composer require sendlayer/sendlayer-php
```

Namespace `SendLayer\`, exceptions in `SendLayer\Exceptions\`.

## Use named arguments (PHP 8+)

`Emails::send()` takes **eleven positional parameters**. Positional calls are unreadable and
fragile. Use named arguments:

```php
$sendlayer->Emails->send(
    from: 'you@yourdomain.com',
    to: 'recipient@example.com',
    subject: 'Your receipt',
    html: '<p>Thanks.</p>',
);
```

The parameter is `from`. **Not `sender`** — that is the Python name, and some older SendLayer
usage guides incorrectly show `sender:` for PHP. `sender:` raises
`Unknown named parameter $sender`.

On PHP 7.4 you must pass positionally in this exact order:

```text
send($from, $to, $subject, $text, $html, $cc, $bcc, $replyTo, $attachments, $headers, $tags)
```

Pass `null` for the ones you skip.

## Complete program

```php
<?php

require_once __DIR__ . '/vendor/autoload.php';

use SendLayer\SendLayer;
use SendLayer\Exceptions\SendLayerException;
use SendLayer\Exceptions\SendLayerValidationException;
use SendLayer\Exceptions\SendLayerRateLimitException;

$sendlayer = new SendLayer(getenv('SENDLAYER_API_KEY'), [
    'timeout' => 30,
    'attachmentURLTimeout' => 30000,
]);

// ---- Send ---------------------------------------------------------------
try {
    $response = $sendlayer->Emails->send(
        from: ['email' => 'billing@yourdomain.com', 'name' => 'Acme Billing'],
        to: [['email' => 'customer@example.com', 'name' => 'Ada Lovelace']],
        subject: 'Invoice #12345',
        html: '<html><body><p>Your invoice is attached.</p></body></html>',
        replyTo: 'support@yourdomain.com',
        attachments: [
            ['path' => __DIR__ . '/invoice.pdf', 'type' => 'application/pdf'],
        ],
        headers: ['X-Invoice-Id' => '12345'],
        tags: ['invoice', 'billing'],
    );
    echo "sent {$response['MessageID']}\n";
} catch (SendLayerRateLimitException $e) {
    echo "rate limited\n";
} catch (SendLayerValidationException $e) {
    echo "bad request: {$e->getMessage()}\n";     // do not retry
} catch (SendLayerException $e) {
    echo "send failed: {$e->getMessage()}\n";
}

// ---- Query events -------------------------------------------------------
$events = $sendlayer->Events->get(
    startDate: new DateTime('-1 day'),
    endDate: new DateTime(),
    event: 'failed',          // history vocabulary
    retrieveCount: 100,
);

echo count($events['Events']) . ' of ' . $events['TotalRecords'] . "\n";
foreach ($events['Events'] as $e) {
    echo $e['Event'], ' ', $e['Message']['Headers']['To'][0], ' ', $e['Reason'], "\n";
}

// ---- Webhooks -----------------------------------------------------------
$created = $sendlayer->Webhooks->create(
    'https://your-domain.com/webhooks/sendlayer',
    'delivery',               // subscription vocabulary — NOT 'delivered'
);
echo $created['NewWebhookID'], "\n";

$webhooks = $sendlayer->Webhooks->get()['Webhooks'];
$sendlayer->Webhooks->delete((int) $webhooks[0]['WebhookID']);   // cast: it is a string
```

## API

| Call | Returns |
|---|---|
| `new SendLayer(string $apiKey, array $config = [])` | client with `->Emails`, `->Webhooks`, `->Events` |
| `Emails->send(...)` | `array` with `MessageID` |
| `Events->get(?DateTime $startDate, ?DateTime $endDate, ?string $event, ?string $messageId, ?int $startFrom, ?int $retrieveCount)` | `array` with `TotalRecords`, `Events` |
| `Webhooks->create(string $url, string $event)` | `array` with `NewWebhookID` |
| `Webhooks->get()` | `array` with `Webhooks` |
| `Webhooks->delete(int $webhookId)` | `array` |

### `Webhooks->create()` takes two strings, not an array

```php
$sendlayer->Webhooks->create('https://…', 'delivery');   // correct

$sendlayer->Webhooks->create([                            // TypeError
    'url' => 'https://…',
    'event' => 'delivery',
]);
```

The published PHP snippet in the SendLayer docs shows the array form. It is wrong for the current
SDK. `create()` is declared `create(string $url, string $event): array`.

Dates must be `DateTime` instances, not strings: `new DateTime('-1 day')`, not `'-1 day'`.

## Config

```php
new SendLayer($apiKey, [
    'timeout' => 30,                   // seconds, Guzzle request timeout
    'attachmentURLTimeout' => 30000,   // ms, for fetching remote attachments
    'guzzle' => [ /* raw Guzzle options */ ],
]);
```

The `guzzle` key is the escape hatch for proxies, retries, or a custom handler stack — useful for
tests, where you can install a `MockHandler`.

## Exceptions

PHP uses the `Exception` suffix, not `Error`:

```
SendLayer\Exceptions\SendLayerException              (base — catch this)
├── SendLayerAPIException
├── SendLayerAuthenticationException
├── SendLayerValidationException
├── SendLayerNotFoundException
├── SendLayerRateLimitException
└── SendLayerInternalServerException
```

## Laravel / Symfony

There is **no published Laravel package, Symfony bundle, or Symfony Mailer transport** for
SendLayer yet. Packages exist in development but are not on Packagist — do not write code against
`sendlayer/sendlayer-laravel`, `sendlayer/sendlayer-mailer`, or `sendlayer/sendlayer-bundle`, and
do not tell a user to `composer require` them.

For Laravel today, use the SDK behind a small service:

```php
// app/Providers/AppServiceProvider.php
use SendLayer\SendLayer;

public function register(): void
{
    $this->app->singleton(SendLayer::class, fn () => new SendLayer(
        config('services.sendlayer.key'),
        ['timeout' => 30],
    ));
}
```

```php
// config/services.php
'sendlayer' => [
    'key' => env('SENDLAYER_API_KEY'),
],
```

Then inject `SendLayer` where you need it. Note this does **not** make `Mail::send()` work — a
mail-driver integration requires the unpublished transport package.

## Slim/Laravel webhook handler

```php
Route::post('/webhooks/sendlayer', function (Illuminate\Http\Request $request) {
    $data = $request->input('event.body.EventData');   // note the nesting
    if (!$data) {
        return response()->noContent();
    }

    // payload names are past-tense
    match ($data['Event'] ?? null) {
        'bounced'   => suppress($data['BouncedEmailAddress']['EmailAddress'] ?? null, $data['Reason'] ?? null),
        'opened'    => recordOpen($data['MessageID'], $data['To'] ?? null),
        'complained'=> suppress($data['To'] ?? null, 'spam complaint'),
        default     => null,
    };

    return response()->noContent();   // 204, acknowledged
});
```

Dispatch anything slow to a queued job. A handler that blocks causes SendLayer to retry, and you
will process the same event twice.
