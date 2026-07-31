# Testing email

Email cannot be rolled back. Once it is sent it is sent, to real people, and a mistake is visible to
your entire list. Test accordingly.

## Never send test mail to real recipients

The first rule. Every environment other than production must be incapable of emailing a customer.

```js
const ALLOWED_TEST_DOMAINS = ['yourdomain.com', 'example.com'];

function assertSafeRecipient(email) {
  if (process.env.NODE_ENV === 'production') return;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!ALLOWED_TEST_DOMAINS.includes(domain)) {
    throw new Error(`Refusing to send to ${email} outside production`);
  }
}
```

Better still, use a separate SendLayer API key for non-production, so a leaked staging config cannot
touch your production sending reputation.

## Levels of testing

| Level | What it catches | Cost |
|---|---|---|
| Unit — mock the client | wrong parameters, missing fields, logic errors | free, fast |
| Snapshot the payload | accidental template or field changes | free, fast |
| Render locally to a browser | gross layout errors | free |
| Send to a seed inbox | real rendering, authentication, spam scoring | one real send |
| Cross-client preview service | Outlook and dark-mode breakage | paid |

Do all of them. The first two belong in CI.

## Unit testing

Assert on what you pass, without hitting the network:

```js
import { describe, expect, it, vi } from 'vitest';

const send = vi.fn().mockResolvedValue({ MessageID: 'test-message-id' });
vi.mock('sendlayer', () => ({
  SendLayer: class { Emails = { send }; },
}));

describe('order confirmation', () => {
  it('sends from the transactional subdomain with the right tag', async () => {
    await sendOrderConfirmation({ email: 'customer@example.com', orderId: '12345' });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Acme <notifications@mail.yourdomain.com>',
        to: 'customer@example.com',
        subject: 'Order #12345 confirmed',
        tags: ['transactional'],
      }),
    );
  });

  it('refuses to send to a suppressed address', async () => {
    await suppress('bounced@example.com', 'hard_bounce', 'all');
    const result = await sendOrderConfirmation({ email: 'bounced@example.com', orderId: '1' });

    expect(result.skipped).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});
```

That second test is the one that matters. Suppression checks are easy to add and easy to
accidentally bypass later; a test pins the behavior.

Also worth asserting: that marketing sends refuse without consent, and that `html` output contains an
unsubscribe link.

## Snapshot the payload

Catches unintended template changes:

```js
it('matches the order confirmation payload', async () => {
  await sendOrderConfirmation({ email: 'customer@example.com', orderId: '12345' });
  expect(send.mock.calls[0][0]).toMatchSnapshot();
});
```

Freeze anything time- or ID-dependent first, or the snapshot churns on every run.

## Seed inboxes

A small set of real addresses you send every new template to before any list. Cover:

- Gmail (web and mobile app)
- Outlook.com
- Apple Mail (macOS and iOS)
- Outlook on Windows — **the one that actually breaks**
- Yahoo Mail
- One dark-mode client

Check: rendering, images blocked, dark mode, the preheader in the inbox list, the unsubscribe link,
and all three authentication `PASS` lines via Gmail's **Show original**.

**Your own Gmail is not a valid deliverability test.** Your prior engagement with your own mail
whitelists it. It tells you about rendering, nothing about inbox placement.

## Spam scoring

https://www.mail-tester.com/ gives you an address, you send to it, you get a score and a breakdown.
Free for a few checks a day.

Run it after any DNS change and before any large campaign. Below 8/10 means something concrete is
wrong. A 10/10 is not a delivery guarantee — it does not measure your reputation, only the message
and its authentication.

`check-auth@verifier.port25.com` auto-replies with a detailed SPF/DKIM/DMARC report.

## Cross-client rendering

Manual testing across every client is impractical. Paid services screenshot dozens at once — Litmus,
Email on Acid, Testi@. Worth it if you ship templates regularly.

If not paying: test Gmail, Apple Mail, and Outlook Windows manually. That covers the large majority
of real-world breakage.

## Staging with SendLayer

There is no sandbox mode that accepts sends without delivering them. Options:

1. **A separate API key plus a recipient allowlist** (the code above). Simple and effective.
2. **Route to a catch-all inbox** in non-production — rewrite every recipient to
   `staging+<original>@yourdomain.com`.
3. **Mock at the client boundary** so no request leaves the process, for CI.

Option 1 plus 3 covers most needs: mocks in CI, allowlisted real sends when a human is checking
rendering.

## Testing webhooks locally

Do not poll `events list` in a loop. Use the CLI's listener, which registers temporary webhooks and
cleans them up:

```sh
ngrok http 4000
sendlayer webhooks listen --port 4000 \
  --public-url https://abc123.ngrok.io \
  --forward-to http://localhost:3000/webhooks/sendlayer
```

See the `sendlayer-cli` skill. Note it does not create the tunnel for you.

For handler unit tests, no network is needed — post a realistic payload. Get the nesting right, or
you will test a shape SendLayer never sends:

```js
const bouncePayload = {
  event: {
    method: 'POST',
    body: {
      Signature: { Timestamp: 1758100959, Token: 'tok', Signature: 'sig' },
      EventData: {
        Event: 'bounced',                 // past tense, not 'bounce'
        EventType: 'failed',
        Domain: 'example.com',
        MessageID: '4331c06-2d1d-4387-969e-697835',
        BouncedEmailAddress: {
          EmailAddress: 'bad@example.com',
          Status: 'smtp;550 5.1.1 User Unknown',
          DiagnosticCode: '5.1.1 (bad destination mailbox address)',
        },
        Reason: 'smtp;550 5.1.1 User Unknown',
      },
    },
  },
};

it('suppresses a hard bounce', async () => {
  await request(app).post('/webhooks/sendlayer').send(bouncePayload).expect(200);
  expect(await findSuppression('bad@example.com')).toMatchObject({
    reason: 'hard_bounce',
    scope: 'all',
  });
});
```

Test the retry case too — SendLayer redelivers, so post the same payload twice and assert the handler
is idempotent.

## Testing a bounce deliberately

Send to an address you know does not exist at a real domain you control, e.g.
`definitely-not-a-real-mailbox@yourdomain.com`. You get a genuine hard bounce and can verify the
whole path.

Do this **once or twice**, not repeatedly. Deliberate hard bounces damage your sending reputation.
Never use someone else's domain for this.

## Pre-launch checklist

Before any campaign or new template:

- [ ] Unit tests pass; payload snapshot reviewed
- [ ] Sent to seed inboxes and visually checked
- [ ] Checked with images blocked
- [ ] Checked in dark mode
- [ ] Checked in Outlook on Windows
- [ ] Preheader reads correctly in the inbox list
- [ ] Every link clicked and verified — including the unsubscribe
- [ ] Unsubscribe endpoint accepts POST without auth
- [ ] mail-tester score ≥ 8
- [ ] SPF, DKIM, DMARC all PASS
- [ ] Suppression list applied to the send
- [ ] Recipient count is what you expect (check it twice)
- [ ] `From` and `Reply-To` correct, on the right subdomain
- [ ] Someone other than the author has read the copy
