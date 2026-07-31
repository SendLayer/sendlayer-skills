# Transactional vs marketing

Which stream a message belongs to determines the infrastructure it should use, the consent it
requires, and the law that applies to it. Getting this wrong is both a deliverability and a legal
problem.

## The distinction

| | Transactional | Marketing |
|---|---|---|
| Trigger | a specific action by that specific person | your schedule or a campaign |
| Consent needed | implied by the relationship | **explicit opt-in** |
| Unsubscribe link | not required, usually inappropriate | **required** |
| Expected latency | seconds | whenever |
| Volume | one at a time | bulk |
| CAN-SPAM applies | mostly exempt | fully |
| GDPR basis | contract / legitimate interest | consent |

**The test:** did this person do something that makes them expect this exact message right now? Yes
is transactional. No is marketing.

## Examples

**Transactional** — password reset, email verification, order confirmation, shipping notification,
receipt, invoice, appointment reminder, security alert, account change notice, 2FA code,
support-ticket reply, contract expiry notice.

**Marketing** — newsletter, product announcement, promotion or sale, abandoned-cart reminder,
re-engagement campaign, upsell, survey request, referral ask, webinar invitation.

## The genuinely ambiguous cases

| Message | Verdict | Reasoning |
|---|---|---|
| Abandoned cart | **Marketing** | The user chose not to buy. This is promotional. Requires opt-in and unsubscribe. |
| "Your trial ends in 3 days" | Transactional | Factual account status, tied to their contract. |
| "Your trial ends — upgrade for 20% off" | **Marketing** | The discount makes it promotional. |
| Onboarding drip series | Marketing | Scheduled by you, not triggered by them. Needs an unsubscribe link. |
| "New feature available" | Marketing | Product news is promotional. |
| "We're deprecating the API you use" | Transactional | Service-affecting notice about their actual usage. |
| Password reset | Transactional | Always. |
| Receipt with a "you may also like" block | **Contaminated** | See below. |
| Annual privacy-policy update | Transactional | Legal obligation. |
| NPS or satisfaction survey | Marketing | Requires opt-in. |

The bias should be toward classifying as marketing when unsure. Treating marketing as transactional
carries legal risk; the reverse just costs you an unsubscribe link.

## Never mix them in one message

A receipt with a promotional footer is the classic error. Consequences:

- Under CAN-SPAM, promotional content can make the whole message a commercial one, subject to
  unsubscribe requirements.
- You now have to offer an unsubscribe on a receipt — and honoring it means you cannot send them
  receipts, which you are obliged to send.
- Recipients who dislike the promotion mark the receipt as spam, damaging the reputation of the
  stream carrying your password resets.

Keep receipts clean. Send the promotion separately, to people who opted in.

## Separate infrastructure

This is the concrete implementation. Use separate subdomains:

| Subdomain | Traffic |
|---|---|
| `mail.yourdomain.com` | transactional |
| `news.yourdomain.com` | marketing |
| `yourdomain.com` | human email only |

Reputation attaches to the sending domain. A marketing campaign that generates complaints must not
be able to stop password resets from arriving — and if they share a subdomain, it can.

For significant volume, use separate SendLayer accounts or API keys per stream so the reputations are
fully independent and you can revoke one without touching the other.

In code, make the stream explicit rather than implicit:

```js
const TRANSACTIONAL_FROM = 'Acme <notifications@mail.yourdomain.com>';
const MARKETING_FROM = 'Acme <news@news.yourdomain.com>';

function sendTransactional({ to, subject, html }) {
  return sendlayer.Emails.send({
    from: TRANSACTIONAL_FROM,
    to,
    subject,
    html,
    tags: ['transactional'],
  });
}

async function sendMarketing({ to, subject, html, unsubscribeUrl }) {
  if (!(await hasMarketingConsent(to))) {
    throw new Error(`No marketing consent for ${to}`);
  }
  return sendlayer.Emails.send({
    from: MARKETING_FROM,
    to,
    subject,
    html,                       // must contain a visible unsubscribe link
    tags: ['marketing'],
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:unsubscribe@yourdomain.com>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}
```

Two things worth copying from that: the consent check is inside the marketing function so it cannot
be forgotten, and SendLayer `tags` record the stream so you can filter events per stream later.

## Consent

**Transactional** — implied by the relationship. Someone who bought something expects a receipt. No
separate opt-in needed, and no unsubscribe (they cannot opt out of receipts while continuing to buy).

**Marketing** — explicit opt-in required. Specifically:

- An unchecked checkbox at signup, not pre-checked, not bundled into the terms of service.
- Separate from account creation. "Create account" is not consent to a newsletter.
- Recorded: what they consented to, when, and how. You need to be able to prove it.
- **Double opt-in** for anything high-volume — a confirmation email they must click. It costs you
  some list size and buys you far better engagement and near-zero spam-trap risk.

A purchased list is never consent, regardless of what the seller claims.

## Suppression differs by stream

An unsubscribe from marketing must **not** stop transactional mail. Model them separately:

```
users
  email
  marketing_consent      boolean
  marketing_opted_out_at timestamp
  hard_bounced_at        timestamp      -- blocks EVERYTHING
  complained_at          timestamp      -- blocks everything
```

Rules:

- `marketing_opted_out_at` set → no marketing, transactional continues.
- `hard_bounced_at` or `complained_at` set → **nothing**, including transactional. The address does
  not work, or the person considers your mail abusive.

Sending marketing to someone who unsubscribed is a legal violation. Sending transactional mail to
someone who unsubscribed from marketing is correct and expected. See
[bounces-and-suppressions.md](bounces-and-suppressions.md).

## Checklist

- [ ] Every send is explicitly classified in code
- [ ] Separate subdomains per stream
- [ ] Marketing sends check consent before sending
- [ ] Marketing sends include a visible unsubscribe link and `List-Unsubscribe` headers
- [ ] No promotional content in transactional messages
- [ ] Marketing opt-out does not block transactional mail
- [ ] Hard bounces and complaints block both streams
- [ ] Consent records are stored and auditable
