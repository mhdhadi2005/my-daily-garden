# Purchase credit

The signed WooCommerce order webhook credits a matched, completed, paid USD order once. It awards `floor(paid merchandise cents / 50)` garden points, using line totals after discounts and excluding shipping and tax. A later refund leaves earned growth in place. Unmatched or non-USD orders are held by order ID and reason in `v2_purchase_orders`; buyer email is not stored there or logged.

## Pilot gate

Verify against a real test order that WooCommerce delivers `id`, `status`, `date_paid_gmt` (or `date_paid`), `currency`, `billing.email`, and `line_items[].total` in the signed webhook, and confirm the store uses USD. The current tests use the documented WooCommerce order shape and a disposable SQLite database, not a live store delivery.

## Remaining acceptance item: support claim

A held order cannot yet be claimed. Before launch, add a support path that re-fetches the order by its held ID from WooCommerce, verifies the requester controls the billing email and that it matches one existing Beehiiv subscriber, and rechecks completed/paid status, USD currency, and merchandise line totals. Only then change the held receipt to pending for that subscriber and award through the same `purchase:<orderId>` garden credit key. Log the support decision and reviewer without logging the buyer email or credentials. Do not add a route that credits from a supplied order ID and reader ID alone.
