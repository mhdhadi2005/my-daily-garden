<?php
/**
 * Runs when the plugin is deleted from WordPress (not just deactivated):
 * removes its settings (including the shared secret), the "linked" marks on
 * user accounts, its order markers' queued jobs, and its link-rules flag.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('mdg_settings');
delete_option('mdg_rewrite_version');
delete_metadata('user', 0, '_mdg_linked', '', true);

if (function_exists('as_unschedule_all_actions')) {
    as_unschedule_all_actions('mdg_send_purchase');
}
wp_unschedule_hook('mdg_send_purchase');
wp_unschedule_hook('mdg_retry_purchase');
