# v2 delivery tickets

On 17 October 2026, Harry delegated ticket size and ordering so delivery can continue without repeated breakdown reviews. This list tracks the remaining paths from the [agreed product brief](v2-product-decisions.md) and [experience design](v2-experience-design.md). The local v2 preview already has the forest, permanent points, private API, reward model, editor, sample share card, and disposable tests. Those completed local slices are not duplicated as new issues.

| # | Ticket | Blocked by | What it delivers |
| --- | --- | --- | --- |
| 1 | Prove the Beehiiv count contract | None | A bounded read-only probe on the existing test publication and test subscription verifies exact cumulative opens/clicks, cursor listing, source meaning, and rate limits before live rewards use them. |
| 2 | Deliver and recover private reader links | None | A test reader receives a private garden link through the real newsletter path and can recover an expired link at their verified address, without ID-based access. |
| 3 | Credit daily Beehiiv activity | 1 | A successful full-audience daily sweep reads proved counters, awards opens and capped clicks once, updates the reported streak, and pauses safely on failures or unsubscribe. |
| 4 | Dry-run and recognize earlier activity | 1, 3 | Operators see the full-audience points/tree distribution and coverage before any grant; eligible readers then receive one audited starting forest with no invented history. |
| 5 | Make quiz and referral rewards real | 2 | Available editor-approved quizzes and verified unique referrals have working reader actions and award once, with no dead links or duplicate legacy credits. |
| 6 | Complete store rewards and held claims | 2 | Completed matched orders award paid-merchandise points once; unmatched orders remain held and can be resolved through a controlled support path. |
| 7 | Enable the truthful share image | 2, 3, 4 | An authenticated reader saves or shares their chosen forest view with verified year, opens, clicks, trees, latest milestone, and coverage, without private access data. |
| 8 | Run a measured reader pilot | 2–7 | A limited deployed cohort uses the garden on real devices while operators verify clicks per delivered email, award correctness, private access, persistent storage, and rollback before wider rollout. |

A bounded direct REST read on the existing test publication exposed integer `total_unique_opened`, `total_clicked`, and `total_unique_clicked` fields on one test subscription and two cursor-paginated list pages. The connected tool omits the click fields. Event meaning and 10almonds full-sweep capacity remain unproven, so [issue #2](https://github.com/mhdhadi2005/my-daily-garden/issues/2) stays open. No reader record or production configuration was changed.

The eight tickets are now [GitHub child issues #2–#9](https://github.com/mhdhadi2005/my-daily-garden/issues/1). The existing parent issue #1 predates the final design and mentions personal naming and rotation. Child issues use the later agreed brief; the parent body and status stay unchanged. Dependency text in GitHub issues is the source of truth for the frontier.
