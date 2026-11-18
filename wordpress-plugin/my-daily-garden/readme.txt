=== My Daily Garden ===
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

Shows each logged-in reader their My Daily Garden on their account page, and adds garden points for shop purchases.

== Description ==

Readers of the 10almonds newsletter grow an almond tree by opening emails and clicking links. Grown trees go into their own forest. This plugin brings that garden into WordPress:

* A "My Garden" tab on the WooCommerce account page (can be turned off).
* The shortcode [my_daily_garden] to show the garden on any page.
* Completed WooCommerce orders add garden points (each order counts once).

The garden runs on its own server. WordPress checks who is logged in and asks the garden for a short-lived pass to that reader's garden, signing every request with a shared secret, so nobody can open someone else's garden or award themselves points.

== Installation ==

1. Plugins → Add New → Upload Plugin, choose my-daily-garden.zip, then Install and Activate.
2. Settings → My Daily Garden: paste the shared secret (the same value as WP_APP_SHARED_SECRET on the garden app) and save. The page shows "Connected" when it works.
3. Log in as a reader who has clicked a newsletter link, and open My Account → My Garden.

== Notes ==

* Readers are matched by email the first time they open their garden, then by their WordPress account.
* Someone who hasn't clicked a newsletter link yet sees a short message instead of a garden.
* Points are added when an order is marked Completed. If the garden is briefly unreachable, the plugin tries again a few times and leaves an order note if it gives up.
