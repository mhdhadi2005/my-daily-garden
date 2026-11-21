=== My Daily Garden ===
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.1.1
License: GPLv2 or later

Shows linked participants their My Daily Garden on their account page, and can add garden points for their shop purchases.

== Description ==

Readers of the 10almonds newsletter grow an almond tree by opening emails and clicking links. Grown trees go into their own forest. This plugin brings that garden into WordPress:

* A "My Garden" tab on the WooCommerce account page (can be turned off), and the shortcode [my_daily_garden].
* Optional garden points for completed WooCommerce orders. Off until you switch it on.

The garden runs on its own server. WordPress checks who is logged in and asks the garden for a short-lived pass to that person's garden, signing every request with a shared secret. The pass goes after the "#" in the frame's address, so it is never sent to a server or written to logs, and the frame is sandboxed.

== Who sees a garden ==

Only accounts linked to a garden. Linking is done by hand for verified participants (on the garden server: node src/scripts/link-wp-user.js <subscriber-id> <wordpress-user-id>). An account's email address is never used to pick a garden. Everyone else sees a short message.

== What is sent to the garden server ==

* Opening the garden: the WordPress user ID.
* A completed order, only if purchase points are switched on and the customer's account is linked: user ID, order number, total and currency. No email, address, products or payment details. Guest orders and other customers are never sent.
* The settings page's connection check: the site address.

== Installation ==

1. Plugins → Add New → Upload Plugin, choose my-daily-garden.zip, then Install and Activate.
2. Settings → My Daily Garden: paste the shared secret (the same value as WP_APP_SHARED_SECRET on the garden server) and save. The page shows "Connected" when it works.
3. Leave "Give garden points for completed orders" off until purchase points are wanted.

== Purchase points ==

When switched on, a completed order is queued as a background job (Action Scheduler, which comes with WooCommerce, or WP-Cron), so order completion never waits for the garden server. The job retries a few times, further apart each time, then leaves an order note if it gives up. The garden server counts each order once, ignores free orders, and can be limited to one currency.

== Stopping it ==

Deactivating the plugin stops everything it sends and removes its queued jobs. Unticking "Give garden points for completed orders" pauses purchase points only.

== Changelog ==

= 1.1.1 =
* Deactivating cancels every queued purchase job (by hook), and deleting the plugin removes its settings, secret and account marks (uninstall.php).
* Note: a participant's account counts as linked for purchase points once they have opened My Garden at least once.

= 1.1.0 =
* Gardens open only for accounts linked by hand; email is no longer sent or used.
* Purchase points off by default; sent from a background job, linked participants only, no email.
* Pass moved after "#"; sandboxed, no-referrer frame; garden address must be https (wp_safe_remote_post).
* Deactivation removes all queued jobs.
