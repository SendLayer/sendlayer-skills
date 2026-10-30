# HTML email

Email clients are not browsers. Outlook on Windows renders with Microsoft Word's engine. Gmail
strips `<style>` blocks in some contexts. Assume roughly 2005-era HTML support and you will be
approximately right.

## Rules

| Do | Don't |
|---|---|
| `<table>` for layout | flexbox, grid, `float` |
| Inline `style` attributes | external stylesheets, `<link>` |
| Fixed pixel widths, max 600px | percentage-heavy fluid layouts |
| Web-safe fonts with a stack | webfonts as the only option |
| `<img>` with `alt` and explicit `width`/`height` | background images as the only content |
| Hex colors | `hsl()`, `oklch()`, CSS variables |
| Absolute URLs everywhere | relative paths |
| Real text | text baked into images |

No JavaScript — it is stripped everywhere, and attempting it looks malicious. No `<form>`; link out
to a web page instead.

## 600px, table-based skeleton

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your receipt</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5;">
  <!-- Preheader: shown in the inbox preview, hidden in the body -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
    Your receipt for order #12345 &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:600px; max-width:600px; background-color:#ffffff; border-radius:8px;">
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px; font-family:Arial,Helvetica,sans-serif;
                         font-size:22px; line-height:28px; color:#18181b;">
                Thanks for your order
              </h1>
              <p style="margin:0 0 16px; font-family:Arial,Helvetica,sans-serif;
                        font-size:15px; line-height:24px; color:#3f3f46;">
                Order #12345 is confirmed. Your receipt is attached.
              </p>

              <!-- Bulletproof button: a padded link, not an <input> -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#1d4ed8" style="border-radius:6px;">
                    <a href="https://yourdomain.com/orders/12345"
                       style="display:inline-block; padding:12px 24px;
                              font-family:Arial,Helvetica,sans-serif; font-size:15px;
                              color:#ffffff; text-decoration:none;">
                      View order
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:600px; max-width:600px;">
          <tr>
            <td style="padding:16px 32px; font-family:Arial,Helvetica,sans-serif;
                       font-size:12px; line-height:18px; color:#71717a; text-align:center;">
              Acme Inc, 123 Example St, Austin TX 78701
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
```

`role="presentation"` on layout tables tells screen readers to ignore the structure — required for
accessibility, since these tables are not data.

## The preheader

The text after the subject line in the inbox list. Without one, clients pull the first text they
find — often "View in browser" or an unsubscribe link.

Put a hidden div first, padded with zero-width non-joiners so the client does not spill visible body
text into the preview.

## Images

- Always set `alt` — many clients block images by default, and the alt text is all the recipient
  sees.
- Always set `width` and `height` so the layout does not collapse while loading.
- **Never build an email entirely from images.** With images blocked it is a blank message, and it is
  a strong spam signal.
- Host images on your own HTTPS domain, not a CDN with a bad reputation, and never as
  `cid:` attachments unless you must.
- Retina: export at 2× and set the displayed size in the attributes.

Inline `cid:` attachments are supported by SendLayer (`disposition: 'inline'` plus an integer
`contentId`) but render inconsistently and inflate message size. Hosted images are usually the better
choice. If you do use them, set `contentId` explicitly — an auto-generated one is unpredictable, so
your `cid:` reference will not resolve.

## Dark mode

Many clients invert colors, sometimes badly. Defensively:

```html
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
```

- Avoid pure `#ffffff` backgrounds with pure `#000000` text — inversion looks worst there.
- Logos: use a PNG with a transparent background that reads on both, or add a subtle solid backing.
- Never rely on a background image for contrast against text.

Test in dark mode explicitly. It is where most "looks broken" reports originate.

## Mobile

Over half of email is opened on a phone.

- Single column. Multi-column layouts require Outlook-hostile hacks.
- Minimum 14px body text, 16px is safer.
- Tap targets at least 44×44px.
- Short subject lines — roughly 35 characters visible on mobile.

A media query helps where supported, but the single-column-by-default approach matters more:

```html
<style>
  @media only screen and (max-width: 600px) {
    .container { width: 100% !important; }
    .stack { display: block !important; width: 100% !important; }
  }
</style>
```

Gmail strips `<style>` in some configurations, so this is an enhancement, never the foundation.

## Outlook

The Word rendering engine on Windows Outlook is the main source of pain:

- No `border-radius` — corners will be square. Accept it, or use VML conditional comments.
- No `background-image` on most elements.
- `margin` is unreliable; use table cell `padding`.
- Adds line spacing to tables; `mso-line-height-rule:exactly` helps.
- Ignores `max-width`; set an explicit `width` too.

Conditional comments target it:

```html
<!--[if mso]>
<style>
  body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
</style>
<![endif]-->
```

## Accessibility

- `<html lang="en">`.
- Real semantic headings, not styled divs.
- `role="presentation"` on all layout tables.
- Contrast ratio at least 4.5:1 for body text.
- Descriptive link text — "View your order", not "click here".
- `alt` on every image; `alt=""` for purely decorative ones.

## The plain-text alternative

A `multipart/alternative` message carrying both HTML and plain text is standard best practice. It
helps marginally with spam scoring and serves text-only clients.

With the SendLayer SDKs (1.1.0+), pass both `html` and `text` and both are sent. Over REST, send
`HTMLContent` and `PlainContent` together with `ContentType: "HTML"`.

Write the text version deliberately rather than stripping tags from the HTML: keep the same
content and links, written out as plain URLs. HTML that degrades well — real text in the markup,
meaningful `alt` attributes, nothing that exists only inside an image — still matters, because
many clients render the HTML part.

> SendLayer SDKs before 1.1.0 sent only the HTML when both were passed and silently discarded
> `text`. Check the project's pinned version before assuming the fallback is going out.

## Testing

Never send a new template straight to a list. → [testing.md](testing.md)

Minimum: Gmail web, Gmail iOS or Android, Apple Mail on macOS and iOS, Outlook on Windows, and one
dark-mode client. Outlook Windows and dark mode are where things actually break.

## Checklist

- [ ] Table-based layout, 600px, inline styles
- [ ] Preheader set
- [ ] Every image has `alt`, `width`, `height`
- [ ] Content readable with images blocked
- [ ] Absolute HTTPS URLs everywhere
- [ ] `role="presentation"` on layout tables
- [ ] Contrast at least 4.5:1
- [ ] Tested in Outlook Windows and a dark-mode client
- [ ] Physical mailing address in the footer for marketing
- [ ] Visible unsubscribe link for marketing
