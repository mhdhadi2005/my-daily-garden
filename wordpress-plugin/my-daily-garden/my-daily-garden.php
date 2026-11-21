<?php
/**
 * Plugin Name:       My Daily Garden
 * Plugin URI:        https://10almonds.com
 * Description:       Shows each logged-in reader their My Daily Garden (the almond tree they grow by reading the newsletter, and their forest) on their account page, and adds garden points for shop purchases.
 * Version:           1.1.1
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            10almonds
 * License:           GPL-2.0-or-later
 * Text Domain:       my-daily-garden
 *
 * How it fits together: the garden itself runs on its own server (the
 * "garden app"). This plugin never trusts the browser: WordPress checks who
 * is logged in, then asks the garden app — signing each request with a
 * shared secret — for a short-lived pass to that reader's garden, and shows
 * the garden in a sandboxed frame. Only accounts linked to a garden (by hand,
 * for verified participants) get one.
 *
 * Purchase points are OFF unless switched on in the settings. When on, a
 * completed order of a linked participant is sent from a background job (never
 * inside order completion), without the customer's email, at most a few times,
 * and the garden app counts each order once.
 */

if (!defined('ABSPATH')) {
    exit;
}

define('MDG_VERSION', '1.1.1');
define('MDG_OPTION', 'mdg_settings');
define('MDG_DEFAULT_APP_URL', 'https://my-daily-garden-production.up.railway.app');
define('MDG_ACCOUNT_ENDPOINT', 'my-garden');
define('MDG_MAX_RETRIES', 5);
define('MDG_JOB_GROUP', 'my-daily-garden');

/* ── Settings ─────────────────────────────────────────────────────────── */

function mdg_settings() {
    $saved = get_option(MDG_OPTION, array());
    if (!is_array($saved)) {
        $saved = array();
    }
    return array(
        'app_url'     => untrailingslashit(!empty($saved['app_url']) ? $saved['app_url'] : MDG_DEFAULT_APP_URL),
        'secret'      => isset($saved['secret']) ? (string) $saved['secret'] : '',
        'account_tab' => isset($saved['account_tab']) ? (int) $saved['account_tab'] : 1,
        'purchases'   => !empty($saved['purchases']) ? 1 : 0,
    );
}

function mdg_sanitize_settings($input) {
    $old = get_option(MDG_OPTION, array());
    $out = array();
    $url = isset($input['app_url']) ? esc_url_raw(trim((string) $input['app_url']), array('https')) : '';
    if ($url === '' && !empty($input['app_url'])) {
        add_settings_error(MDG_OPTION, 'mdg_https', 'The garden app address must start with https://, so the default address was kept.');
    }
    $out['app_url'] = $url !== '' ? untrailingslashit($url) : MDG_DEFAULT_APP_URL;
    // The secret field is always shown empty; leaving it empty keeps the saved one.
    $secret = isset($input['secret']) ? trim((string) $input['secret']) : '';
    $out['secret'] = $secret !== '' ? $secret : (is_array($old) && isset($old['secret']) ? (string) $old['secret'] : '');
    $out['account_tab'] = !empty($input['account_tab']) ? 1 : 0;
    $out['purchases'] = !empty($input['purchases']) ? 1 : 0;
    return $out;
}

add_action('admin_init', function () {
    register_setting('mdg_settings_group', MDG_OPTION, array('sanitize_callback' => 'mdg_sanitize_settings'));
});

add_action('admin_menu', function () {
    add_options_page('My Daily Garden', 'My Daily Garden', 'manage_options', 'my-daily-garden', 'mdg_render_settings_page');
});

add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
    array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=my-daily-garden')) . '">Settings</a>');
    return $links;
});

function mdg_render_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    $s = mdg_settings();
    ?>
    <div class="wrap">
        <h1>My Daily Garden</h1>
        <p>Readers grow an almond tree by reading the 10almonds newsletter. This plugin shows them their garden on their account page and adds garden points when they buy from the shop.</p>
        <?php mdg_render_connection_status($s); ?>
        <form method="post" action="options.php">
            <?php settings_fields('mdg_settings_group'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="mdg_app_url">Garden app address</label></th>
                    <td>
                        <input type="url" id="mdg_app_url" class="regular-text" name="<?php echo esc_attr(MDG_OPTION); ?>[app_url]" value="<?php echo esc_attr($s['app_url']); ?>">
                        <p class="description">Where the garden runs. Leave as it is unless the garden moves.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="mdg_secret">Shared secret</label></th>
                    <td>
                        <input type="password" id="mdg_secret" class="regular-text" name="<?php echo esc_attr(MDG_OPTION); ?>[secret]" value="" autocomplete="new-password"
                            placeholder="<?php echo esc_attr($s['secret'] !== '' ? 'Saved — leave empty to keep it' : 'Paste the secret here'); ?>">
                        <p class="description">Must match <code>WP_APP_SHARED_SECRET</code> on the garden app. Treat it like a password.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Account page</th>
                    <td>
                        <label>
                            <input type="checkbox" name="<?php echo esc_attr(MDG_OPTION); ?>[account_tab]" value="1" <?php checked($s['account_tab'], 1); ?>>
                            Add a “My Garden” tab to the WooCommerce account page
                        </label>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Purchase points</th>
                    <td>
                        <label>
                            <input type="checkbox" name="<?php echo esc_attr(MDG_OPTION); ?>[purchases]" value="1" <?php checked($s['purchases'], 1); ?>>
                            Give garden points for completed orders
                        </label>
                        <p class="description">Off until you’re ready. When on, completed orders of customers whose account is linked to a garden are sent in the background: user ID, order number, total and currency (no email, address or products). Guests and other customers are never sent.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
        <h2>Showing the garden on another page</h2>
        <p>Add the shortcode <code>[my_daily_garden]</code> to any page. Logged-in readers whose account is linked to a garden see it; everyone else sees a short message.</p>
        <h2>Stopping it</h2>
        <p>Deactivating the plugin stops everything it sends and removes its queued jobs. To pause only purchase points, untick “Give garden points for completed orders”.</p>
    </div>
    <?php
}

function mdg_render_connection_status($s) {
    if ($s['secret'] === '') {
        echo '<div class="notice notice-warning inline"><p><strong>Not connected yet:</strong> paste the shared secret below and save.</p></div>';
        return;
    }
    $result = mdg_post('/api/wp/ping', array('site' => home_url()));
    if (is_wp_error($result)) {
        echo '<div class="notice notice-error inline"><p><strong>Can’t reach the garden:</strong> ' . esc_html($result->get_error_message()) . '</p></div>';
        return;
    }
    echo '<div class="notice notice-success inline"><p><strong>Connected</strong> to the garden app.</p></div>';
}

/* ── Talking to the garden app ────────────────────────────────────────── */

/**
 * POSTs $body to the garden app, signed with the shared secret.
 * Returns the decoded reply, or a WP_Error.
 */
function mdg_post($path, $body) {
    $s = mdg_settings();
    if ($s['secret'] === '') {
        return new WP_Error('mdg_not_configured', 'The shared secret isn’t set (Settings → My Daily Garden).');
    }
    $json = wp_json_encode($body);
    $timestamp = (string) time();
    if (strpos($s['app_url'], 'https://') !== 0) {
        return new WP_Error('mdg_not_https', 'The garden app address must use https.');
    }
    $response = wp_safe_remote_post($s['app_url'] . $path, array(
        'headers' => array(
            'Content-Type'   => 'application/json',
            'X-WP-Signature' => hash_hmac('sha256', $timestamp . ':' . $json, $s['secret']),
            'X-WP-Timestamp' => $timestamp,
        ),
        'body'    => $json,
        'timeout' => 8,
    ));
    if (is_wp_error($response)) {
        return $response;
    }
    $code = (int) wp_remote_retrieve_response_code($response);
    $data = json_decode(wp_remote_retrieve_body($response), true);
    if ($code === 401) {
        return new WP_Error('mdg_bad_secret', 'The garden app didn’t accept the shared secret. Check it matches WP_APP_SHARED_SECRET.');
    }
    if ($code !== 200 || !is_array($data)) {
        return new WP_Error('mdg_bad_reply', sprintf('The garden app replied with an error (HTTP %d).', $code));
    }
    return $data;
}

/* ── The garden on the page ───────────────────────────────────────────── */

// The page asks this route for a pass once it's loaded, so the account page
// itself never waits on the garden app.
add_action('rest_api_init', function () {
    register_rest_route('mydailygarden/v1', '/session', array(
        'methods'             => 'GET',
        'permission_callback' => function () {
            return is_user_logged_in();
        },
        'callback'            => 'mdg_rest_session',
    ));
});

function mdg_rest_session() {
    $user = wp_get_current_user();
    $data = mdg_post('/api/wp/session', array('wp_user_id' => (int) $user->ID)); // the user ID only: accounts are linked by hand
    if (is_wp_error($data)) {
        return new WP_REST_Response(array('error' => 'unavailable'), 502);
    }
    if (empty($data['linked']) || empty($data['pass'])) {
        delete_user_meta($user->ID, '_mdg_linked');
        return rest_ensure_response(array('linked' => false));
    }
    update_user_meta($user->ID, '_mdg_linked', 1); // purchase points are only ever sent for linked accounts
    $s = mdg_settings();
    return rest_ensure_response(array(
        'linked' => true,
        // After the #, so the pass is never sent to any server or written to its logs.
        'url'    => $s['app_url'] . '/#pass=' . rawurlencode($data['pass']),
    ));
}

function mdg_render_garden() {
    if (!is_user_logged_in()) {
        $login = wp_login_url(get_permalink());
        return '<div class="mdg-garden mdg-garden--message"><p>Please <a href="' . esc_url($login) . '">log in</a> to see your garden.</p></div>';
    }
    $id = 'mdg-garden-' . wp_rand(1000, 999999);
    ob_start();
    ?>
    <div id="<?php echo esc_attr($id); ?>" class="mdg-garden"
        data-rest-url="<?php echo esc_url(rest_url('mydailygarden/v1/session')); ?>"
        data-nonce="<?php echo esc_attr(wp_create_nonce('wp_rest')); ?>">
        <p class="mdg-garden__status">Loading your garden…</p>
    </div>
    <style>
        .mdg-garden { width: 100%; margin: 0 0 1.5em; }
        .mdg-garden__frame { display: block; width: 100%; height: 88vh; min-height: 620px; max-height: 1000px; border: 0; border-radius: 16px; background: #9DB57E; }
        .mdg-garden__status { padding: 1.2em 1.4em; border-radius: 12px; background: #F7FAFC; font-size: 1.05em; line-height: 1.5; }
    </style>
    <script>
    (function () {
        var root = document.getElementById(<?php echo wp_json_encode($id); ?>);
        if (!root) { return; }
        var status = root.querySelector('.mdg-garden__status');
        function say(text) { status.textContent = text; }
        fetch(root.getAttribute('data-rest-url'), {
            credentials: 'same-origin',
            headers: { 'X-WP-Nonce': root.getAttribute('data-nonce') }
        })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
            .then(function (data) {
                if (!data.linked) {
                    say('Your garden isn’t connected to this account yet. If you read the 10almonds newsletter, your garden opens from the link in each email.');
                    return;
                }
                var frame = document.createElement('iframe');
                frame.className = 'mdg-garden__frame';
                frame.title = 'My Daily Garden';
                frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
                frame.setAttribute('referrerpolicy', 'no-referrer');
                frame.src = data.url;
                root.replaceChild(frame, status);
            })
            .catch(function () {
                say('Your garden couldn’t load just now. Please refresh the page in a moment.');
            });
    })();
    </script>
    <?php
    return ob_get_clean();
}

add_shortcode('my_daily_garden', 'mdg_render_garden');
add_shortcode('my_daily_garden_tree', 'mdg_render_garden'); // the name the first connector snippet used

/* ── “My Garden” tab on the WooCommerce account page ──────────────────── */

function mdg_add_account_endpoint() {
    add_rewrite_endpoint(MDG_ACCOUNT_ENDPOINT, EP_ROOT | EP_PAGES);
}
add_action('init', 'mdg_add_account_endpoint');

add_filter('woocommerce_get_query_vars', function ($vars) {
    $vars[MDG_ACCOUNT_ENDPOINT] = MDG_ACCOUNT_ENDPOINT;
    return $vars;
});

add_filter('woocommerce_account_menu_items', function ($items) {
    $s = mdg_settings();
    if (!$s['account_tab']) {
        return $items;
    }
    // Second in the menu, straight after the dashboard.
    $out = array();
    $added = false;
    foreach ($items as $key => $label) {
        $out[$key] = $label;
        if ($key === 'dashboard') {
            $out[MDG_ACCOUNT_ENDPOINT] = 'My Garden';
            $added = true;
        }
    }
    if (!$added) {
        $out = array(MDG_ACCOUNT_ENDPOINT => 'My Garden') + $out;
    }
    return $out;
});

add_filter('woocommerce_endpoint_' . MDG_ACCOUNT_ENDPOINT . '_title', function () {
    return 'My Garden';
});

add_action('woocommerce_account_' . MDG_ACCOUNT_ENDPOINT . '_endpoint', function () {
    echo mdg_render_garden(); // phpcs:ignore WordPress.Security.EscapeOutput -- built from escaped parts above
});

register_activation_hook(__FILE__, function () {
    mdg_add_account_endpoint();
    flush_rewrite_rules();
});

register_deactivation_hook(__FILE__, function () {
    flush_rewrite_rules();
    mdg_clear_jobs();
});

// Removes every queued purchase job, whatever order it was for.
function mdg_clear_jobs() {
    if (function_exists('as_unschedule_all_actions')) {
        as_unschedule_all_actions('mdg_send_purchase'); // by hook alone, so every order's job goes, whatever its arguments
    }
    wp_unschedule_hook('mdg_send_purchase');
    wp_unschedule_hook('mdg_retry_purchase'); // the name version 1.0.0 used
}

/* ── Purchase points ──────────────────────────────────────────────────── */

add_action('before_woocommerce_init', function () {
    // Only the WooCommerce order API is used, so the newer order storage is fine.
    if (class_exists('\Automattic\WooCommerce\Utilities\FeaturesUtil')) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
    }
});

add_action('woocommerce_order_status_completed', 'mdg_queue_purchase', 10, 1);
add_action('mdg_send_purchase', 'mdg_send_purchase', 10, 1);

// Runs inside order completion, so it only queues a background job: the
// garden app being slow or down can never hold up an order.
function mdg_queue_purchase($order_id) {
    $s = mdg_settings();
    if (!$s['purchases'] || !function_exists('wc_get_order')) {
        return;
    }
    $order = wc_get_order($order_id);
    if (!$order || $order->get_meta('_mdg_points_sent')) {
        return;
    }
    $customer = (int) $order->get_customer_id();
    if (!$customer || !get_user_meta($customer, '_mdg_linked', true)) {
        return; // guests and customers without a linked garden are never sent
    }
    mdg_schedule_send($order->get_id(), 0);
}

function mdg_schedule_send($order_id, $delay) {
    if (function_exists('as_schedule_single_action')) {
        as_schedule_single_action(time() + $delay, 'mdg_send_purchase', array((int) $order_id), MDG_JOB_GROUP);
    } else {
        wp_schedule_single_event(time() + $delay, 'mdg_send_purchase', array((int) $order_id));
    }
}

function mdg_send_purchase($order_id) {
    $s = mdg_settings();
    if (!$s['purchases'] || !function_exists('wc_get_order')) {
        return;
    }
    $order = wc_get_order($order_id);
    if (!$order || $order->get_meta('_mdg_points_sent')) {
        return;
    }
    $result = mdg_post('/api/wp/purchase', array(
        'wp_user_id' => (int) $order->get_customer_id(),
        'order_id'   => 'wc_' . $order->get_id(), // the same for every retry, so it only ever counts once
        'total'      => (float) $order->get_total(),
        'currency'   => (string) $order->get_currency(),
    ));

    if (is_wp_error($result) || !array_key_exists('credited', $result)) {
        // The garden app may be asleep or restarting: try again a few times, further apart each time.
        $tries = (int) $order->get_meta('_mdg_points_tries') + 1;
        $order->update_meta_data('_mdg_points_tries', $tries);
        $order->save();
        if ($tries < MDG_MAX_RETRIES) {
            mdg_schedule_send($order->get_id(), 600 * $tries);
        } else {
            $why = is_wp_error($result) ? $result->get_error_message() : 'unexpected reply';
            $order->add_order_note('My Daily Garden: couldn’t send this order’s garden points (' . $why . ').');
        }
        return;
    }

    $order->update_meta_data('_mdg_points_sent', 1);
    $order->save();
    if (!empty($result['credited'])) {
        $order->add_order_note(sprintf('My Daily Garden: %s points added to the customer’s garden.', number_format_i18n((int) $result['pointsAwarded'])));
    }
}
