<a href="https://sendlayer.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://sendlayer.com/wp-content/themes/sendlayer-theme/assets/images/svg/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://sendlayer.com/wp-content/themes/sendlayer-theme/assets/images/svg/logo-light.svg">
    <img alt="SendLayer Logo" width="200px" src="https://sendlayer.com/wp-content/themes/sendlayer-theme/assets/images/svg/logo-light.svg">
  </picture>
</a>

### SendLayer Agent Skills

Agent skills that teach AI coding assistants how to use SendLayer correctly — the REST API, the
official SDKs for Node.js, Python, PHP, Ruby and Go, the CLI, and email deliverability practice.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Assistants guess at SendLayer, and they guess wrong in specific, repeatable ways: there are three
different event vocabularies, the SDKs silently drop your plain-text body, `WebhookID` comes back as
a string but must be passed as an integer, and Python's send parameter is `sender` while every other
SDK calls it `from`. These skills encode all of it.

## Install

Works with Claude Code, Cursor, Codex, Copilot, Zed, Windsurf, Gemini CLI, OpenCode and others:

```sh
npx skills add SendLayer/sendlayer-skills
```

Then select the skills you want. Add `-g` to install globally instead of into the current project.

<details>
<summary><b>Claude Code</b></summary>

Install as a plugin, which also wires up the SendLayer MCP server:

```sh
/plugin marketplace add SendLayer/sendlayer-skills
/plugin install sendlayer@sendlayer-skills
```

Or just the skills:

```sh
npx skills add SendLayer/sendlayer-skills -a claude-code
```

Project skills land in `.claude/skills/`; `-g` puts them in `~/.claude/skills/`.

Set your API key so the MCP server can authenticate — in `~/.claude/config.json`:

```json
{ "env": { "SENDLAYER_API_KEY": "your-key" } }
```

</details>

<details>
<summary><b>Cursor</b></summary>

```sh
npx skills add SendLayer/sendlayer-skills -a cursor
```

Project skills land in `.agents/skills/`; global in `~/.cursor/skills/`.

Note that `.md` files without frontmatter placed in `.cursor/rules/` are ignored by Cursor — use the
skills above or a root `AGENTS.md`, not a bare rules file.

</details>

<details>
<summary><b>OpenAI Codex</b></summary>

```sh
npx skills add SendLayer/sendlayer-skills -a codex
```

Lands in `.agents/skills/` (repo) or `~/.codex/skills/` (global). Codex also reads a root
`AGENTS.md`, so you can additionally point at the skills from there.

</details>

<details>
<summary><b>GitHub Copilot</b></summary>

```sh
npx skills add SendLayer/sendlayer-skills -a github-copilot
```

Lands in `.agents/skills/` or `~/.copilot/skills/`.

</details>

<details>
<summary><b>Zed, Windsurf, Gemini CLI, OpenCode, and others</b></summary>

```sh
npx skills add SendLayer/sendlayer-skills -a zed
npx skills add SendLayer/sendlayer-skills -a windsurf
npx skills add SendLayer/sendlayer-skills -a gemini-cli
npx skills add SendLayer/sendlayer-skills -a opencode
```

`npx skills add --help` lists every supported agent and its install path.

</details>

<details>
<summary><b>Claude.ai (web and desktop)</b></summary>

Custom skills are uploaded per-user as a zip. Requires a Pro, Max, Team, or Enterprise plan with
code execution enabled.

```sh
git clone https://github.com/SendLayer/sendlayer-skills.git
cd sendlayer-skills/skills
zip -r sendlayer.zip sendlayer
```

Then upload `sendlayer.zip` under **Settings → Capabilities**. Repeat per skill. Skills do not sync
between Claude.ai and Claude Code.

</details>

<details>
<summary><b>Claude API</b></summary>

Upload workspace-wide via the skills endpoint with the beta header:

```sh
curl https://api.anthropic.com/v1/skills \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-beta: skills-2025-10-02" \
  -F "file=@sendlayer.zip"
```

</details>

<details>
<summary><b>Manual (any assistant)</b></summary>

```sh
git clone https://github.com/SendLayer/sendlayer-skills.git
cp -r sendlayer-skills/skills/* ~/.claude/skills/          # or the path your agent uses
```

Each skill directory is self-contained: `SKILL.md` plus `references/`.

</details>

## MCP server

Installing this repo as a plugin configures the hosted SendLayer MCP server automatically via
[`.mcp.json`](./.mcp.json). To add it by hand:

```sh
# Claude Code
claude mcp add --transport http sendlayer https://mcp.sendlayer.com \
  --header "x-sendlayer-api-key: $SENDLAYER_API_KEY"

# Codex
codex mcp add sendlayer --url https://mcp.sendlayer.com
```

<details>
<summary>Cursor, Claude Desktop, Zed, Copilot config</summary>

```json
// Cursor / Claude Desktop
{
  "mcpServers": {
    "sendlayer": {
      "type": "url",
      "url": "https://mcp.sendlayer.com",
      "headers": { "x-sendlayer-api-key": "YOUR_SENDLAYER_API_KEY" }
    }
  }
}
```

```json
// Zed settings.json
{ "context_servers": { "sendlayer": { "url": "https://mcp.sendlayer.com" } } }
```

```json
// GitHub Copilot
{ "mcp": { "servers": { "sendlayer": { "type": "http", "url": "https://mcp.sendlayer.com" } } } }
```

</details>

Tools: `send-email`, `get-events`, `list-webhooks`, `create-webhook`, `delete-webhook`, and
`query-sendlayer-docs` (which needs no API key).

The server is hosted — its source repository is not currently public, so use the endpoint above
rather than looking for a package to install.

## The skills

| Skill | Use it for |
|---|---|
| **`sendlayer`** | The REST API and all five SDKs — sending, attachments, delivery events, webhooks, error codes. |
| **`sendlayer-cli`** | The `sendlayer` CLI — sending from a shell or CI, and forwarding webhooks to localhost during development. |
| **`email-best-practices`** | Deliverability, SPF/DKIM/DMARC, bounce and complaint handling, HTML email, CAN-SPAM and GDPR. |

Each is `skills/<name>/SKILL.md` plus a `references/` directory loaded on demand.

> **`sendlayer-cli` is pre-release.** The CLI itself is not published — there is no npm package, no
> installer, and no Homebrew tap yet. The skill documents this up front so an assistant tells you the
> CLI is unavailable rather than handing you an install command that 404s. Its command reference is
> accurate and ready for the release.

## Coverage

| Package | Registry | Version | Covered |
|---|---|---|---|
| `sendlayer` | npm | 1.0.3 | yes |
| `sendlayer` | PyPI | 1.0.0 | yes |
| `sendlayer` | RubyGems | 1.0.0 | yes |
| `sendlayer/sendlayer-php` | Packagist | 1.0.0 | yes |
| `github.com/sendlayer/sendlayer-go` | Go modules | v1.0.0 | yes |
| REST API | — | v1 | yes |
| `sendlayer-cli` | npm | unpublished | documented, marked pre-release |

## Contributing

Read [AGENTS.md](./AGENTS.md) first — it holds the editing rules. The important ones:

1. **Every claim must be verifiable** against SDK source or the public API docs. Cite the file and
   line you checked. These skills exist because assistants guess; a wrong fact here is worse than no
   fact.
2. **`SKILL.md` stays under 500 lines** — it is loaded in full whenever the skill triggers. Detail
   goes in `references/`.
3. **References stay one level deep.**
4. **Every snippet must run as written** — parse-check it. The only exceptions are config fragments
   headed by a file path, and deliberate correct-vs-wrong illustrations labelled with the error they
   produce.
5. **Bump `metadata.version`** in the skill's frontmatter on any content change. Skill versions are
   independent of SDK versions.
6. **Never document an unpublished package.**

Validate locally:

```sh
npx skills-ref validate ./skills/sendlayer
npx skills add . -a claude-code -a cursor -a codex   # into a scratch dir
npx skills ls
```

CI runs the same checks plus link checking — see
[`.github/workflows/validate.yml`](./.github/workflows/validate.yml).

### Evals

`skill-evals/<skill>/evals.json` tests **routing behavior**, not prose: does the assistant load the
right reference, pick the right event vocabulary, and refuse to invent a parameter? Run each prompt
in a fresh session with and without the skill installed and check the `expectations` array. When a
case fails, fix the skill wording — not the eval.

## License

MIT License - see [LICENSE](./LICENSE) file for details.
