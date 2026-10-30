# Attachments

The SDK does the base64 encoding. **Never encode an attachment yourself** — pass a path or URL.

## Fields

| Field | Required | Notes |
|---|---|---|
| `path` | yes | A local file path **or** an `http(s)` URL. |
| `type` | yes | MIME type, e.g. `application/pdf`, `image/png`. |
| `filename` | no | Defaults to the basename of `path`. |
| `disposition` | no | `attachment` (default) or `inline`. |
| `contentId` | no | Integer. Auto-derived from a hash of `path` if omitted. |

Omitting `path` raises a validation error.

## Local file

```js
attachments: [
  { path: './invoices/12345.pdf', type: 'application/pdf', filename: 'invoice.pdf' },
]
```

The Node SDK resolves a relative path against several candidates in order: the path as given, the
absolute resolution, relative to `process.cwd()`, relative to the module directory, and relative
to `$HOME`. That is forgiving but unpredictable — **pass an absolute path in production** so you
know which file you shipped.

## Remote URL

```js
attachments: [
  { path: 'https://cdn.example.com/reports/q3.pdf', type: 'application/pdf', filename: 'q3.pdf' },
]
```

The SDK fetches the URL and base64-encodes the body. Notes:

- The fetch is subject to `attachmentURLTimeout`, default **30000 ms**.
- The fetch is blocking: `send()` does not resolve until the download completes.
- Set it at construction: Node (`new SendLayer(key, { attachmentURLTimeout })`, 1.1.0+), PHP
  and Python (`attachmentURLTimeout`), Ruby (`attachment_url_timeout`).
- A 404 or a slow CDN becomes a failed *send*, not a partial email. If the URL is unreliable,
  download it yourself first and pass a local path.

## Inline images

To reference an image from your HTML body, set `disposition: 'inline'` and a `contentId`, then
reference that id with `cid:`:

```js
await sendlayer.Emails.send({
  from: 'you@yourdomain.com',
  to: 'recipient@example.com',
  subject: 'Your report',
  html: '<p>Q3 results:</p><img src="cid:100" alt="chart">',
  attachments: [
    {
      path: './chart.png',
      type: 'image/png',
      disposition: 'inline',
      contentId: 100,
    },
  ],
});
```

`contentId` is an **integer**, not the string token most email libraries use. If you omit it, the
SDK generates one from a hash of the path — which you then cannot predict, so `cid:` references
will not resolve. **Always set `contentId` explicitly for inline images.**

Inline images are unreliable across clients (Outlook and Gmail both have quirks) and increase
message size. Hosting the image and using a normal `<img src="https://...">` is usually better —
see the `email-best-practices` skill.

## Size

There is no documented size limit in the API reference, but base64 inflates payloads by ~33% and
mailbox providers commonly reject messages over 10–25 MB total. Keep attachments small; link to
large files instead of attaching them.

## Per-language shapes

**Python** — list of dicts, snake_case keys are not used here; the keys match the wire names
lowercased as in Node:

```python
attachments=[{"path": "/abs/path/invoice.pdf", "type": "application/pdf"}]
```

**PHP** — array of arrays:

```php
attachments: [
    ['path' => __DIR__ . '/invoice.pdf', 'type' => 'application/pdf'],
]
```

**Ruby** — array of hashes:

```ruby
attachments: [
  { path: File.expand_path('invoice.pdf', __dir__), type: 'application/pdf' }
]
```

**Go** — typed struct, with only three fields (no `disposition` or `contentId`, so **inline
images are not supported by the Go SDK**):

```go
Attachments: []sendlayer.Attachment{
    {Path: "/abs/path/invoice.pdf", Type: "application/pdf", Filename: "invoice.pdf"},
},
```
