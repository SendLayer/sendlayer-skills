# Go

Module `github.com/sendlayer/sendlayer-go` v1.0.0. Go 1.23+. **Zero external dependencies.**

```sh
go get github.com/sendlayer/sendlayer-go@v1.0.0
```

The package name is `sendlayer` even though the module path ends in `sendlayer-go`.

## Complete program

```go
package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/sendlayer/sendlayer-go"
)

func main() {
	sl := sendlayer.New(
		os.Getenv("SENDLAYER_API_KEY"),
		sendlayer.WithTimeout(30*time.Second),
	)

	// ---- Send -----------------------------------------------------------
	resp, err := sl.Emails.Send(&sendlayer.SendEmailRequest{
		From:    sendlayer.EmailAddress{Email: "billing@yourdomain.com", Name: "Acme Billing"},
		To:      []sendlayer.EmailAddress{{Email: "customer@example.com", Name: "Ada Lovelace"}},
		ReplyTo: "support@yourdomain.com",
		Subject: "Invoice #12345",
		Html:    "<html><body><p>Your invoice is attached.</p></body></html>",
		Tags:    []string{"invoice", "billing"},
		Headers: map[string]string{"X-Invoice-Id": "12345"},
		Attachments: []sendlayer.Attachment{
			{Path: "/abs/path/invoice.pdf", Type: "application/pdf", Filename: "invoice.pdf"},
		},
	})
	if err != nil {
		var apiErr *sendlayer.SendLayerAPIError
		if errors.As(err, &apiErr) {
			log.Fatalf("API rejected the send (%d): %s", apiErr.StatusCode, apiErr.Message)
		}
		log.Fatal(err)
	}
	fmt.Println("sent", resp.MessageID)

	// ---- Query events ---------------------------------------------------
	start := time.Now().Add(-24 * time.Hour)
	end := time.Now()
	count := 100

	events, err := sl.Events.Get(&sendlayer.GetEventsRequest{
		StartDate:     &start,
		EndDate:       &end,
		Event:         "failed", // history vocabulary
		RetrieveCount: &count,
	})
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("%d of %d\n", len(events.Events), events.TotalRecords)
	for _, e := range events.Events {
		// LoggedAt is a UnixTime wrapping time.Time — use it directly
		fmt.Println(e.Event, e.Recipient, e.Reason, e.LoggedAt.Format(time.RFC3339))
	}

	// ---- Webhooks -------------------------------------------------------
	created, err := sl.Webhooks.Create(&sendlayer.WebhookCreateRequest{
		WebhookURL: "https://your-domain.com/webhooks/sendlayer", // field is WebhookURL
		Event:      "delivery",                                   // NOT "delivered"
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(created.NewWebhookID)

	hooks, err := sl.Webhooks.Get()
	if err != nil {
		log.Fatal(err)
	}
	if len(hooks) > 0 {
		id, _ := strconv.Atoi(hooks[0].WebhookID) // WebhookID is a string; Delete takes an int
		if err := sl.Webhooks.Delete(id); err != nil {
			log.Fatal(err)
		}
	}
}
```

## API

| Call | Returns |
|---|---|
| `sendlayer.New(apiKey string, opts ...ClientOption) *SendLayer` | fields `Emails`, `Webhooks`, `Events`, `Client` |
| `Emails.Send(*SendEmailRequest) (*EmailResponse, error)` | `EmailResponse{MessageID string}` |
| `Events.Get(*GetEventsRequest) (*EventsResponse, error)` | accepts `nil` for defaults |
| `Webhooks.Create(*WebhookCreateRequest) (*WebhookCreateResponse, error)` | `NewWebhookID int` |
| `Webhooks.Get() ([]Webhook, error)` | envelope already unwrapped |
| `Webhooks.Delete(webhookID int) error` | |

Options: `sendlayer.WithTimeout(time.Duration)`, `sendlayer.WithBaseURL(string)`.

`WithBaseURL` is the only SDK-level way to point at a mock server — useful in tests, and something
the Node SDK does not offer.

Sends `User-Agent: SendLayer-Go-SDK/1.0.0`.

## `interface{}` recipient fields

`SendEmailRequest.From`, `.To`, `.Cc`, `.Bcc`, `.ReplyTo` are `interface{}`, so they accept:

- `string` — `"a@example.com"`
- `sendlayer.EmailAddress` — `{Email: "a@example.com", Name: "Ada"}`
- `[]string`
- `[]sendlayer.EmailAddress`

Because these are untyped, **the compiler will not catch a wrong shape.** Passing
`[]map[string]string` compiles and fails at runtime. Stick to `EmailAddress` values.

## Type gotchas

| Field | Type | Note |
|---|---|---|
| `Webhook.WebhookID` | `string` | but `Delete` takes an `int` — `strconv.Atoi` it |
| `WebhookCreateResponse.NewWebhookID` | `int` | inconsistent with the above, deliberately |
| `Event.LoggedAt` | `UnixTime` | wraps `time.Time`; marshals to/from Unix seconds |
| `MessageHeaders.MessageID` | `string`, tag `json:"MessageId"` | lowercase `d` on the wire here, uppercase in the send response |
| `MessageHeaders.To`/`.From`/`.Cc` | `[]interface{}` | you must type-assert to `string` to use them |
| `GetEventsRequest.StartFrom`/`.RetrieveCount` | `*int` | pointers — take the address of a variable |

`Event` also carries a `Recipient string` field, which is simpler than digging into
`Message.Headers.To` — prefer it.

## `RetrieveCount` is under-validated in Go

Node, PHP, Python, and Ruby all reject `retrieveCount` outside 1–100 locally. **The Go SDK only
checks `> 0`**, so a value above 100 is sent to the API and handled server-side. Clamp it yourself:

```go
if count > 100 {
	count = 100
}
```

## Errors

```go
type SendLayerError struct{ Message string }               // base
type SendLayerAPIError struct {                            // carries HTTP detail
	Message    string
	StatusCode int
	Response   []byte
}
type SendLayerAuthenticationError struct{ SendLayerError }
type SendLayerValidationError struct{ SendLayerError }
type SendLayerNotFoundError struct{ SendLayerError }
type SendLayerRateLimitError struct{ SendLayerError }
type SendLayerInternalServerError struct{ SendLayerError }
```

All are returned as pointers. Use `errors.As`:

```go
var rateLimit *sendlayer.SendLayerRateLimitError
if errors.As(err, &rateLimit) {
	time.Sleep(backoff)
	// retry
}

var validation *sendlayer.SendLayerValidationError
if errors.As(err, &validation) {
	return fmt.Errorf("bad request, not retrying: %w", err)
}
```

`SendLayerAPIError` is the one that carries `StatusCode` and the raw `Response` bytes — log those
when a send fails for an unexpected reason.

Note the embedded types do **not** override `Error()`, so `errors.Is` comparisons against the base
will not distinguish them — always use `errors.As` with a concrete pointer type.

## `net/http` webhook handler

```go
package main

import (
	"encoding/json"
	"log"
	"net/http"
)

type payload struct {
	Event struct {
		Body struct {
			EventData struct {
				Event               string `json:"Event"`
				EventType           string `json:"EventType"`
				MessageID           string `json:"MessageID"`
				To                  string `json:"To"`
				Reason              string `json:"Reason"`
				BouncedEmailAddress struct {
					EmailAddress   string `json:"EmailAddress"`
					Status         string `json:"Status"`
					DiagnosticCode string `json:"DiagnosticCode"`
				} `json:"BouncedEmailAddress"`
			} `json:"EventData"`
		} `json:"body"`
	} `json:"event"`
}

func handler(w http.ResponseWriter, r *http.Request) {
	var p payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		w.WriteHeader(http.StatusOK) // acknowledge anyway; retries will not help
		return
	}
	w.WriteHeader(http.StatusOK) // acknowledge before slow work

	d := p.Event.Body.EventData
	switch d.Event { // payload names are past-tense
	case "bounced":
		go suppress(d.BouncedEmailAddress.EmailAddress, d.Reason)
	case "opened":
		go recordOpen(d.MessageID, d.To)
	default:
		log.Println("unhandled event", d.Event)
	}
}
```

Note the outer key is lowercase `event` and `body`, while everything inside `EventData` is
PascalCase — the struct tags above reflect that exactly.
