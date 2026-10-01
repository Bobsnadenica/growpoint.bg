# Public repository security audit — 2026-10-01

**Confirmed historical QA credential exposure.** A later exact-value check found
an owner-supplied shared QA account password in reachable Git history. General
scanner rules did not detect it. Current public files, generated build and
recovered historical archives have zero matches for that password.

Treat any account still using it as compromised. The owner subsequently approved
rotation and session revocation for the four supplied QA accounts, and both are
now verified. The exposed credential is retired on those four accounts. History
rewriting was not approved or performed. Exact locations and affected accounts
remain only in private owner evidence outside Git with owner-only permissions.

This is a point-in-time audit, not a guarantee that every possible credential
format or future change will be detected. No credentials, private contacts,
account data or payment references are reproduced here.

## Original audit scope and results

These counts describe the original audit snapshot, not a new full-history scan
of later releases or the replacement credentials.

| Check | Result |
| --- | --- |
| Reachable Git history | 130 commits; 20,383 unique blobs, about 476 MiB |
| Remote refs | One branch, no tags or PR refs; remote HEAD matched the audited checkout |
| Latest public/build snapshot | 260 files, including 17 root assets and 48 build files; project configuration zero findings; built-in rules only the known enum false positive |
| Private Terraform/UAT settings and state | Ignored and untracked; no actual sensitive-file extensions found in reachable history |
| Current Lambda ZIP | Intact; archive contents scanned, no confirmed secrets |
| Historical Lambda ZIPs | 44 unique snapshots; 212,614 recovered files, about 616 MiB scanned; zero findings |
| Exact current private-value comparison | Four private username/secret values compared in memory against all historical blobs and recovered archive files; zero matches |
| Supplied QA account password | Confirmed historical text matches; current public/build/archive matches zero; value withheld |
| Retired panel password | Separately checked across history/current files/build/recovered archives; zero matches |

Gitleaks **8.30.1** was downloaded temporarily from its [official release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)
and checked against the official SHA-256 checksum. Full-history and archive scans
used built-in rules independently of the repository's broad former exclusions,
with redacted reports and decoding/archive depth three. That read-only audit
performed no global installation, AWS change, history rewrite or outbound account
message; the later authorized remediation is recorded separately below.

Two built-in-rule findings were confirmed false positives:

| Location / commit | Rule | Actual content |
| --- | --- | --- |
| `infra/terraform/main.tf`, `3d41a0b6de33` | `hashicorp-tf-password` | Public Cognito authentication-flow enums, not a password |
| `docs/dsk-sandbox-preflight-2026-10-01.md`, `45c3fa5aa664` | `generic-api-key` | The ordinary phrase “refunds/cancellation” in launch-readiness prose |

The project configuration now permits only this exact safe content for the
corresponding rule and file. The configured full-history scan returns zero
findings, but the separate exact-password finding demonstrates why this is
**not** proof that no credentials were published. Ordinary client configuration
shipped by the SPA is public by design; it must not contain client secrets,
passwords or privileged credentials.

## Controls hardened and verified

- Removed an obsolete private sender reference from a Terraform comment.
- Removed whole-path exclusions for documentation, assets, builds, public client
  environment files, templates and lockfiles. Vendored dependencies and scanner
  definitions retain their existing exclusions.
- Secret-guard failures now print the affected environment-file line number,
  never its value. A synthetic-secret regression verified this behavior.
- Synthetic API-key checks were detected in documentation, assets, build output
  and templates: **4/4**. Reports were fully redacted.
- Shell syntax, the project secret guard, Terraform formatting and diff checks
  passed. Private-evidence helper privacy regressions passed **6/6**, using a
  local fake adapter only; they do not contact the bank or send messages. Output
  directories are checked through real paths, errors omit private values, and
  exclusive timestamped 0600 files preserve earlier checks.

## Limitations and follow-up

Three historical `careerdoc-api.zip` blobs are truncated: `5444666c19e8`,
`d547efba1b9b` and `fb801c37a0cc`. Their available contents were recovered and
scanned, but these snapshots cannot be certified as complete archives. The
current deployable ZIP is not affected.

Routine CI scans pushed/PR changes; this one-off audit additionally checked all
reachable history and explicitly unpacked archives. A full checkout alone does
not establish archive or full-history coverage. Keep those checks in release
audits, and re-scan generated output after relevant build changes. See the
[official scanner behavior](https://github.com/gitleaks/gitleaks) and
[action event-range implementation](https://github.com/gitleaks/gitleaks-action/blob/master/src/index.js).

Removing current content does not remove older Git copies. Agree any
history-cleanup scope separately before rewriting or force-pushing; copies in
clones, forks and caches cannot be assumed erased. Exact historical locations
remain private even after credential retirement. No history replacement file or
rewrite was created during this audit or its authorized remediation.

Git also publishes author/committer contact metadata. Three distinct contacts in
the audited history are not GitHub-noreply identities; their values are omitted
here, and this does not by itself prove unintended disclosure. Use a noreply
identity for future commits if these contacts should not be public. Changing
existing metadata would require a separately agreed history rewrite.

## Authorized credential remediation — 1 October 2026

- The owner approved password rotation and session revocation for four QA
  accounts only, not history rewriting. Each now has a distinct replacement
  retained outside Git with owner-only 0600 permissions; no value is included in
  this report.
- Cognito global signout was followed by a server-owned numeric `authValidAfter`
  cutoff. Pre-cutoff JWTs return **401**, old refresh tokens are rejected and
  fresh authenticated profile reads return **200** on all four accounts.
  API Gateway signature validation alone does not establish revocation.
- Profiles and groups are unchanged. The business snapshot remains four users,
  two experts and three bookings, with the same exact snapshot hash.
- Authenticated sandbox QA resumed only with the replacement credentials. The
  old shared credential is retired on these accounts; any other reuse still
  requires remediation. Historical exposure is not erased by rotation, and
  broader launch/payment/email gates remain independent.
- A later exact-value privacy check compared six current private values (four
  replacement QA passwords and the two sandbox credential fields) against 213
  tracked files and the private bank evidence ZIP: **zero matches**. This is
  current-file/export evidence, not a second complete historical audit.
- Sandbox was disabled again after QA, both deployed credential fields are
  empty, and the post-apply Terraform plan reports no changes. No history rewrite
  or bank evidence delivery was performed.
