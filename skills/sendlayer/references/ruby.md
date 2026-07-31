# Ruby

RubyGems `sendlayer` ≥ 1.0.0. Ruby 2.7+. Runtime dependency: `mime-types ~> 3.4`. Uses the
standard library for HTTP.

```sh
gem install sendlayer
# Gemfile:  gem 'sendlayer'
```

## Two Ruby-specific quirks

1. **The class is `SendLayer::SendLayer`** — the module and the class share a name.
2. **Accessors are lowercase**: `emails`, `webhooks`, `events`. Every other SDK capitalizes them.
   `sendlayer.Emails` raises `NoMethodError`.

```ruby
sendlayer = SendLayer::SendLayer.new(ENV['SENDLAYER_API_KEY'])
sendlayer.emails.send(...)     # correct
sendlayer.Emails.send(...)     # NoMethodError
```

## Complete program

```ruby
require 'sendlayer'

sendlayer = SendLayer::SendLayer.new(ENV.fetch('SENDLAYER_API_KEY'), {
  timeout: 30,
  attachment_url_timeout: 30_000
})

# ---- Send ---------------------------------------------------------------
begin
  response = sendlayer.emails.send(
    from: { email: 'billing@yourdomain.com', name: 'Acme Billing' },
    to: [{ email: 'customer@example.com', name: 'Ada Lovelace' }],
    reply_to: 'support@yourdomain.com',
    subject: 'Invoice #12345',
    html: '<html><body><p>Your invoice is attached.</p></body></html>',
    tags: %w[invoice billing],
    headers: { 'X-Invoice-Id' => '12345' },
    attachments: [
      { path: File.expand_path('invoice.pdf', __dir__), type: 'application/pdf' }
    ]
  )
  puts "sent #{response['MessageID']}"
rescue SendLayer::SendLayerRateLimitError
  warn 'rate limited — back off'
rescue SendLayer::SendLayerValidationError => e
  warn "bad request: #{e.message}"      # do not retry
rescue SendLayer::SendLayerError => e
  warn "send failed: #{e.message}"
end

# ---- Query events -------------------------------------------------------
result = sendlayer.events.get(
  start_date: Time.now - 86_400,
  end_date: Time.now,
  event: 'failed',            # history vocabulary
  retrieve_count: 100
)

puts "#{result['Events'].size} of #{result['TotalRecords']}"
result['Events'].each do |e|
  puts [e['Event'], e['Message']['Headers']['To'].first, e['Reason']].join(' ')
end

# ---- Webhooks -----------------------------------------------------------
created = sendlayer.webhooks.create(
  url: 'https://your-domain.com/webhooks/sendlayer',
  event: 'delivery'           # subscription vocabulary — NOT 'delivered'
)
puts created['NewWebhookID']

webhooks = sendlayer.webhooks.get['Webhooks']
sendlayer.webhooks.delete(webhooks.first['WebhookID'].to_i)   # cast: it is a string
```

## API

| Call | Notes |
|---|---|
| `SendLayer::SendLayer.new(api_key, options = {})` | options: `:base_url`, `:timeout` (default 30s), `:attachment_url_timeout` |
| `emails.send(from:, to:, subject:, text: nil, html: nil, cc: nil, bcc: nil, reply_to: nil, attachments: nil, headers: nil, tags: nil)` | all keyword arguments |
| `events.get(start_date: nil, end_date: nil, event: nil, message_id: nil, start_from: nil, retrieve_count: nil)` | |
| `webhooks.create(url:, event:)` | keyword arguments |
| `webhooks.get` | no parentheses needed; returns the full hash |
| `webhooks.delete(webhook_id)` | **positional**, and must be an Integer |

Note the inconsistency inside the gem itself: `create` takes keywords (`url:`, `event:`) while
`delete` takes a positional argument.

Responses are plain hashes with **PascalCase string keys** — `response['MessageID']`, not
`response[:message_id]`. There is no symbol-key or `OpenStruct` wrapper.

Sends `User-Agent: SendLayer-Ruby/<version>`.

## Exceptions

All in the `SendLayer::` namespace:

```
SendLayer::SendLayerError                 (base — rescue this)
├── SendLayer::SendLayerAPIError
├── SendLayer::SendLayerAuthenticationError
├── SendLayer::SendLayerValidationError
├── SendLayer::SendLayerNotFoundError
├── SendLayer::SendLayerRateLimitError
└── SendLayer::SendLayerInternalServerError
```

`SendLayerAPIError.new(message, status_code = nil, response = nil)` carries the HTTP status and
raw response, which is what you want when logging a failure.

## Rails

There is no ActionMailer delivery method for SendLayer. Two options:

**Call the SDK directly** from a service object — simplest, and what most apps want for
transactional email:

```ruby
# app/services/sendlayer_client.rb
class SendlayerClient
  def self.instance
    @instance ||= SendLayer::SendLayer.new(ENV.fetch('SENDLAYER_API_KEY'))
  end
end
```

**Or write a delivery method** if you want `ActionMailer` templates and previews:

```ruby
# config/initializers/sendlayer.rb
class SendlayerDeliveryMethod
  def initialize(settings = {}) = @settings = settings

  def deliver!(mail)
    SendlayerClient.instance.emails.send(
      from: mail.from.first,
      to: mail.to,
      subject: mail.subject,
      html: mail.html_part&.body&.decoded || (mail.body.decoded if mail.content_type&.include?('html')),
      text: mail.text_part&.body&.decoded || (mail.body.decoded unless mail.content_type&.include?('html'))
    )
  end
end

ActionMailer::Base.add_delivery_method :sendlayer, SendlayerDeliveryMethod
```

Then `config.action_mailer.delivery_method = :sendlayer`.

Be aware this loses multipart: ActionMailer happily builds a `multipart/alternative` message with
both parts, but the SDK transmits only one body — if you pass both `html` and `text`, the text is
discarded. Only the HTML part reaches the recipient.

## Sinatra webhook handler

```ruby
require 'sinatra'
require 'json'

post '/webhooks/sendlayer' do
  payload = JSON.parse(request.body.read) rescue {}
  data = payload.dig('event', 'body', 'EventData')   # note the nesting
  halt 200 unless data

  # payload names are past-tense
  case data['Event']
  when 'bounced'
    suppress(data.dig('BouncedEmailAddress', 'EmailAddress'), data['Reason'])
  when 'opened'
    record_open(data['MessageID'], data['To'])
  when 'complained'
    suppress(data['To'], 'spam complaint')
  end

  status 200
end
```

Enqueue slow work (Sidekiq, ActiveJob) rather than doing it inline — SendLayer retries slow
endpoints, so you will see the same event twice.
