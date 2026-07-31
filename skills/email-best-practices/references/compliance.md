# Compliance

Not legal advice. These are the operational requirements engineers are responsible for; consult
counsel for your specific situation.

## CAN-SPAM (United States)

Applies to commercial email. Transactional and relationship messages are largely exempt from the
content rules, but the deception prohibitions apply to everything.

Required for commercial mail:

| Requirement | Implementation |
|---|---|
| Accurate `From`, `Reply-To`, and routing | Real, verified sending domain. |
| Non-deceptive subject line | It must describe the actual content. |
| Identify the message as an advertisement | Clear from context is sufficient in practice. |
| A valid physical postal address | In the footer. A PO box or registered agent address is acceptable. |
| A working opt-out mechanism | Visible unsubscribe link. |
| Honor opt-outs within **10 business days** | Do it immediately; 10 days is the ceiling, not a target. |
| Opt-out must not require a fee, login, or information beyond an address | One click. |
| You remain liable for what you hire others to send | Vet any agency or affiliate. |

Penalties run to five figures per individual email, so this is not a theoretical risk.

**No opt-in requirement.** CAN-SPAM is opt-out, unlike GDPR. But opt-in is still the right practice
for deliverability, regardless of the legal floor.

## GDPR (EU/EEA) and UK GDPR

Email addresses are personal data. You need a lawful basis for processing.

| Purpose | Typical basis |
|---|---|
| Transactional email | performance of a contract |
| Marketing to customers | legitimate interest (narrow) or consent |
| Marketing to non-customers | **consent** |

Consent under GDPR must be freely given, specific, informed, and unambiguous, requiring a clear
affirmative action. Concretely:

- **Unchecked** checkbox. A pre-checked box is not consent.
- **Separate** from the terms of service. Bundling is not consent.
- **Specific** about what they will receive.
- **Recorded** — what, when, how, and what text they agreed to. You bear the burden of proof.
- **Withdrawable** as easily as it was given.

Also required:

- Right to erasure — but keep a minimal suppression record; you need it to honor the opt-out itself,
  and that is a legitimate interest.
- Right of access — be able to export what you hold about an address.
- Data processing agreement with your email provider.
- Privacy policy explaining what you collect and why.
- Breach notification within 72 hours.

The soft opt-in under PECR lets you email existing customers about similar products without prior
consent, provided you offered an opt-out at collection and in every message. It is narrower than
people assume — it does not cover unrelated products or non-customers.

## Gmail and Yahoo bulk sender requirements

Since February 2024, enforced for senders above ~5,000 messages/day to Gmail addresses. These are
technical requirements, not law, but non-compliance means your mail does not arrive.

- SPF **and** DKIM must pass.
- DMARC record must exist (`p=none` suffices).
- `From` domain must align with the SPF or DKIM domain.
- **One-click unsubscribe** via `List-Unsubscribe` and `List-Unsubscribe-Post` for promotional mail.
- Unsubscribes honored within **2 days**.
- Spam complaint rate below **0.3%**; target under 0.1%.
- Valid forward and reverse DNS on the sending IP.

→ [domain-authentication.md](domain-authentication.md)

## One-click unsubscribe

Two headers together. Set them through SendLayer's `headers` parameter:

```js
await sendlayer.Emails.send({
  from: 'Acme <news@news.yourdomain.com>',
  to: recipient.email,
  subject: 'This month at Acme',
  html: bodyHtml,                       // must ALSO contain a visible unsubscribe link
  tags: ['marketing'],
  headers: {
    'List-Unsubscribe': `<https://yourdomain.com/unsubscribe?token=${token}>, <mailto:unsubscribe@yourdomain.com?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
});
```

Requirements that are easy to get wrong:

- Both headers, or one-click does not work. `List-Unsubscribe` alone gives you the old two-step flow.
- The URL must accept a **`POST`** with no confirmation page and no login. Gmail POSTs it directly.
- Angle brackets around each value, comma-separated.
- The token must identify the subscriber without authentication — signed and single-purpose, not a
  raw user ID.
- **These headers do not replace the visible link in the body.** You need both.

Handler:

```js
// Must accept POST with no auth and no confirmation step
app.post('/unsubscribe', async (req, res) => {
  const token = req.query.token ?? req.body?.token;
  const email = verifyUnsubscribeToken(token);   // signed token -> address
  if (email) {
    await suppress(email, 'unsubscribe', 'marketing');
  }
  res.sendStatus(200);   // always 200; never redirect, never challenge
});

// Keep a GET for the visible link in the email body
app.get('/unsubscribe', async (req, res) => {
  const email = verifyUnsubscribeToken(req.query.token);
  if (email) await suppress(email, 'unsubscribe', 'marketing');
  res.send('You have been unsubscribed.');
});
```

Scope the suppression to `marketing` — an unsubscribe must not stop receipts or password resets. See
[bounces-and-suppressions.md](bounces-and-suppressions.md).

## Unsubscribe done right

- **One click, no login, no survey.** Anything harder and people press "mark as spam" instead, which
  hurts you far more than losing a subscriber.
- **Immediate.** Not "within 10 days" — immediate. Then confirm on screen.
- **No re-confirmation email.** Sending mail to someone who just unsubscribed is exactly what they
  asked you not to do.
- **A preference centre is fine as an option**, not as the only path. There must be an
  unsubscribe-from-everything choice on the first screen.

## Other jurisdictions

| Law | Region | Notable |
|---|---|---|
| **CASL** | Canada | Express opt-in required. Penalties up to CAD $10M. Stricter than CAN-SPAM. |
| **PECR** | UK | Sits alongside UK GDPR; governs the soft opt-in. |
| **LGPD** | Brazil | GDPR-like. |
| **Spam Act 2003** | Australia | Consent, identification, functional unsubscribe. |
| **PDPA** | Singapore | Consent plus a Do Not Call registry. |
| **CCPA/CPRA** | California | Access and deletion rights; "sale" of data has a specific meaning. |

If you send internationally, build to the strictest applicable — practically, GDPR plus CASL.
Explicit opt-in, recorded consent, immediate one-click unsubscribe, and a physical address satisfies
almost everything.

## Data retention

- Do not keep addresses forever "just in case". Set a retention period tied to the purpose.
- Prune recipients inactive for 12+ months — good for both compliance and deliverability.
- **Keep suppression records indefinitely.** They exist to honor an opt-out; deleting one lets a bad
  address back in.
- Consent records: keep for as long as you rely on the consent, plus your limitation period.

## Implementation checklist

- [ ] Marketing consent is unchecked, separate, and specific
- [ ] Consent recorded with timestamp, source, and the text shown
- [ ] Visible unsubscribe link in every marketing email
- [ ] `List-Unsubscribe` **and** `List-Unsubscribe-Post` headers set
- [ ] Unsubscribe endpoint accepts POST, no auth, no confirmation
- [ ] Unsubscribes processed immediately
- [ ] Unsubscribe scoped to marketing, not transactional
- [ ] Physical postal address in the marketing footer
- [ ] Accurate `From` and a monitored `Reply-To`
- [ ] Subject lines describe the actual content
- [ ] SPF, DKIM, DMARC passing
- [ ] Complaint rate monitored, under 0.1%
- [ ] Privacy policy covers email use
- [ ] DPA in place with your provider
- [ ] Retention policy defined; suppression records exempt from deletion
