# GitHub workflow — protected `main`, CI, and reviews

Repository: `FaiyajJarif/Cha-Ghor` — **public**, default branch `main`.
Public is the important part: **rulesets and required reviews are free on public
repositories.** On a private repo they need GitHub Pro or Team.

## What is in the repo already

| File | Does |
|---|---|
| `.github/workflows/ci.yml` | Builds the backend, lints and builds the frontend, lints `ai_service`, checks commit messages |
| `.github/CODEOWNERS` | Names `@FaiyajJarif` as owner of everything, and of money/migration/security paths explicitly |
| `.github/pull_request_template.md` | Pre-fills every PR with "how I verified it" and "what I did NOT test" |

## What you must click (code cannot set these)

**Settings → Rules → Rulesets → New branch ruleset**

- **Name:** `main protection`
- **Enforcement status:** Active
- **Target branches:** Include default branch
- Tick these:

| Setting | Why |
|---|---|
| **Restrict deletions** | Nobody can delete `main` |
| **Block force pushes** | Nobody can rewrite shared history |
| **Require a pull request before merging** | No more direct pushes to `main` |
| → **Required approvals: 1** | A teammate must review |
| → **Dismiss stale approvals when new commits are pushed** | An approval covers the code that was approved, not whatever came after |
| **Restrict updates** + Bypass list → *Repository admin* | *This* is what means only you can merge — see below |

### "Restrict who can push to matching branches" does not exist for you

That setting is **organization-only**. `FaiyajJarif/Cha-Ghor` is a *personal*
repository (the API reports the owner as `"type": "User"`), so GitHub does not
render the option at all. It is not hidden behind a plan — a personal repo
cannot have it.

Two ways to get "only I can merge" anyway.

**Option A — Rulesets, `Restrict updates` + bypass (works today, 2 minutes)**

In the ruleset: tick **Restrict updates**, then in **Bypass list** add
**Repository admin**. `main` can then only be updated by an admin — you. A
teammate with write access can open a PR and approve one, but the merge button
refuses them.

The honest trade-off: **bypass means bypass.** You skip *every* rule in that
ruleset, so you could also push straight to `main` and merge without a review.
Nothing stops you but you. If that bothers you, make a second ruleset with no
bypass list containing only *Require a pull request* — then even you have to go
through a PR, while the admin-only merge restriction stays in the first.

**Option B — move the repo into a free Organization (the real fix)**

Create an organization (free), transfer the repo into it, add your three
teammates as members. You then get the genuine
*Restrict who can push to matching branches*, plus real roles — teammates can be
**Write** while only you are **Admin**.

Worth doing for a team project regardless: personal repos have no role
granularity at all, so today every collaborator you add effectively has write
access to everything. Transferring keeps all commits, issues, PRs and stars, and
GitHub redirects the old URL — but it **does change the clone URL**, so everyone
runs `git remote set-url origin <new>` once, and any deploy hook pointing at the
old path needs updating. Do it *after* the submission, not the night before.

### ⚠ Do NOT tick "Require review from Code Owners" yet

`CODEOWNERS` names `@FaiyajJarif` as the sole owner, and **GitHub does not let
you approve your own pull request.** So the moment you open a PR yourself, the
code-owner requirement can never be satisfied and your own work is deadlocked —
the only way out is the admin bypass, which defeats the whole thing.

Two ways to have it properly:

1. **Add a second code owner** for the general paths, and keep yourself as sole
   owner only on the money and migration paths. Then your PRs can be approved by
   the other owner, and anything touching wages still needs you.
2. **Leave the box off.** `CODEOWNERS` still auto-requests you as a reviewer on
   those paths, which is most of the value. "Only I can merge" is then enforced
   by the push restriction above, not by code-owner review.

Option 2 is what the settings table above assumes. It gives you exactly what you
asked for — a teammate reviews, only you can merge — with nothing that can
deadlock.
| **Require status checks to pass** | CI must be green |
| → **Require branches to be up to date before merging** | Forces `git pull` / rebase first — the part you asked about |
| **Require linear history** | Keeps the graph readable; use squash merges |

Under **Require status checks**, search and add:

- `Backend — build and unit tests`
- `Frontend — lint and build`
- `Commit messages`

**Deliberately leave `AI service — import and format check` OUT of the required
list for now.** See the warning below.

Then **Settings → General → Pull Requests**: enable *Allow squash merging* only,
and tick *Automatically delete head branches*.

## ⚠ Read this before you mark checks as required

**I could not run this CI.** There is no JDK, no npm install and no network
build in the environment it was written in. The workflow is written against
what the repo actually declares — Java 17 from `backend/pom.xml`, the
`package-lock.json` for `npm ci`, the real script names — but *written
correctly* and *passing* are different things.

Expect the first run to fail on something. In particular:

- **`ruff` has never been run on `ai_service`.** The format check will almost
  certainly fail on nine files that were never formatted. Fix it in one commit
  (`ruff format .` then `ruff check --fix .`), or drop that job.
- **`npm run lint` may already fail** on existing code. Nobody has been running
  it in CI.

So: **push this to a branch, open a PR, and watch what happens — before you
make any check required.** Only promote a check to "required" once you have
seen it pass. A required check that has never been green blocks every merge
including the one that would fix it.

## Commit messages

The `Commits` job enforces [Conventional Commits](https://www.conventionalcommits.org)
on the commits in a PR:

```
feat(payroll): add overdraw recovery to the daily split
fix(bkash): stop the slip creating its own batch
docs: record the leaf grading measurement
```

Allowed types: `feat fix docs style refactor perf test build ci chore revert`.
Subject needs 10+ characters after the colon, so `fix: bug` is rejected.

Tested against real input — accepts the three above and `feat!: drop the legacy
loans table for good`; rejects `fix: bug`, `updated stuff`, `WIP`.

**Your existing history is not touched.** 51 of your 106 non-merge commits
already match; the rest stay as they are. The check only ever looks at commits
in an open PR.

To fix a message before pushing: `git commit --amend`, or `git rebase -i origin/main`
for several.

### Why not husky + commitlint?

husky runs on the developer's laptop and `git commit --no-verify` skips it, so
it guarantees nothing. It also needs a root `package.json`, which this repo does
not otherwise have. The CI job cannot be bypassed. Add husky later if you want
the faster feedback — but keep the CI job as the actual gate.

## The day-to-day flow after this is on

```bash
git checkout main
git pull                                  # required: branch must be up to date
git checkout -b feat/harvest-export

# ... work ...

git commit -m "feat(harvest): export the schedule as PDF"
git push -u origin feat/harvest-export
```

Then on GitHub: open the PR → fill the template → CI runs → a teammate reviews →
you approve as code owner → **Squash and merge**.

## Known friction, so nobody is surprised

- **You become a bottleneck.** Code Owners review means nothing merges while you
  are asleep. That is the point, and it is also the cost.
- **Four people, ~120 commits, no PRs so far.** This is a real change of habit,
  not a config tweak.
- **You can still bypass it yourself** — as repo admin you will see "merge
  without waiting for requirements". Using it defeats the exercise; there is a
  *Do not allow bypassing* box in the ruleset if you want it shut properly.

## Two unrelated things worth fixing while you are in Settings

- **No LICENSE file.** The repo is public with no licence, which technically
  means nobody may reuse it. For a university project add MIT — Settings has an
  "Add file → Create new file → LICENSE" template picker.
- **One teammate commits under three identities** (`sazzadsazid`, and `Sazzad`
  under two different emails). A `.mailmap` at the repo root merges them in
  `git shortlog` without rewriting history:

  ```
  Sazzad Sazid <msazid2410418@bscse.uiu.ac.bd> <sazidsazzad5@gmail.com>
  Sazzad Sazid <msazid2410418@bscse.uiu.ac.bd> <JhoneDoes@gmail.com>
  ```

---

# How to test it actually works

The only way to know a rule works is to **try to break it and be stopped.** A
rule you have never seen block anything is a rule you are assuming.

Do this in order. Phase 1 before you mark anything required, Phase 2 after.

## Phase 1 — get CI green before turning on any protection

Protection is off at this point. You are only testing that the workflow runs.

```bash
git checkout main && git pull
git checkout -b ci/first-run
printf '\n' >> README.md          # a change so trivial it cannot fail on merit
git commit -am "ci: first workflow run"
git push -u origin ci/first-run
```

Open the PR. Go to the **Actions** tab and watch four jobs appear:

| Job | Expect on first run |
|---|---|
| Backend — build and unit tests | Should pass. If not, read the FIRST error — a duplicate method signature produces one real error and ~99 cascading Lombok ones. |
| Frontend — lint and build | **May fail.** `npm run lint` has never run in CI. |
| AI service — import and format check | **Will very likely fail.** `ruff` has never been run on those nine files. |
| Commit messages | Should pass — `ci: first workflow run` matches. |

Fix what fails, in its own commit, until all four are green:

```bash
cd ai_service && ruff format . && ruff check --fix .
cd ../frontend && npm run lint          # fix what it reports
```

**Only now** create the ruleset and add the green checks as required.

## Phase 2 — prove each rule blocks something

Seven tests. Each one should **fail**. If any succeeds, that rule is not on.

### 1 · Direct push to `main` is refused

```bash
git checkout main
printf '\n' >> README.md
git commit -am "test: this push should be rejected"
git push origin main
```

**Expect:**
```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
```

Then undo your local commit: `git reset --hard origin/main`

### 2 · Force push to `main` is refused

```bash
git push --force origin main
```
**Expect:** rejected — *Cannot force-push to this branch.*

### 3 · A bad commit message fails CI

```bash
git checkout -b test/bad-commit
printf '\n' >> README.md
git commit -am "WIP"
git push -u origin test/bad-commit
```

Open a PR. **Expect** the *Commit messages* job red, with an annotation on the
Actions summary reading:

```
Bad commit message: WIP
```

Fix it in place and watch it go green:
```bash
git commit --amend -m "test: check the commit message gate"
git push --force-with-lease
```

*(`--force-with-lease`, not `--force`. It refuses if someone else pushed to your
branch meanwhile.)*

### 4 · Broken code fails CI

On the same branch, break one thing deliberately — an undefined variable in a
`.jsx` file is enough. **Expect** *Frontend — lint and build* red. Revert it.

### 5 · You cannot merge without a review

With CI green, look at the merge button. **Expect** it disabled, with:

> Review required — at least 1 approving review is required.

Have a teammate approve. The button unlocks.

### 6 · A teammate cannot merge, only you can

Ask a teammate to try merging an approved PR. **Expect** GitHub to refuse the
merge because they are not on the push allowlist for `main`.

*This is the test most people skip, and it is the one you actually asked for.*

### 7 · A stale branch must be updated first

1. Merge any PR to `main`.
2. Go back to an older open PR.

**Expect:** *This branch is out-of-date with the base branch* and an **Update
branch** button, with merge blocked until you press it. That is the "must pull
first" rule working.

## Clean up

```bash
git checkout main && git pull
git branch -D ci/first-run test/bad-commit
git push origin --delete ci/first-run test/bad-commit
```

Close the test PRs. If *Automatically delete head branches* is on, the remote
branches go on merge and you only need the local deletes.

## What "working" looks like when you are done

- Test 1 and 2 rejected at the terminal
- Test 3 and 4 red in Actions, green after the fix
- Test 5 merge button disabled until approved
- Test 6 teammate refused, you allowed
- Test 7 Update branch demanded

Screenshot tests 1, 3 and 5 — they are the clearest evidence for the SE Lab
submission that this is a real workflow rather than a settings page you looked at.
