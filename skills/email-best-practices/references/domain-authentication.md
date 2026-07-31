# Domain authentication — SPF, DKIM, DMARC

The foundation. Without these, bulk mail to Gmail and Yahoo is **rejected**, and everything else you
do about deliverability is wasted effort.

## What each one does

| | Answers | Mechanism |
|---|---|---|
| **SPF** | "Is this server allowed to send for this domain?" | A DNS TXT record listing authorized senders. |
| **DKIM** | "Was this message altered, and does the domain vouch for it?" | A cryptographic signature; the public key lives in DNS. |
| **DMARC** | "What should I do when SPF and DKIM fail?" | A DNS policy record, plus reporting. |

You need all three. SPF alone has been insufficient for years — it breaks on forwarding, which DKIM
survives.

## Setting up with SendLayer

SendLayer generates the exact records for your domain. Follow
https://sendlayer.com/docs/authorizing-your-domain/ — do not hand-craft them from a generic template.

Order of operations:

1. Add the domain in the SendLayer dashboard.
2. Add the DNS records it gives you (SPF, DKIM, and usually a tracking CNAME).
3. Wait for propagation — minutes usually, up to 48 hours.
4. Confirm the domain shows as verified.
5. Add your own DMARC record (see below).
6. Send a test and verify all three pass.

Until the domain is verified, every send fails with **error code 32, "Domain is not activated"**.
This is the single most common cause of "my first SendLayer send doesn't work".

## Use a subdomain

Send from `mail.yourdomain.com` or `notifications.yourdomain.com`, not the bare `yourdomain.com`.

Why: sending reputation attaches to the domain that sends. If a marketing campaign generates
complaints on the bare domain, it can affect your employees' regular business email. A subdomain
isolates that.

A good split:

| Subdomain | Traffic |
|---|---|
| `mail.yourdomain.com` | transactional — receipts, resets, alerts |
| `news.yourdomain.com` | marketing — newsletters, campaigns |
| `yourdomain.com` | human email only; never automated sending |

Each subdomain builds its own reputation, so a bad campaign cannot take down password resets.

## SPF

One TXT record on the sending domain. SendLayer will tell you what to include.

```
v=spf1 include:_spf.sendlayer.com ~all
```

Rules that trip people up:

- **One SPF record per domain.** Two `v=spf1` records is a permanent failure — merge them into one
  with multiple `include:` terms.
- **Ten DNS lookup limit.** Each `include:` costs lookups. Chaining several providers overruns it and
  SPF hard-fails. Flatten or reduce.
- `~all` (softfail) is the normal ending. `-all` (hardfail) is stricter and riskier while you are
  still discovering which services send as you.

Check the actual record rather than trusting your DNS panel:

```sh
dig +short TXT mail.yourdomain.com | grep spf1
```

## DKIM

SendLayer provides a selector and public key; you add it as a TXT (or CNAME) record at
`<selector>._domainkey.mail.yourdomain.com`.

```sh
dig +short TXT sl._domainkey.mail.yourdomain.com
```

(The selector name comes from SendLayer — do not guess it.)

DKIM matters more than SPF because it survives forwarding: a mailing list that relays your message
breaks SPF but leaves the DKIM signature intact.

Rotate keys periodically if your provider supports it.

## DMARC

You add this one yourself. TXT record at `_dmarc.yourdomain.com`.

Start in monitoring mode:

```
v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com; pct=100
```

`p=none` changes nothing about delivery — it only asks receivers to send you reports. That is
exactly what you want at first, because the reports reveal every service sending as your domain,
including the ones you forgot.

Then tighten over weeks, once reports are clean:

| Stage | Policy | Effect |
|---|---|---|
| 1. Monitor | `p=none` | Reports only. Run for 2–4 weeks. |
| 2. Partial | `p=quarantine; pct=25` | 25% of failures go to spam. Ramp to 100. |
| 3. Enforce | `p=reject` | Failures are rejected outright. |

Do not jump to `p=reject`. If a legitimate service is unauthenticated, you will silently destroy
your own mail.

Verify:

```sh
dig +short TXT _dmarc.yourdomain.com
```

### Alignment

DMARC passes only if SPF or DKIM passes **and** the passing domain aligns with the `From` domain.

This is why the `From` address matters: sending `From: you@yourdomain.com` while DKIM signs for
`mail.yourdomain.com` gives relaxed alignment (fine by default) but not strict. Since SendLayer
requires the `From` domain to be one you verified, alignment usually takes care of itself — but check
it rather than assuming.

## Verifying it all works

The reliable test: send a real message to a Gmail address you control, open it, and use
**Show original**. You want:

```
SPF:   PASS with IP …
DKIM:  PASS with domain mail.yourdomain.com
DMARC: PASS
```

Three `PASS` lines is the goal. Anything else, fix before sending volume.

Faster automated checks:

- Send to `check-auth@verifier.port25.com` — it replies with a full authentication report.
- https://www.mail-tester.com/ — send to the address it gives you, get a score and a breakdown.
- https://dmarcian.com/dmarc-inspector/ and https://mxtoolbox.com/spf.aspx for record syntax.

Run mail-tester after any DNS change. A 10/10 there is not a delivery guarantee, but below 8 means
something concrete is wrong.

## BIMI (optional)

Displays your logo next to the message in supporting clients. Requires `p=quarantine` or `p=reject`
DMARC plus a Verified Mark Certificate, which costs money annually. Purely cosmetic — do it only
after everything above is solid and enforcing.

## Checklist

- [ ] Sending from a subdomain, not the bare domain
- [ ] Domain shows verified in SendLayer
- [ ] Exactly one SPF record, under 10 DNS lookups
- [ ] DKIM record present and signing
- [ ] DMARC record present, starting at `p=none`
- [ ] All three show PASS in Gmail's Show original
- [ ] DMARC reports going to a mailbox someone reads
- [ ] Separate subdomains for transactional and marketing
