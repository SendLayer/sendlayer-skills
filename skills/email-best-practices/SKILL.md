---
name: email-best-practices
description: Use when building anything that sends email — choosing between transactional and marketing sends, getting messages into the inbox instead of spam, setting up SPF/DKIM/DMARC and sender domain authentication, writing HTML email that renders across clients, handling bounces and spam complaints, honoring unsubscribes, or complying with CAN-SPAM, GDPR, and the Gmail and Yahoo bulk-sender requirements. Also use when a user reports that their email "goes to spam", "isn't arriving", or "looks broken in Outlook" — deliverability problems are usually authentication or list-hygiene problems, not code problems.
license: MIT
metadata:
  author: sendlayer
  version: "1.1.0"
  homepage: https://sendlayer.com
  source: https://github.com/SendLayer/sendlayer-skills
---

# Email best practices

Provider-neutral guidance, with SendLayer-specific notes where they matter. The API call is the
easy part; everything that determines whether the message arrives happens around it.

## The five things that matter most

1. **Authenticate the sending domain.** SPF, DKIM, and DMARC. Without these, bulk mail to Gmail and
   Yahoo is rejected outright — not filtered, rejected. This is non-negotiable since February 2024.
2. **Send from a subdomain you control**, e.g. `mail.yourdomain.com`, so a reputation problem in
   transactional mail cannot poison your corporate domain.
3. **Never send to an address that bounced or complained.** One hard bounce is data; repeatedly
   mailing it is what gets you blocked.
4. **Keep transactional and marketing streams separate** — separate subdomains, ideally separate
   accounts. Marketing complaints must not degrade password-reset delivery.
5. **Make unsubscribing trivial** and honor it within two days. For bulk mail, one-click
   `List-Unsubscribe` is now required by Gmail and Yahoo.

Nothing you do in code compensates for getting these wrong.

## What do you need?

| Task | Reference |
|---|---|
| Set up SPF, DKIM, DMARC; verify a sending domain | [references/domain-authentication.md](references/domain-authentication.md) |
| Diagnose "my email goes to spam" | [references/deliverability.md](references/deliverability.md) |
| Decide which stream a message belongs to | [references/transactional-vs-marketing.md](references/transactional-vs-marketing.md) |
| Handle bounces, complaints, suppression lists | [references/bounces-and-suppressions.md](references/bounces-and-suppressions.md) |
| Write HTML that renders everywhere | [references/html-email.md](references/html-email.md) |
| CAN-SPAM, GDPR, unsubscribe obligations | [references/compliance.md](references/compliance.md) |
| Test before sending to real people | [references/testing.md](references/testing.md) |

## Diagnosing "it goes to spam"

Work in this order. Stopping early is the usual mistake — people rewrite subject lines when the real
problem is a missing DKIM record.

1. **Is the domain authenticated?** Check SPF, DKIM, and DMARC actually pass, not just that records
   exist. → [domain-authentication.md](references/domain-authentication.md)
2. **Did it actually get delivered?** A `delivered` event means the receiving server accepted it —
   spam foldering happens after that. No `delivered` event is a completely different problem.
3. **Is the recipient on a suppression list?** SendLayer error code 14 means the send was refused
   before it left. → [bounces-and-suppressions.md](references/bounces-and-suppressions.md)
4. **Is the domain new?** A domain with no sending history has no reputation. Warm up gradually.
5. **Is the content triggering filters?** Only now. Link shorteners, all-image bodies, mismatched
   `From` display names, and no plain-text alternative all hurt.

## SendLayer specifics that affect deliverability

| Fact | Why it matters |
|---|---|
| The `From` address must be on a domain verified in SendLayer | Unverified sends fail with error code 32. There is no way around it, and this is a feature. |
| **Always send a plain-text alternative** | Pass both `html` and `text`; SendLayer SDKs 1.1.0+ send both. A missing plain-text part is a real (small) spam-scoring penalty. SDKs 1.0.x silently dropped `text` — upgrade. See [html-email.md](references/html-email.md). |
| Error 14, "Recipient email is suppressed" | SendLayer already knows this address is bad. Treat it as permanent and remove the address; do not retry. |
| There is no idempotency key | A blind retry after a timeout can deliver twice. Duplicate mail annoys recipients and increases complaint rates. |
| Open and click tracking rewrites links | Tracked links point at SendLayer's domain, which is normal but means link reputation is partly shared. Do not also wrap them in a public URL shortener. |
| Webhooks give you bounce and complaint data in real time | This is how you keep your own suppression list current. Subscribe to `bounce` and `complaint` at minimum. |

## Common mistakes

| # | Mistake | Why it hurts |
|---|---|---|
| 1 | Sending bulk mail without DMARC | Gmail and Yahoo reject bulk mail from unauthenticated domains. Not filter — reject. |
| 2 | Sending marketing and transactional from the same subdomain | Marketing complaints degrade delivery of password resets. |
| 3 | Retrying a hard bounce | Repeated sends to known-bad addresses is the clearest spam signal there is. |
| 4 | Buying or scraping a list | Guarantees spam traps and complaints. Nothing recovers a domain from this quickly. |
| 5 | Blasting a new domain at full volume | No reputation means no benefit of the doubt. Warm up over weeks. |
| 6 | `From: noreply@` with no working reply path | Suppresses engagement signals and irritates recipients. Use a monitored address. |
| 7 | Unsubscribe that requires a login | Recipients hit "mark as spam" instead, which is far worse for you than an unsubscribe. |
| 8 | An all-image email | Images are blocked by default in many clients. The recipient sees nothing. |
| 9 | Ignoring the complaint webhook | Complaints are the strongest negative signal. You need them in real time. |
| 10 | Testing by sending to your own Gmail only | Your own mail is whitelisted by your prior engagement. It proves nothing. |
| 11 | Sending a receipt with a marketing footer and an unsubscribe link | Muddies the streams and can make a transactional message legally a marketing one. |
| 12 | Assuming a `delivered` event means the user saw it | It means a server accepted it. Spam foldering is invisible to you. |

## The bulk-sender requirements (Gmail and Yahoo, since Feb 2024)

If you send more than ~5,000 messages a day to Gmail addresses, these are mandatory:

- SPF **and** DKIM must pass.
- A DMARC record must exist (`p=none` is enough to start).
- The `From` domain must align with the SPF or DKIM domain.
- One-click unsubscribe via `List-Unsubscribe` and `List-Unsubscribe-Post` for promotional mail.
- Spam complaint rate must stay **below 0.3%**, ideally under 0.1%.
- Valid forward and reverse DNS on the sending IP.

Below 5,000/day these are strongly recommended rather than enforced — and the thresholds have only
moved in one direction historically. Build to them regardless.

Note that `List-Unsubscribe` headers can be set through SendLayer's custom `headers` parameter; see
[compliance.md](references/compliance.md).

## Resources

- Google sender guidelines: https://support.google.com/mail/answer/81126
- Gmail bulk sender rules: https://support.google.com/a/answer/81126
- Yahoo sender requirements: https://senders.yahooinc.com/best-practices/
- DMARC overview: https://dmarc.org/
- SendLayer domain authorization: https://sendlayer.com/docs/authorizing-your-domain/
- CAN-SPAM compliance guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
