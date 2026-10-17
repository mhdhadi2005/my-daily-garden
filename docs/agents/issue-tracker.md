# Issue tracker: GitHub

Specs and tickets for this repo live in GitHub Issues at
`mhdhadi2005/my-daily-garden`. Use `gh` from this checkout, or pass
`-R mhdhadi2005/my-daily-garden` explicitly.

## Conventions

- Create: `gh issue create --title "..." --body-file <file>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,labels`.
- Comment: `gh issue comment <number> --body-file <file>`.
- Label: `gh issue edit <number> --add-label "..."`.
- Close: `gh issue close <number>`.

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", read that issue and its comments.

## Parent issues and blockers

Link tickets as sub-issues where GitHub supports it. This Mac has `gh`
2.79, so use `gh api` for sub-issue links rather than assuming
`gh issue create --parent` exists. Use native issue dependencies when
available; otherwise put `Blocked by: #<number>` in the child issue.
A ticket is ready only when its blockers are closed.

## Pull requests as requests

PRs as a triage request surface: no.

## Wayfinding

A wayfinder map is one issue labelled `wayfinder:map`; its tickets are
child issues labelled `wayfinder:research`, `wayfinder:prototype`,
`wayfinder:grilling`, or `wayfinder:task`. Record notes and decisions
in the map. Claim a ready ticket by assigning it; resolve it by
recording the answer and closing it.
