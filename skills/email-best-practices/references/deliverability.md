# Deliverability

Getting into the inbox. Delivery and inbox placement are different things: a `delivered` event means
a server accepted the message, not that anyone saw it.

## Diagnose in this order

Most people start at step 5 and rewrite their subject line. Start at step 1.

### 1. Is the domain authenticated?

SPF, DKIM, and DMARC must **pass**, not merely exist. Send to a Gmail account, open **Show
original**, confirm three `PASS` lines. → [domain-authentication.md](domain-authentication.md)

If any fails, stop here. Nothing else matters.

### 2. Was it actually delivered?

```sh
sendlayer events list --message-id "$MSG" --json | jq -r '.Events[].Event'
```

| Result | Meaning |
|---|---|
| no events | The send never registered. Check the send call's own response. |
| `rejected` / `failed` | The receiving server refused it. Read `Reason` for the SMTP response. |
| `accepted` only | In flight. Wait. |
| `delivered` | Accepted by the recipient's server. Any spam foldering happened after this, invisibly. |

`delivered` plus "I don't see it" means a filtering problem, so continue.

### 3. Is the recipient suppressed?

SendLayer error code **14** means SendLayer refused the send because the address previously bounced
or complained. → [bounces-and-suppressions.md](bounces-and-suppressions.md)

### 4. Does the domain have any reputation?

A domain that has never sent mail has no history, and receivers treat unknown senders with
suspicion. A brand-new domain sending 50,000 messages on day one will be filtered regardless of
correct authentication.

Warm up:

| Week | Daily volume |
|---|---|
| 1 | 50–100 |
| 2 | 500 |
| 3 | 2,000 |
| 4 | 10,000 |
| 5+ | double weekly while complaint rate stays low |

Send to your most engaged recipients first — opens and clicks are the positive signal that builds
reputation. Sending first to your least engaged segment does the opposite.

### 5. Now look at content

Only now. Common triggers:

- **All-image email with no text.** Images are blocked by default in many clients; the recipient sees
  an empty message.
- **Link shorteners** (`bit.ly`, `t.co`). Heavily abused, heavily penalized. Use your own domain.
- **No plain-text alternative.** A small penalty — and one SendLayer's SDKs make unavoidable, see
  below.
- **Mismatched `From` display name and address.** `"PayPal Support" <noreply@random.com>` looks like
  phishing because it is the shape of phishing.
- **Excessive punctuation and capitals.** `FREE!!! ACT NOW!!!` is the cliché but it is still scored.
- **Attachments on first contact**, especially `.zip` or `.html`.
- **A single tracking pixel and nothing else.**

Content is real but secondary. A well-authenticated domain with good engagement gets a lot of
latitude; a poorly authenticated one gets none regardless of prose.

## The plain-text problem with SendLayer

Every SendLayer SDK transmits **either** `HTMLContent` **or** `PlainContent`, never both. Passing
`html` silently discards `text`.

So you cannot ship a `multipart/alternative` message through the SDK. Practical responses:

1. **Write HTML that degrades well** — real text in the body, not text baked into images. This
   recovers most of the benefit.
2. **Call the REST API directly** if you want to attempt both fields, and verify against a real
   inbox before relying on it. The documented schema does not describe multipart behaviour, so treat
   it as unverified.
3. **Do not claim a fallback you do not have.** If someone asks for "HTML with a plain-text
   alternative", tell them the SDK cannot do it.

The penalty is modest. Do not let it stop a launch — but do not pretend it is handled.

## Engagement is the strongest signal

Modern filtering is dominated by recipient behavior:

**Positive** — opens, clicks, replies, moving out of spam, adding to contacts.
**Negative** — spam marking, deleting unread, ignoring repeatedly.

The practical consequences:

- **Send less, to people who want it.** A 2,000-recipient list that engages beats a 50,000-recipient
  list that does not, both for revenue and for reputation.
- **Prune inactive recipients.** Someone who has not opened anything in a year is pure downside:
  no benefit, real risk of a spam trap or a complaint.
- **Use a monitored reply address.** `noreply@` suppresses replies, which are a strong positive
  signal. `support@` with a real inbox is better.
- **Segment by engagement.** Never send a re-engagement campaign to your whole list at once.

## Spam traps

Addresses that exist only to catch senders who did not get permission. Hitting one is severe and
recovery is slow.

Sources: purchased lists (guaranteed), scraped addresses, old addresses that were recycled into
traps, and typo'd domains.

Avoid by never buying a list, using double opt-in for marketing, validating addresses at signup, and
removing long-inactive recipients.

## Volume and consistency

Sudden spikes look like a compromised account. 100/day for a month then 50,000 in an hour will be
throttled even with perfect authentication. Ramp gradually and keep volume steady — a predictable
pattern is itself a positive signal.

## Monitoring

Watch these continuously, not after a problem:

| Metric | Target | Source |
|---|---|---|
| Delivery rate | > 95% | `delivered` ÷ sent |
| Bounce rate | < 2% (hard bounces < 0.5%) | `failed` events |
| Complaint rate | **< 0.1%**, hard ceiling 0.3% | `complaint` webhook |
| Open rate | varies; watch the trend, not the number | `opened` events |

Complaint rate is the one that gets you blocked. Gmail enforces 0.3%; treat 0.1% as your limit.

Automate it:

```sh
sendlayer events list --event failed --limit 100 --json \
  | jq -r '.Events[].Reason' | sort | uniq -c | sort -rn
```

A single reason dominating the list is a systemic problem — one bad domain, one misconfigured
record — not scattered bad addresses.

Also register for the free postmaster tools; they show you what receivers actually think of you:

- Google Postmaster Tools: https://postmaster.google.com/
- Microsoft SNDS: https://sendersupport.olc.protection.outlook.com/snds/

## Recovering a damaged reputation

Slow, and there is no shortcut.

1. **Stop.** Pause the campaigns causing complaints.
2. **Find the cause** — usually a purchased list, a stale segment, or a broken unsubscribe.
3. **Clean the list aggressively.** Remove every bounce, complaint, and anyone inactive for 6+
   months.
4. **Restart small**, to your most engaged recipients only, at warm-up volumes.
5. **Rebuild over weeks.** Expect a month or more.

Do not switch to a new domain to escape. Receivers correlate them, a brand-new domain has no
reputation anyway, and you will have burned two domains instead of one.

## Checklist

- [ ] SPF, DKIM, DMARC all PASS in Gmail's Show original
- [ ] Sending from a subdomain
- [ ] Transactional and marketing on separate subdomains
- [ ] Bounces and complaints suppressed automatically via webhooks
- [ ] Complaint rate under 0.1%
- [ ] No purchased or scraped addresses, ever
- [ ] Inactive recipients pruned regularly
- [ ] Warm-up plan for any new domain
- [ ] Reply-to is a monitored mailbox
- [ ] Postmaster Tools and SNDS registered
