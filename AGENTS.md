# SendLayer Skills

Distribution repo for SendLayer agent skills. Each skill teaches an AI coding assistant how to
use SendLayer correctly — the REST API, the official SDKs, and the CLI.

## Repo layout

```
skills/<skill-name>/SKILL.md          # the skill itself
skills/<skill-name>/references/*.md   # progressive-disclosure detail, one level deep
skill-evals/<skill-name>/evals.json   # routing tests for the skill
.claude-plugin/ .cursor-plugin/ .codex-plugin/   # per-platform plugin manifests
.mcp.json                             # hosted SendLayer MCP server
```

## Skills

| Skill | Owned by | What it covers |
|---|---|---|
| `skills/sendlayer/` | authored here | REST API + Node.js, Python, PHP, Ruby, Go SDKs |
| `skills/sendlayer-cli/` | authored here | the `sendlayer` CLI |
| `skills/email-best-practices/` | authored here | deliverability, domain auth, compliance |

Nothing is synced from another repo yet. When an SDK repo takes ownership of its own skill,
add it to a "do not edit — synced" list here and wire it up in
`.github/workflows/sync-from-repo.yml`.

## Rules for editing skills

1. **Every claim must be verifiable against SDK source or the public API docs.** These skills
   exist because assistants guess wrong about SendLayer. A wrong fact here is worse than no
   fact. When you add a gotcha, cite the file and line you verified it in.
2. **Keep `SKILL.md` under 500 lines.** It is loaded in full whenever the skill triggers.
   Detail belongs in `references/`.
3. **Keep references one level deep.** `references/foo.md` may not point at
   `references/nested/bar.md`.
4. **Every code snippet must be runnable as-is** — real imports, real method names, real parameter
   names. Parse-check it before committing. Two narrow exceptions, both of which must be obvious at a
   glance:
   - **Config or class-member fragments**, introduced by a file-path comment
     (`// config/services.php`). These are not standalone programs and are not expected to parse
     alone.
   - **Correct-vs-wrong illustrations**, where the wrong line is labelled with the error it produces
     (`sendlayer.Emails.send(...)   # NoMethodError`).

   Anything else must parse. `return` at the top level of a JS snippet, for instance, is a bug —
   wrap the example in a function.
5. **Bump `metadata.version` in the skill's frontmatter** on any content change. Skill versions
   are independent of SDK release versions.
6. **Do not document unreleased packages.** If it is not installable from npm / PyPI /
   RubyGems / Packagist / a Go module proxy, it does not belong in a skill.

## Known SDK inconsistencies

These are real and deliberately documented as gotchas rather than hidden. If an SDK fixes one,
update the skill in the same PR that bumps the version floor:

- Python's `Emails.send()` takes `sender=`, not `from=` (`from` is a Python keyword).
- Ruby exposes lowercase `emails` / `webhooks` / `events`; the other SDKs capitalize.
- All five SDKs send **either** `HTMLContent` **or** `PlainContent`, never both — passing `html`
  silently drops `text`.
- `Webhooks.get()` returns `WebhookID` as a string; `Webhooks.delete()` requires an integer.
- Node's `GetEventsOptions` declares `fromEmail` / `toEmail` but `Events.get()` never sends them.
- Node's `SendLayer` constructor does not forward a config object to the underlying client, so
  `attachmentURLTimeout` is unreachable from the public API.

## Validating a change

```sh
npx skills-ref validate ./skills/sendlayer
npx skills-ref validate ./skills/sendlayer-cli
npx skills-ref validate ./skills/email-best-practices
```

Then install locally and confirm the skills resolve for each assistant:

```sh
npx skills add . -a claude-code -a cursor -a codex
npx skills ls
```
