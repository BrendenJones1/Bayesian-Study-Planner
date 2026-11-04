# Setup walkthrough: backlog, CI/CD, coding agent and reviewer agent

About 45 minutes, for an existing GitHub repo. Everything runs on GitHub's
servers: **your computer does not need to stay on.** You only need it once
tonight to create a token and run one script.

## How it works

```
 you label an issue          nightly 2:17 AM picks one
   "claude-now"                "claude-ready" issue
        \                          /
         v                        v
   CODING AGENT (claude.yml / claude-nightly.yml, GitHub Actions)
   reads CLAUDE.md + docs/ + the issue -> branch -> code + tests -> DRAFT PR
                              |
            +-----------------+------------------+
            v                                    v
   CI (ci.yml)                          REVIEWER AGENT (claude-review.yml)
   lint, tests, guardrails              checks every acceptance criterion,
   -> check "ci"                        CLAUDE.md rules, over-engineering
                                        -> review comment + check "requirements-review"
            \                                    /
             v                                  v
        YOU review in the morning: merge, or comment "@claude please fix ..."
                              |
                              v
   CD: tag v0.x -> release.yml builds the extension zip
       nightly    -> priors-nightly.yml fits the model, publishes priors.json to Pages
```

| File | Goes to | Purpose |
| --- | --- | --- |
| `CLAUDE.md` | repo root | Rules every agent follows (privacy, model invariants, PR format) |
| `claude-settings.json` | `.claude/settings.json` | Same plugins when you use Claude Code locally |
| `workflows/ci.yml` | `.github/workflows/` | CI: lint, tests, privacy guardrails; parts switch on as folders appear |
| `workflows/claude.yml` | `.github/workflows/` | Coding agent: `@claude` mentions and the `claude-now` label |
| `workflows/claude-nightly.yml` | `.github/workflows/` | Coding agent: one `claude-ready` issue per night |
| `workflows/claude-review.yml` | `.github/workflows/` | Reviewer agent: independent check against the requirements |
| `workflows/release.yml` | `.github/workflows/` | CD: tag → extension zip on a GitHub release |
| `workflows/priors-nightly.yml` | `.github/workflows/` | CD: nightly model fit → `priors.json` on GitHub Pages |
| `issues-v2.yaml`, `create_issues.py` | `github-setup/` | Backlog for the v2 design (the v1 plan is in `github-setup/archive/issues-v1.yaml`) |

**Labels:** `claude-ready` means the nightly agent may pick the issue, and it never
starts a run by itself. `claude-now` starts the agent on that issue immediately.
`needs-human` marks work only you can do.

**Plugins**
- Coding agent: **Ponytail** (keeps changes minimal), **security-guidance**
  (checks each change for vulnerabilities), **typescript-lsp** and **pyright-lsp**
  (type errors and code navigation).
- Reviewer: **pr-review-toolkit** (Anthropic's specialized PR-review agents).

---

## Prerequisites (on your computer, once)

- A Claude **Pro or Max** plan. Agent runs use your plan's usage.
- Claude Code CLI installed (`claude --version`).
- GitHub CLI logged in: `gh auth login`, then `gh auth refresh -s project`.
- Python 3 with PyYAML: `pip install pyyaml`.

## Step 1. Create the backlog first (5 min)

Do this **before** adding the workflows, so creating 69 issues can't trigger anything.

```bash
cd github-setup
python create_issues.py --repo YOUR_USER/YOUR_REPO --dry-run
python create_issues.py --repo YOUR_USER/YOUR_REPO --project "Bayesian Study Planner"
```

Then open the Project and set it up:
- **New view → Board**, grouped by Status.
- **⋯ → Workflows:** turn on *Auto-add to project*, *Item closed → Done*, and *Pull request merged → Done*.

To change issues later, edit `issues-v2.yaml` and run with `--update`. That rewrites existing
issues in place (renamed ones are matched by `previous_titles`) and keeps labels you added by hand.

## Step 2. Export the design docs (2 min)

Open each doc, use its **export menu → Markdown**, and save the files into your repo as:
- [System design](https://claude.ai/artifact/APGED2LzH7KKL9qvdp83iJ) → `docs/design.md`
- [Design tradeoffs](https://claude.ai/artifact/NPVVwP5BKWhYf24bYu4YKy) → `docs/tradeoffs.md`

**Should the agents get the design docs? Yes.** Every issue links to them, and both
agents are told to read them. The exported Markdown drops the diagrams, which is fine,
because the equations and rules are text. Re-export after any design change.

## Step 3. Copy the files in and push (5 min)

```bash
cd YOUR_REPO
mkdir -p .github/workflows .claude docs github-setup
cp /path/to/github-setup/CLAUDE.md .
cp /path/to/github-setup/claude-settings.json .claude/settings.json
cp /path/to/github-setup/workflows/*.yml .github/workflows/
cp /path/to/github-setup/{issues-v2.yaml,create_issues.py,README.md} github-setup/
git add . && git commit -m "Add agents, CI/CD and design docs" && git push
```

If the repo already has a workflow called `ci.yml`, merge the two by hand.

## Step 4. Secrets, variables and the Claude app (10 min)

**1. Claude token** (uses your subscription):

```bash
claude setup-token                      # prints a long-lived token
gh secret set CLAUDE_CODE_OAUTH_TOKEN   # paste it
```

**2. GitHub fine-grained personal access token** (`GH_PAT`): GitHub → Settings →
Developer settings → Fine-grained tokens → Generate.
- Repository access: only this repo.
- Permissions: Contents, Pull requests, Issues set to read and write (Metadata read is automatic).
- Expiry: 90 days, with a calendar reminder to rotate it.

```bash
gh secret set GH_PAT                    # paste it
```

*Why it's needed:* pushes and PRs made with GitHub's built-in token don't trigger
other workflows. Without `GH_PAT`, CI and the reviewer would never run on the
coding agent's PRs.

**3.** Install the **Claude GitHub App** on the repo. Running `/install-github-app`
inside Claude Code in the repo does this. If it opens a PR adding its own
`claude.yml`, close that PR; these workflows replace it.

**4.** Leave the nightly run **off** until the smoke test passes:

```bash
gh variable set ENABLE_CLAUDE_NIGHTLY --body false
```

## Step 5. Repository settings (5 min)

- **Actions → General → Workflow permissions:** *Read and write*.
- **Pages → Source:** *GitHub Actions*. Pages on a private repo needs GitHub Pro,
  which is free with the GitHub Student Developer Pack. Otherwise make the repo public.
- **Rules → New branch ruleset for `main`:**
  - Require a pull request.
  - Require status checks `ci` and `requirements-review`. They appear in the picker
    after their first run, so add them after the smoke test.
  - **Don't require an approval:** the agent's PRs are opened with your token, so they
    count as yours, and GitHub won't let you approve your own PR. The two checks plus
    your merge click are the gate.

## Step 6. Smoke test (10–20 min, tonight)

1. On the issue **"Scaffold the monorepo"**, add the label `claude-now`.
2. Watch the **Actions** tab. The *Claude* workflow should open a draft PR within about 10–20 minutes.
3. On that PR, *CI* and *Claude review* should both run. The reviewer posts a verdict table
   and a pass/fail check.
4. If anything fails, read that run's log. The usual causes are a missing secret, a wrong
   input name in the action, or the PAT lacking a permission.
5. Once it works:
   - `gh variable set ENABLE_CLAUDE_NIGHTLY --body true`
   - Add the two required checks to the `main` ruleset.

## Step 7. Local Claude Code (optional)

`.claude/settings.json` lists the same plugins. In the repo, run:

```bash
claude plugin marketplace add DietrichGebert/ponytail
claude plugin install ponytail@ponytail --scope project
claude plugin install security-guidance@claude-plugins-official --scope project
claude plugin install pr-review-toolkit@claude-plugins-official --scope project
```

## The daily loop

| When | You | Agents |
| --- | --- | --- |
| Evening | Triage. Make sure tomorrow's tasks have crisp criteria and `claude-ready`. | |
| Any time | Add `claude-now` to run one issue immediately. | Coding agent opens a draft PR |
| 2:17 AM | | Nightly agent takes the next ready issue (earliest milestone, p1 first) |
| On every PR push | | CI and the reviewer agent run |
| Morning | Read the reviewer's table, skim the diff, merge, or comment `@claude please fix X`. | Coding agent pushes fixes; CI and reviewer rerun |
| Releases | `git tag v0.1.0 && git push --tags` | `release.yml` attaches the extension zip |

## Things to know

- **Usage:** every agent run counts against your Claude plan, and private repos also
  use GitHub Actions minutes. One nightly issue plus a few on-demand runs a day is a
  sensible start.
- **Plugin security:** plugins run inside jobs that hold your tokens. Pin Ponytail to a
  commit you've read by appending `#<commit-sha>` to its marketplace URL in both coding
  workflows.
- **Action inputs:** `plugin_marketplaces`, `plugins`, `claude_args` and `github_token`
  follow the claude-code-action repo as of Nov 2026. If a run errors on an input, check
  https://github.com/anthropics/claude-code-action for the current names.
- **The reviewer can't merge or approve.** It only comments and sets a check. Merging is
  always your click.
- **Academic integrity:** confirm the course allows AI-assisted code (the first
  `needs-human` issue) before relying on the agents for graded work.
