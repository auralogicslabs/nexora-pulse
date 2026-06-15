<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

defined('ABSPATH') || exit;

/**
 * Soft redirect engine — hooks into template_redirect (no server config needed).
 * Universal compatibility: Apache, Nginx, IIS, managed hosts.
 */
final class Redirects
{
    public static function maybe_redirect(): void
    {
        if (is_admin() || wp_doing_ajax() || wp_doing_cron()) {
            return;
        }

        global $wpdb;
        $request_uri = $_SERVER['REQUEST_URI'] ?? '';
        $site_url    = get_site_url();
        $current_url = trailingslashit($site_url . strtok($request_uri, '?'));

        $table      = $wpdb->prefix . 'nexora_pulse_redirects';
        $redirect   = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE site_id = %d AND source_url = %s AND is_active = 1 LIMIT 1",
            get_current_blog_id(),
            $current_url
        ));

        if (!$redirect) {
            return;
        }

        // Track hit.
        $wpdb->query($wpdb->prepare(
            "UPDATE {$table} SET hits = hits + 1, last_hit_at = %s WHERE id = %d",
            current_time('mysql'),
            $redirect->id
        ));

        wp_redirect(esc_url_raw($redirect->target_url), (int) $redirect->type);
        exit;
    }
}
