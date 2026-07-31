# `sendlayer emails send`

Send one email. Two mutually compatible input styles: individual flags, or a JSON payload file.

## Flags

| Flag | Repeatable | Notes |
|---|---|---|
| `--from` | no | Required unless `--file`. `email` or `"Name <email>"`. |
| `--to` | **no** | Required unless `--file`. **Comma-separated** for multiple. |
| `--cc` | no | Comma-separated. |
| `--bcc` | no | Comma-separated. |
| `--reply-to` | no | Comma-separated; only the first is used. |
| `--subject` | no | Required unless `--file`. |
| `--text` | no | Plain-text body. |
| `--text-file` | no | Read the plain-text body from a file. |
| `--html` | no | HTML body. |
| `--html-file` | no | Read the HTML body from a file. |
| `--tag` | **yes** | Repeat for each tag. |
| `--header` | **yes** | `Key=Value`. Repeat for each header. |
| `--attachment` | **yes** | `path[:mime[:disposition[:filename]]]`. Repeat for each file. |
| `--file` | no | Read the whole payload from a JSON file. |

Plus the globals `--api-key`, `--profile`, `--json`.

You must supply exactly one body source: one of `--text`, `--html`, `--text-file`, `--html-file`.
Providing none is an error.

## Recipients

`--to` is **not repeatable**. This is the most common mistake:

```sh
sendlayer emails send --to a@x.com --to b@x.com    # WRONG — second value overwrites the first
sendlayer emails send --to "a@x.com,b@x.com"       # correct
```

Both bare addresses and display-name form work, mixed freely:

```sh
--to "Ada Lovelace <ada@example.com>,plain@example.com"
```

The parser accepts `Name <email>` and trims whitespace. `--from` takes the same form:

```sh
--from "Acme Billing <billing@yourdomain.com>"
```

The from-address domain must be verified in SendLayer, or the send fails with error code 32.

## Bodies

```sh
--text "Your order shipped."
--html '<p>Your order shipped.</p>'
--html-file ./emails/shipped.html
--text-file ./emails/shipped.txt
```

`--html` wins over `--html-file` if both are given; likewise `--text` over `--text-file`.

**Passing both an HTML and a plain-text body does not produce a multipart email.** The underlying
SDK transmits only the HTML and silently discards the text. Do not tell a user they have a
plain-text fallback — they do not.

## Headers use `=`, not `:`

```sh
--header "X-Invoice-Id=12345"           # correct
--header "X-Invoice-Id: 12345"          # error: expected Key=Value
```

Only the first `=` splits, so values may contain `=`:

```sh
--header "X-Signature=abc=def=="
```

Both key and value are trimmed.

## Attachments

Colon-delimited, up to four parts:

```
path[:mime[:disposition[:filename]]]
```

```sh
--attachment ./invoice.pdf
--attachment ./invoice.pdf:application/pdf
--attachment ./logo.png:image/png:inline
--attachment ./logo.png:image/png:inline:company-logo.png
```

- **MIME is guessed from the extension** if omitted, falling back to a default type. Set it
  explicitly for anything unusual.
- `disposition` is the **third** field and defaults to `attachment`. Use `inline` for images
  referenced from HTML.
- `filename` defaults to the basename of `path`.

Because `:` is the delimiter, a Windows path like `C:\files\x.pdf` will be parsed wrong. Use a
relative path or a POSIX-style path, or use `--file` instead.

Repeat the flag per attachment:

```sh
--attachment ./invoice.pdf:application/pdf \
--attachment ./terms.pdf:application/pdf
```

## `--file` — JSON payload

For anything complex, put the payload in a file. The JSON matches the Node SDK's `EmailOptions`
shape exactly (lowercase keys, unlike the REST API):

```json
{
  "from": { "email": "billing@yourdomain.com", "name": "Acme Billing" },
  "to": [
    { "email": "customer@example.com", "name": "Ada Lovelace" },
    { "email": "second@example.com" }
  ],
  "cc": "records@yourdomain.com",
  "replyTo": "support@yourdomain.com",
  "subject": "Invoice #12345",
  "html": "<html><body><p>Your invoice is attached.</p></body></html>",
  "tags": ["invoice", "billing"],
  "headers": { "X-Invoice-Id": "12345" },
  "attachments": [
    { "path": "./invoice.pdf", "type": "application/pdf", "filename": "invoice.pdf" }
  ]
}
```

```sh
sendlayer emails send --file ./payload.json
```

`--file` supplies the entire payload; the individual flags are not merged into it. Use one style or
the other.

This is the right approach for templated sends — generate the JSON, then invoke once per message:

```sh
jq -c '.[]' recipients.json | while read -r r; do
  jq -n --argjson r "$r" '{
    from: "billing@yourdomain.com",
    to: $r.email,
    subject: "Invoice \($r.invoice)",
    html: "<p>Hi \($r.name), your invoice is ready.</p>"
  }' > /tmp/payload.json
  sendlayer emails send --file /tmp/payload.json --json
done
```

Note there is no batch endpoint — this is genuinely one API call per recipient. Add a small delay
if you are sending many, to stay clear of rate limiting (exit code 6 with a 429).

## Output

Human-readable by default; JSON when `--json` is passed or stdout is not a TTY. The useful field
is `MessageID`:

```sh
MSG=$(sendlayer emails send --from ... --to ... --subject ... --text ... --json | jq -r '.MessageID')
sendlayer events list --message-id "$MSG" --json
```

## Examples

Minimal:

```sh
sendlayer emails send \
  --from you@yourdomain.com \
  --to recipient@example.com \
  --subject "Test" \
  --text "Hello."
```

Full:

```sh
sendlayer emails send \
  --from "Acme Billing <billing@yourdomain.com>" \
  --to "Ada Lovelace <customer@example.com>,accounts@example.com" \
  --cc records@yourdomain.com \
  --bcc audit@yourdomain.com \
  --reply-to "Support <support@yourdomain.com>" \
  --subject "Invoice #12345" \
  --html-file ./emails/invoice.html \
  --attachment ./invoice.pdf:application/pdf:attachment:invoice-12345.pdf \
  --tag invoice \
  --tag billing \
  --header "X-Invoice-Id=12345" \
  --json
```
