# Authentication

## Resolution order

Every command resolves the key the same way, first match wins:

1. `--api-key <key>` flag
2. `SENDLAYER_API_KEY` environment variable
3. stored credentials for the active `--profile`

If none produce a key, the command exits **3** (auth missing). If a key is found but rejected,
it exits **4** (auth invalid).

`sendlayer whoami` tells you which source won, with the key masked — the first thing to run when
a command authenticates as the wrong account.

## Commands

```sh
sendlayer login                      # prompt for a key, then validate it against the API
sendlayer login --key sl_xxx         # non-interactive
sendlayer login -k sl_xxx            # short form
sendlayer login --no-validate        # store without the validating API call
sendlayer login --profile staging    # store under a named profile
sendlayer logout                     # remove the default profile's key
sendlayer logout --profile staging   # remove a specific profile
sendlayer whoami                     # masked key + source
sendlayer whoami --json              # machine-readable
```

`--no-validate` is for storing a key while offline, or when the key is scoped such that the
validation call would fail. Normally let it validate — catching a bad key at login is much better
than at first send.

## Credentials file

Written with mode `0600` (owner read/write only).

| Platform | Path |
|---|---|
| Linux, macOS | `$XDG_CONFIG_HOME/sendlayer/credentials.json`, defaulting to `~/.config/sendlayer/credentials.json` |
| Windows | `%APPDATA%\sendlayer\credentials.json` |

The file holds all profiles. To inspect it:

```sh
cat "${XDG_CONFIG_HOME:-$HOME/.config}/sendlayer/credentials.json"
```

> An older Go implementation of this CLI used `sendlayer-cli/credentials.json` — a different
> directory. If both are on a machine, they do not share credentials.

## Profiles

`--profile <name>` selects an account. Default is `default`.

```sh
sendlayer login --profile production --key sl_prod_xxx
sendlayer login --profile staging --key sl_stag_xxx

sendlayer emails send --profile staging --from ... --to ...
sendlayer events list --profile production --limit 20
```

There is no "current profile" state — `--profile` must be passed on each command. For a shell
session, alias it:

```sh
alias slp='sendlayer --profile production'
```

Note the profile lives on the *stored credentials* lookup only. If `SENDLAYER_API_KEY` is set in
the environment it wins over any profile, which makes `--profile` silently ineffective. Unset the
env var when working with profiles:

```sh
env -u SENDLAYER_API_KEY sendlayer events list --profile staging
```

## CI

**Use the environment variable. Never run `sendlayer login` in CI** — it writes a long-lived key to
the runner's filesystem, which may be cached, logged, or shared between jobs.

GitHub Actions:

```yaml
- name: Send release notification
  env:
    SENDLAYER_API_KEY: ${{ secrets.SENDLAYER_API_KEY }}
  run: |
    sendlayer emails send \
      --from "CI <ci@yourdomain.com>" \
      --to team@yourdomain.com \
      --subject "Release ${{ github.ref_name }} deployed" \
      --text "Commit ${{ github.sha }} is live."
```

GitLab CI:

```yaml
notify:
  script:
    - sendlayer emails send --from "CI <ci@yourdomain.com>" --to team@yourdomain.com --subject "Deployed" --text "$CI_COMMIT_SHA"
  variables:
    SENDLAYER_API_KEY: $SENDLAYER_API_KEY
```

Because stdout is not a TTY in CI, JSON output is enabled automatically — you do not need `--json`
to get parseable output, and you should not expect the human-formatted tables.

## Verifying a key without sending email

```sh
sendlayer webhooks list --json >/dev/null && echo "key OK"
```

Listing webhooks needs no verified sender domain and sends nothing. `sendlayer whoami` only reports
what key *would* be used — with `--no-validate` at login it may not have been checked against the
API at all.

## Key hygiene

- One key per environment, stored as a separate profile or secret.
- Rotate through the SendLayer dashboard (https://sendlayer.com/docs/managing-api-keys/); the CLI
  has no rotate command. Run `sendlayer login` again with the new key.
- `sendlayer logout` on shared or temporary machines.
- Never pass `--api-key` in a command that lands in shell history. Prefer the env var, or a leading
  space if your shell is configured to skip those.
