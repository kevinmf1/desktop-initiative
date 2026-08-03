# feat-003 · `git init` so attribution and diffs work

**Epic:** Harness setup · **Status:** ✅ done · **By:** kevin-malik · **Closed:** 2026-08-03

## Why

The harness attributes work from `git config user.name` and treats `git diff --stat` as ground
truth for the state-file `Changes` table. Neither worked: the directory was not a git repository.
`git config user.name` only resolved because a global value happened to be set.

## Done when

`git rev-parse --is-inside-work-tree` prints `true`, `main` exists, and `.DS_Store` is gitignored.

## Evidence

| ✓ | Check | By | Proof |
|:-:|-------|----|-------|
| ✅ | Is a work tree | kevin-malik | `git rev-parse --is-inside-work-tree` → `true` |
| ✅ | On `main` | kevin-malik | `git symbolic-ref HEAD` → `refs/heads/main` |
| ✅ | `.DS_Store` ignored | kevin-malik | `git status --short \| grep -c DS_Store` → `0` (3 `.DS_Store` files exist on disk) |

## Decisions

**`main` is an unborn branch.** `git init -b main` points `HEAD` at `refs/heads/main`, but the ref
itself does not exist until the first commit — so `git branch --list main` prints nothing. This
satisfies "on main" without a commit, and the harness forbids auto-committing. The first commit is
the user's to make; until then `git diff --stat` shows everything as untracked rather than as a diff.

**`.gitignore` holds one line.** Only `.DS_Store` — there is no build output, no dependency
directory, and no local env file in a Markdown-only repo. Adding a language-agnostic boilerplate
ignore file would ignore paths that cannot occur.

## Follow-ups

- First commit is pending the user's decision (harness rule: never auto-commit).
- `.gitignore` needs new entries the moment product code lands here.
