# Beehiiv subscriber-count contract check

Checked 16–17 October 2026. This is a read-only feasibility check for [the v2 product decisions](v2-product-decisions.md), not proof that newsletter credits can launch.

## Required interface and test seam

The scoring module needs a stable, nonnegative **cumulative count of unique opened emails** and a stable, nonnegative **cumulative count of reported newsletter clicks** for each subscription. A successful daily report must distinguish an unchanged count from a missing field or failed read. The agreed live test seam is one designated test subscription through the public Beehiiv REST subscription read and a cursor-paginated listing, with only field names, types, response status, and rate-limit headers retained. No subscriber data is needed in this report.

## Evidence

| Question | Current result |
| --- | --- |
| Does the public subscription contract guarantee exact counts? | **No.** The documented `SubscriptionStats` fields are `emails_received`, `open_rate`, and `click_through_rate`. They are not exact open or click counts. The subscription-list and get-by-ID endpoints both support `expand[]=stats`, but their documented stats do not supply the required counters. [List subscriptions](https://developers.beehiiv.com/api-reference/subscriptions/index), [get subscription by ID](https://developers.beehiiv.com/api-reference/subscriptions/get-by-id). |
| Do exact fields appear in the existing test publication? | **Yes, in a bounded live read.** A direct REST get with `expand[]=stats` returned HTTP 200 and integer `total_unique_opened`, `total_clicked`, and `total_unique_clicked` fields. The connected `get_subscription` tool exposed `total_unique_opened` but omitted the click fields; its normalized response is not sufficient for this contract. No reader values or credentials were retained. |
| Does the REST list expose the same fields and cursors? | **Yes, in two bounded pages.** `limit=1&expand[]=stats` returned HTTP 200 on the first and next-cursor page, with the same integer count fields, `has_more: true`, and a next cursor. The connected listing tool still exposes only page-number pagination. A full 10almonds sweep remains untested. [List subscriptions](https://developers.beehiiv.com/api-reference/subscriptions/index), [pagination](https://developers.beehiiv.com/welcome/pagination). |
| Does the sweep fit the rate limit? | **Not yet proven for 10almonds.** The test get reported `RateLimit-Limit: 180`; the bounded list pages reported remaining values consistent with an 800-request bucket. These different headers need explanation before scheduling a sweep. The prior 246,909-subscription listing implies at least 2,470 pages at 100 per page, before retries and other integrations. [Rate limiting](https://developers.beehiiv.com/welcome/rate-limiting). |
| Do counts include automation or web-post clicks? | **Unknown.** The documented subscription fields are rates without a source breakdown. Beehiiv's post statistics distinguish email clicks from web clicks, but that publication-level distinction does not define a subscriber counter. [Get aggregate post stats](https://developers.beehiiv.com/api-reference/posts/aggregate-stats). |

The existing `src/integrations/beehiiv.js` comment about `stats.total_clicked` now has a direct test-publication observation behind the field name. That observation does not establish event uniqueness, source scope, stability in 10almonds, or full-audience sweep capacity. The checkout still has no configured test key; the bounded probe used an existing locally held key without printing or copying it. The connected Beehiiv tool cannot issue the needed cursor and expansion request.

## Safe proof path

1. **Done:** Use the existing test publication and test subscription with read-only REST access. The token, subscription ID, email, and count values were not retained in this report.
2. **Done:** `GET /v2/publications/{publicationId}/subscriptions/{subscriptionId}?expand[]=stats` returned HTTP 200 and integer exact-count fields; missing fields must still remain unknown, never zero.
3. **Done:** `GET /v2/publications/{publicationId}/subscriptions?limit=1&expand[]=stats` and one next-cursor page returned the same count-field names/types and usable `has_more`/`next_cursor`. Payloads and cursors were discarded.
4. For the test subscription only, compare the counters before and after one controlled newsletter email open and one controlled link click. Repeat a click and, separately, a web-post/automation click if those channels are intended to count. Check whether the counters change as expected and whether Beehiiv's source classification agrees. Do not infer uniqueness or scope from a single static response.
5. Read the live rate-limit headers and publication plan, then calculate `ceil(audience / 100)` plus headroom for other scheduled Beehiiv work and retries. Run a small, bounded cursor sweep with pacing before scheduling any full-audience sweep.

## Gate and ticket dependencies

**No-go for v2 open/click scoring, reported click streaks, historical awards, and share-card open/click counts until the safe proof path passes.** Rates must not be multiplied by `emails_received` to invent exact counts. This does not block independent forest, private-access, or fixed reward-model work with synthetic data.

[GitHub issue #2](https://github.com/mhdhadi2005/my-daily-garden/issues/2) remains open for source semantics and production-rate proof. It blocks [daily credits](https://github.com/mhdhadi2005/my-daily-garden/issues/4), [historical recognition](https://github.com/mhdhadi2005/my-daily-garden/issues/5), and the pilot. Referral proof is separate. No subscriber record or production configuration was changed.
