<?php
/**
 * My Daily Garden — WordPress connector snippet
 *
 * Paste this into WPCode as a PHP snippet (run everywhere / frontend).
 * This is the ONLY code that needs to live on the WordPress site — see
 * the "Authentication" section of the architecture doc for why it works
 * this way instead of the page calling the app directly.
 *
 * Before this works, set MDG_APP_URL and MDG_SHARED_SECRET below (the
 * shared secret must match WP_APP_SHARED_SECRET in the app's .env — treat
 * it like a password, don't commit it to a public repo).
 */

define('MDG_APP_URL', 'https://my-daily-garden-production.up.railway.app');
define('MDG_SHARED_SECRET', 'REPLACE-WITH-A-LONG-RANDOM-SECRET');

add_action('rest_api_init', function () {
    register_rest_route('mydailygarden/v1', '/tree', [
        'methods'  => 'GET',
        // is_user_logged_in permission check means WordPress itself refuses
        // the request before our callback even runs if she's not logged in —
        // this is the server-side verification the architecture doc describes.
        'permission_callback' => function () {
            return is_user_logged_in();
        },
        'callback' => 'mdg_get_tree_status',
    ]);
});

// Makes a REST nonce available to the shortcode's JS below (wpApiSettings.nonce) —
// required for WordPress to accept a cookie-authenticated REST request from
// the browser as genuinely coming from the logged-in session, not a forged one.
add_action('wp_enqueue_scripts', function () {
    wp_register_script('mdg-nonce-holder', false);
    wp_enqueue_script('mdg-nonce-holder');
    wp_localize_script('mdg-nonce-holder', 'wpApiSettings', [
        'nonce' => wp_create_nonce('wp_rest'),
    ]);
});

function mdg_get_tree_status() {
    $user_id = get_current_user_id();

    $body = ['wp_user_id' => $user_id];
    $timestamp = time();
    $payload = $timestamp . ':' . wp_json_encode($body);
    $signature = hash_hmac('sha256', $payload, MDG_SHARED_SECRET);

    $response = wp_remote_post(MDG_APP_URL . '/api/wp/tree-status', [
        'headers' => [
            'Content-Type'   => 'application/json',
            'X-WP-Signature' => $signature,
            'X-WP-Timestamp' => (string) $timestamp,
        ],
        'body'    => wp_json_encode($body),
        'timeout' => 8,
    ]);

    if (is_wp_error($response)) {
        return new WP_REST_Response(['error' => 'garden app unreachable'], 502);
    }

    $data = json_decode(wp_remote_retrieve_body($response), true);
    return new WP_REST_Response($data, 200);
}

/**
 * Shortcode so the tree can be dropped into the My Account page (or
 * anywhere else) via Elementor or the block editor: [my_daily_garden_tree]
 * This just renders a small placeholder that fetches from the REST route
 * above via JS — keeps the PHP side minimal and the actual visual/animation
 * work in the app's own front-end code.
 */
add_shortcode('my_daily_garden_tree', function () {
    if (!is_user_logged_in()) {
        return ''; // logged-out visitors simply don't see the tree
    }
    ob_start();
    ?>
    <div id="mdg-tree-root" data-rest-url="<?php echo esc_url(rest_url('mydailygarden/v1/tree')); ?>">
        <p>Loading your garden…</p>
    </div>
    <script>
    (function () {
        var root = document.getElementById('mdg-tree-root');
        // typeof guard, not a truthiness check: wpApiSettings is an undeclared
        // global if the localize script didn't run, and touching it directly
        // throws a ReferenceError that kills the whole fetch.
        var nonce = (typeof wpApiSettings !== 'undefined' && wpApiSettings.nonce) ? wpApiSettings.nonce : '';
        fetch(root.dataset.restUrl, {
            credentials: 'same-origin',
            headers: { 'X-WP-Nonce': nonce }
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.linked) {
                    root.innerHTML = '<p>Click a link in tomorrow\'s newsletter to start your garden!</p>';
                    return;
                }
                root.innerHTML =
                    '<p><strong>' + data.stage + '</strong> — ' + data.streak + ' day streak, ' + data.points + ' points</p>';
                // The real prototype's animated tree/growth UI gets mounted
                // here instead of this placeholder once the app is deployed.
            })
            .catch(function () {
                root.innerHTML = '<p>Your garden is updating — check back in a moment.</p>';
            });
    })();
    </script>
    <?php
    return ob_get_clean();
});
