#!/usr/bin/env bash
#
# Project secret guard — fails if any sensitive material is tracked by git.
# Runs in CI (.github/workflows/ci.yml) and can be run locally before pushing:
#   bash scripts/check-secrets.sh
#
# Real secrets belong ONLY in gitignored infra/terraform/terraform.tfvars.
# .env.production is intentionally tracked but must hold ONLY public client
# config (API URL + Cognito pool/app-client IDs that already ship in the bundle).

set -uo pipefail

fail=0
err() { printf '::error::%s\n' "$1" >&2; fail=1; }

# Scan public documentation and deploy assets too. Only exclude the scanner
# definitions themselves. Untracked, non-ignored files are included before commit.
EXCLUDES=(
  ':!backend/api/node_modules'
  ':!dist'
  ':!scripts/check-secrets.sh'
  ':!.gitleaks.toml'
)

# 1) Secret-bearing files must never be tracked (guards against `git add -f`).
tracked_bad=$(
  git ls-files \
    | grep -iE '(^|/)(terraform\.tfvars(\.json)?|\.env|\.env\.[^/]*|id_rsa[^/]*)$|\.(p8|pem|key|p12|pfx)$' \
    | grep -vE '(\.example$)|(^\.env\.production$)' \
    || true
)
if [ -n "$tracked_bad" ]; then
  err "Secret-bearing files are tracked by git (they must stay gitignored):"
  printf '%s\n' "$tracked_bad" >&2
fi

# 2) Scan tracked text for high-signal secret value patterns.
PATTERNS='GOCSPX-[A-Za-z0-9_-]{10,}|WPL_AP1\.[A-Za-z0-9]|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----|aws_secret_access_key[[:space:]]*[:=]|xox[baprs]-[0-9A-Za-z-]{10,}'
PATTERNS="$PATTERNS|scrypt\\\$[a-f0-9]{32}\\\$[a-f0-9]{128}"
hits=$(git grep --untracked --exclude-standard -lIE "$PATTERNS" -- . "${EXCLUDES[@]}" 2>/dev/null || true)
if [ -n "$hits" ]; then
  err "Possible secret material found in public files (paths only; values withheld):"
  printf '%s\n' "$hits" >&2
fi

# 3) .env.production may hold ONLY public client config (it ships in the bundle).
if [ -f .env.production ]; then
  envbad=$(grep -niE 'secret|password|private[_-]?key|GOCSPX-|WPL_AP1|BEGIN [A-Z ]*PRIVATE KEY' .env.production || true)
  if [ -n "$envbad" ]; then
    err ".env.production contains secret-looking entries (only public VITE_* allowed):"
    printf '%s\n' "$envbad" >&2
  fi
fi

# 4) .gitignore must keep the key ignore rules (guards against weakening it).
for rule in '*.tfvars' '*.p8' '*.pem' '*.key' '.env'; do
  grep -qxF "$rule" .gitignore || err ".gitignore is missing required rule: $rule"
done

if [ "$fail" -ne 0 ]; then
  printf '\nSecret scan FAILED — see the ::error:: lines above.\n' >&2
  exit 1
fi

printf '✓ Secret scan passed — no sensitive material tracked.\n'
