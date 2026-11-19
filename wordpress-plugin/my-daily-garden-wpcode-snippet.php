/**
 * My Daily Garden — WPCode version of the plugin (wordpress-plugin/my-daily-garden).
 *
 * WPCode: Code Type "PHP Snippet", Insert Method "Auto Insert", Location "Run Everywhere".
 * Before switching it on, replace PASTE-THE-SECRET-HERE below with the shared secret
 * (the same value as WP_APP_SHARED_SECRET on the garden app). Treat it like a password.
 *
 * What it does: a "My Garden" tab on the WooCommerce account page and the
 * [my_daily_garden] shortcode show the logged-in reader their garden in a frame;
 * completed WooCommerce orders add garden points (once per order). WordPress checks
 * who is logged in and signs every request to the garden app with the secret.
 */

if (!function_exists('mdg_settings')) { // the plugin version, if installed later, takes over

define('MDG_SECRET', 'PASTE-THE-SECRET-HERE');
define('MDG_APP_URL', 'https://my-daily-garden-production.up.railway.app');
define('MDG_VERSION', '1.0.0');
define('MDG_ACCOUNT_ENDPOINT', 'my-garden');
define('MDG_MAX_RETRIES', 5);

function mdg_settings() {
    $secret = trim((string) MDG_SECRET);
    return array(
        'app_url'     => untrailingslashit(MDG_APP_URL),
        'secret'      => ($secret === '' || $secret === 'PASTE-THE-SECRET-HERE') ? '' : $secret,
        'account_tab' => 1,
    );
}

/* ── Talking to the garden app ────────────────────────────────────────── */

/**
 * POSTs $body to the garden app, signed with the shared secret.
 * Returns the decoded reply, or a WP_Error.
 */
function mdg_post($path, $body) {
    $s = mdg_settings();
    if ($s['secret'] === '') {
        return new WP_Error('mdg_not_configured', 'The shared secret isn’t set (in the My Daily Garden snippet in WPCode).');
    }
    $json = wp_json_encode($body);
    $timestamp = (string) time();
    $response = wp_remote_post($s['app_url'] . $path, array(
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
    $data = mdg_post('/api/wp/session', array(
        'wp_user_id' => (int) $user->ID,
        'email'      => (string) $user->user_email,
    ));
    if (is_wp_error($data)) {
        return new WP_REST_Response(array('error' => 'unavailable'), 502);
    }
    if (empty($data['linked']) || empty($data['pass'])) {
        return rest_ensure_response(array('linked' => false));
    }
    $s = mdg_settings();
    return rest_ensure_response(array(
        'linked' => true,
        'url'    => $s['app_url'] . '/?pass=' . rawurlencode($data['pass']),
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
                    say('Your garden starts when you click a link in the 10almonds newsletter. Come back after your next email, and your almond tree will be here!');
                    return;
                }
                var frame = document.createElement('iframe');
                frame.className = 'mdg-garden__frame';
                frame.title = 'My Daily Garden';
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

// The new account-page address needs WordPress's link rules rebuilt once
// (a plugin does this when it's activated; a snippet has no such moment).
add_action('init', function () {
    if (get_option('mdg_rewrite_version') !== MDG_VERSION) {
        flush_rewrite_rules(false);
        update_option('mdg_rewrite_version', MDG_VERSION);
    }
}, 99);

/* ── Purchase points ──────────────────────────────────────────────────── */

add_action('woocommerce_order_status_completed', 'mdg_send_purchase', 10, 1);
add_action('mdg_retry_purchase', 'mdg_send_purchase', 10, 1);

function mdg_send_purchase($order_id) {
    if (!function_exists('wc_get_order')) {
        return;
    }
    $order = wc_get_order($order_id);
    if (!$order || $order->get_meta('_mdg_points_sent')) {
        return;
    }
    $result = mdg_post('/api/wp/purchase', array(
        'wp_user_id' => (int) $order->get_customer_id(),
        'email'      => (string) $order->get_billing_email(),
        'order_id'   => 'wc_' . $order->get_id(),
        'total'      => (float) $order->get_total(),
        'currency'   => (string) $order->get_currency(),
    ));

    if (is_wp_error($result)) {
        // The garden app may be asleep or restarting: try again later.
        $tries = (int) $order->get_meta('_mdg_points_tries') + 1;
        $order->update_meta_data('_mdg_points_tries', $tries);
        $order->save();
        if ($tries < MDG_MAX_RETRIES) {
            wp_schedule_single_event(time() + 600 * $tries, 'mdg_retry_purchase', array($order->get_id()));
        } else {
            $order->add_order_note('My Daily Garden: couldn’t send this order’s garden points (' . $result->get_error_message() . ').');
        }
        return;
    }

    $order->update_meta_data('_mdg_points_sent', 1);
    $order->save();
    if (!empty($result['credited'])) {
        $order->add_order_note(sprintf('My Daily Garden: %s points added to the customer’s garden.', number_format_i18n((int) $result['pointsAwarded'])));
    } elseif (!empty($result['reason']) && $result['reason'] !== 'already credited') {
        $order->add_order_note('My Daily Garden: no points added — this customer hasn’t started a garden yet.');
    }
}

} // end of My Daily Garden
