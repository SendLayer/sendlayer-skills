# REST API — curl and unsupported languages

Use this when there is no SDK for the language (Java, .NET, Rust, Elixir, Kotlin, …) or when you
need something the SDK cannot express — Node's missing `startFrom`, or a custom timeout.

- Base URL: `https://console.sendlayer.com/api/v1/`
- Auth: `Authorization: Bearer <API_KEY>`
- Content type: `application/json`

**Request keys are PascalCase** (`From`, `To`, `Subject`, `HTMLContent`) — unlike the SDKs, which
take lowercase names and convert for you. Getting this wrong produces "Missing …" errors 2–11.

## Send an email

```sh
curl -sS --request POST \
  --url https://console.sendlayer.com/api/v1/email \
  --header "Authorization: Bearer $SENDLAYER_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{
    "From":    { "name": "Acme Billing", "email": "billing@yourdomain.com" },
    "To":      [ { "name": "Ada Lovelace", "email": "customer@example.com" } ],
    "Subject": "Invoice #12345",
    "ContentType": "HTML",
    "HTMLContent": "<html><body><p>Your invoice.</p></body></html>"
  }'
```

Response:

```json
{ "MessageID": "8912e59e-ec88-bcd6-45dd-0012fe223ab6" }
```

### Required fields

`From`, `To`, `Subject`, `ContentType`, and the matching body field.

| `ContentType` | Body field |
|---|---|
| `"HTML"` | `HTMLContent` |
| `"Text"` | `PlainContent` |

The SDKs pick exactly one. **Calling REST directly is the only way to attempt both** — send
`ContentType: "HTML"` with both `HTMLContent` and `PlainContent` and see what the API does with
it. The documented schema lists `HTMLContent` as required and does not describe multipart
behaviour, so verify against a real inbox before relying on it.

### Optional fields

```json
{
  "CC":  [ { "name": "Records", "email": "records@yourdomain.com" } ],
  "BCC": [ { "name": "Audit", "email": "audit@yourdomain.com" } ],
  "ReplyTo": [ { "name": "Support", "email": "support@yourdomain.com" } ],
  "Tags": ["invoice", "billing"],
  "Headers": { "X-Invoice-Id": "12345" },
  "Attachments": [
    {
      "Content": "<base64 string>",
      "Type": "application/pdf",
      "Filename": "invoice.pdf",
      "Disposition": "attachment",
      "ContentId": 0
    }
  ]
}
```

`CC`, `BCC`, and `ReplyTo` must be **arrays**, even for a single address — a bare object gives
errors 24 or 28.

`From` is a single object, not an array.

### Attachments over REST

You base64-encode it yourself. Nothing fetches URLs for you at this level:

```sh
CONTENT=$(base64 -i invoice.pdf | tr -d '\n')

curl -sS --request POST \
  --url https://console.sendlayer.com/api/v1/email \
  --header "Authorization: Bearer $SENDLAYER_API_KEY" \
  --header 'Content-Type: application/json' \
  --data @- <<JSON
{
  "From": { "name": "Acme", "email": "billing@yourdomain.com" },
  "To": [ { "name": "Ada", "email": "customer@example.com" } ],
  "Subject": "Invoice",
  "ContentType": "HTML",
  "HTMLContent": "<p>Attached.</p>",
  "Attachments": [
    { "Content": "$CONTENT", "Type": "application/pdf", "Filename": "invoice.pdf", "Disposition": "attachment" }
  ]
}
JSON
```

Note the schema spells this key `ContentId` (lowercase `d`). The Node SDK sends `ContentID`
(uppercase). If inline images misbehave, that mismatch is a likely cause — prefer hosted images.

## Query events

```sh
curl -sS --get \
  --url https://console.sendlayer.com/api/v1/events \
  --header "Authorization: Bearer $SENDLAYER_API_KEY" \
  --data-urlencode "StartDate=1717000000" \
  --data-urlencode "EndDate=1717086400" \
  --data-urlencode "Event=failed" \
  --data-urlencode "RetrieveCount=100" \
  --data-urlencode "StartFrom=0"
```

Query parameters are PascalCase: `StartDate`, `EndDate`, `Event`, `MessageId`, `StartFrom`,
`RetrieveCount`.

- Dates are **Unix seconds**, not ISO strings. `date -u +%s` on macOS/Linux.
- `Event` uses the history vocabulary: `accepted`, `rejected`, `delivered`, `opened`, `clicked`,
  `unsubscribed`, `complained`, `failed`.
- `RetrieveCount` maximum is 100.
- `StartFrom` is the pagination offset — this is how you page past 100 records, and it is
  unavailable in the Node SDK.

Response: `{ "TotalRecords": n, "Events": [ … ] }` — see [events.md](events.md) for the record
shape.

## Webhooks

Create:

```sh
curl -sS --request POST \
  --url https://console.sendlayer.com/api/v1/webhooks \
  --header "Authorization: Bearer $SENDLAYER_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{ "Event": "delivery", "WebhookURL": "https://your-domain.com/webhook" }'
```

`Event` uses the **subscription** vocabulary: `bounce`, `delivery`, `open`, `click`,
`unsubscribe`, `complaint`. Response: `{ "NewWebhookID": 972 }`.

List:

```sh
curl -sS --url https://console.sendlayer.com/api/v1/webhooks \
  --header "Authorization: Bearer $SENDLAYER_API_KEY"
```

Delete:

```sh
curl -sS --request DELETE \
  --url https://console.sendlayer.com/api/v1/webhooks/23718 \
  --header "Authorization: Bearer $SENDLAYER_API_KEY"
```

There is no update endpoint — delete and recreate.

## Errors

Non-success responses carry an `Errors` array:

```json
{ "Errors": [ { "Code": 13, "Message": "Invalid SenderAPIKey" } ] }
```

Check for the presence of `Errors`, not just the HTTP status — see
[error-codes.md](error-codes.md) for the full table.

## Verifying a key

The cheapest authenticated request. No verified domain needed, no email sent:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://console.sendlayer.com/api/v1/webhooks \
  -H "Authorization: Bearer $SENDLAYER_API_KEY"
```

`200` means the key works.

## Java example

```java
import java.net.URI;
import java.net.http.*;

var body = """
    {
      "From": {"name": "Acme", "email": "billing@yourdomain.com"},
      "To": [{"name": "Ada", "email": "customer@example.com"}],
      "Subject": "Invoice #12345",
      "ContentType": "HTML",
      "HTMLContent": "<p>Your invoice.</p>"
    }
    """;

var request = HttpRequest.newBuilder()
    .uri(URI.create("https://console.sendlayer.com/api/v1/email"))
    .header("Authorization", "Bearer " + System.getenv("SENDLAYER_API_KEY"))
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();

var response = HttpClient.newHttpClient()
    .send(request, HttpResponse.BodyHandlers.ofString());

System.out.println(response.body());   // {"MessageID":"..."}
```

## C# example

```csharp
using System.Net.Http.Headers;
using System.Text;

var http = new HttpClient();
http.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer", Environment.GetEnvironmentVariable("SENDLAYER_API_KEY"));

var json = """
    {
      "From": {"name": "Acme", "email": "billing@yourdomain.com"},
      "To": [{"name": "Ada", "email": "customer@example.com"}],
      "Subject": "Invoice #12345",
      "ContentType": "HTML",
      "HTMLContent": "<p>Your invoice.</p>"
    }
    """;

var response = await http.PostAsync(
    "https://console.sendlayer.com/api/v1/email",
    new StringContent(json, Encoding.UTF8, "application/json"));

Console.WriteLine(await response.Content.ReadAsStringAsync());
```

## Machine-readable docs

- Docs index: https://developers.sendlayer.com/llms.txt
- OpenAPI spec is embedded in the API reference pages under https://developers.sendlayer.com/api-reference/
