# Bounces, complaints, and suppression

The single highest-leverage deliverability practice: **never send to an address that has bounced or
complained.** Repeatedly mailing known-bad addresses is the clearest spam signal a receiver has.

## Hard vs soft bounces

| | Hard bounce | Soft bounce |
|---|---|---|
| Cause | address does not exist, domain invalid, blocked permanently | mailbox full, server down, message too large, temporary throttling |
| SMTP class | `5.x.x` | `4.x.x` |
| Retry? | **never** | yes, with backoff |
| Action | suppress permanently, immediately | retry, then suppress after repeated failures |

SendLayer reports both as the `failed` event type in history (there is no `bounce` history event) and
via the `bounce` webhook. Classify by reading the SMTP status.

```
smtp;550 5.1.1 User Unknown              → hard, suppress now
smtp;552 5.2.2 Mailbox full              → soft, retry later
smtp;421 4.7.0 Try again later           → soft, throttling
smtp;550 5.7.1 Message rejected as spam  → hard for reputation purposes; investigate urgently
```

The heuristic: `5.x.x` is permanent, `4.x.x` is temporary. `5.7.1` specifically means you were
treated as spam — that is not a bad address, it is a reputation problem, and you should stop and
investigate rather than retry.

## Complaints matter more than bounces

A complaint means the recipient pressed "mark as spam". This is the strongest negative signal in
email, and Gmail enforces a hard ceiling:

| Complaint rate | Standing |
|---|---|
| < 0.1% | healthy |
| 0.1–0.3% | at risk |
| **> 0.3%** | Gmail throttles or blocks you |

At 0.3% you are in trouble; treat 0.1% as your operational limit. **Always suppress a complainer
permanently**, including for transactional mail — they have told you your mail is unwanted, and
continuing is what escalates from throttling to blocking.

## SendLayer's own suppression list

SendLayer maintains one. When you try to send to a suppressed address you get:

```
Code 14: Recipient email is suppressed
```

This means SendLayer already knows the address is bad and refused before sending. **Treat it as
permanent.** Do not retry, and do not treat it as a transient failure — add the address to your own
suppression list too, since a code 14 in your logs means you tried to send somewhere you should not
have.

## Keep your own list anyway

Relying on SendLayer's alone is not enough. You want your own because:

- You avoid wasted API calls and error-handling paths.
- You can distinguish marketing opt-outs (which must not block transactional) from hard failures
  (which block everything).
- You keep the record if you ever change provider.
- You can audit and prove what you did.

Minimum schema:

```sql
CREATE TABLE email_suppressions (
  email       TEXT PRIMARY KEY,
  reason      TEXT NOT NULL,   -- hard_bounce | complaint | unsubscribe | manual
  scope       TEXT NOT NULL,   -- all | marketing
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detail      TEXT             -- SMTP reason, diagnostic code
);
```

`scope` is the important column:

| reason | scope | blocks |
|---|---|---|
| `hard_bounce` | `all` | everything, including transactional |
| `complaint` | `all` | everything |
| `unsubscribe` | `marketing` | marketing only — transactional continues |
| `manual` | either | your call |

Check before every send:

```js
async function sendSafely({ to, stream, ...params }) {
  const suppression = await findSuppression(to);
  if (suppression && (suppression.scope === 'all' || suppression.scope === stream)) {
    // Not an error — an expected outcome. Log it, do not throw and retry.
    log.info('suppressed', { to, reason: suppression.reason });
    return { skipped: true, reason: suppression.reason };
  }
  return sendlayer.Emails.send({ to, ...params });
}
```

Returning rather than throwing matters: a suppressed recipient is a normal outcome, and code that
throws here tends to get wrapped in a retry loop.

## Populate it from webhooks

Real-time, via the `bounce` and `complaint` webhooks. Subscribe to both at minimum:

```sh
sendlayer webhooks create --url https://yourapp.com/webhooks/sendlayer --event bounce
sendlayer webhooks create --url https://yourapp.com/webhooks/sendlayer --event complaint
```

Handler — note the payload nesting and the past-tense event names:

```js
app.post('/webhooks/sendlayer', (req, res) => {
  res.sendStatus(200);   // acknowledge first; SendLayer retries slow endpoints

  const data = req.body?.event?.body?.EventData;
  if (!data) return;

  if (data.Event === 'bounced') {
    // A bounce has NO top-level To — the address is nested
    const email = data.BouncedEmailAddress?.EmailAddress;
    const status = data.BouncedEmailAddress?.Status ?? data.Reason ?? '';

    if (/^\s*smtp;\s*5/.test(status) || /\b5\.\d+\.\d+/.test(status)) {
      suppress(email, 'hard_bounce', 'all', status);      // permanent
    } else {
      recordSoftBounce(email, status);                     // suppress after N
    }
  }

  if (data.Event === 'complained') {
    suppress(data.To, 'complaint', 'all', 'marked as spam');
  }

  if (data.Event === 'unsubscribed') {
    suppress(data.To, 'unsubscribe', 'marketing', null);   // marketing only
  }
});
```

Three things that bite here: the payload is at `event.body.EventData`, not `body.EventData`; the
event name is `bounced` even though you subscribed to `bounce`; and a bounce has no `To` field.

Make the handler **idempotent** — SendLayer retries, so the same event will arrive more than once.
An upsert on the suppression table handles it.

## Soft bounce policy

Do not suppress on the first soft bounce — a full mailbox gets emptied, a downed server comes back.

A workable policy: count consecutive soft bounces per address; suppress as a hard bounce after 5
consecutive, or after soft-bouncing for 72 hours straight. Reset the counter on any successful
delivery.

## Backfilling from history

If you did not have webhooks running, reconstruct from event history:

```sh
sendlayer events list --event failed --limit 100 --json \
  | jq -r '.Events[] | [.Message.Headers.To[0], .Reason] | @tsv'
```

The CLI cannot paginate past 100 records, so narrow with `--start`/`--end` and walk backwards, or use
an SDK with `startFrom` (PHP, Python, Ruby, Go).

## Never do these

- **Re-import a list you previously cleaned.** This silently resurrects every suppressed address and
  is the most common way a recovered domain gets re-blocked.
- **Retry a hard bounce.** It will never succeed and each attempt is a negative signal.
- **Ignore complaints because "it's only a few".** A few out of a few hundred is a catastrophic rate.
- **Suppress complaints for marketing only.** A complainer must receive nothing.
- **Delete suppression records to "clean up".** Keep them forever; they are the record that stops you
  re-adding a bad address.

## Reviving an address

Only when the person asks — a new signup, or explicit support contact. Then:

1. Confirm it is really them.
2. Remove the suppression, recording who authorized it and when.
3. Send **one** confirmation email and watch it.
4. Re-suppress immediately if it bounces again.

Never bulk-revive. If a whole domain's addresses hard-bounced, that is their mail server, not your
list, and mass retrying will hurt you.

## Monitoring

```sh
# Failure reasons, most common first — a dominant single reason means a systemic problem
sendlayer events list --event failed --limit 100 --json \
  | jq -r '.Events[].Reason' | sort | uniq -c | sort -rn

# Complaint volume
sendlayer events list --event complained --limit 100 --json | jq '.TotalRecords'
```

Alert on complaint rate above 0.1% and hard-bounce rate above 0.5%. Both are early warnings that
arrive before you get blocked.

## Checklist

- [ ] `bounce` and `complaint` webhooks registered
- [ ] Handler reads `event.body.EventData` and matches past-tense names
- [ ] Handler is idempotent
- [ ] Hard bounces suppressed permanently, scope `all`
- [ ] Complaints suppressed permanently, scope `all`
- [ ] Marketing unsubscribes scoped to `marketing` only
- [ ] Soft bounces retried, then escalated
- [ ] Suppression checked before every send
- [ ] Code 14 handled as permanent, not retried
- [ ] Suppression records never deleted, imports never bypass them
