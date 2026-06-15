<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

defined('ABSPATH') || exit;

/**
 * Captures 404 (not-found) hits so admins can convert them into redirects.
 *
 * Hooks into template_redirect — runs AFTER the Redirects module so we only
 * log misses that weren't already redirected.
 */
final class NotFoundMonitor
{
    /**
     * Never log paths matching these patterns. These are not lost-traffic 404s
     * a redirect could recover — they're static assets, WP internals, search-
     * engine verification files, or (most importantly) hostile vulnerability
     * scanners probing for secrets/exploits. Logging them would pollute the
     * redirect suggestions with un-actionable noise and bloat the table.
     */
    public const EXCLUDE_PATTERNS = [
        // Static assets + WP internals
        '/\.(jpg|jpeg|png|gif|webp|avif|svg|ico|css|js|map|woff2?|ttf|eot)$/i',
        '/\/wp-admin\//',
        '/\/wp-includes\//',
        '/\/wp-content\/uploads\//',
        '/\/wp-json\//',
        '/\.php(\?|$)/i',
        '/\/feed\/?$/',
        '/\/xmlrpc\.php/i',
        '/^\/\?p=/', // attempts to use the redirector

        // Search-engine verification files (benign, but not lost traffic)
        '/^\/google[0-9a-f]+\.html$/i',
        '/^\/BingSiteAuth\.xml$/i',
        '/^\/yandex_[0-9a-f]+\.html$/i',
        '/^\/(pinterest-[0-9a-z]+|[0-9a-f]{32})\.html$/i',

        // Hostile scanner / recon probes — never redirect these
        '/\/\.(env|git|svn|hg|aws|ssh|htpasswd|htaccess|DS_Store)\b/i',
        '/\/wp-content\/(plugins|themes|mu-plugins)\//i',
        '/\/(vendor|node_modules|\.idea|\.vscode)\//i',
        '/wp-config(\.php)?(\.(bak|old|orig|save|txt|swp|dist|sample|backup))?$/i',
        '/\.(sql|bak|old|orig|save|swp|log|zip|tar|gz|rar|7z|backup|dist)$/i',
        '/\/(phpmyadmin|pma|adminer|mysql|dbadmin|myadmin|sqlmanager)\b/i',
        '/\/(\.well-known\/(?!acme))/i', // allow ACME (Let's Encrypt), drop other probes
        '/\/(shell|cmd|backdoor|c99|r57|webshell|eval-stdin)\b/i',
        '/\/(owa|autodiscover|ecp|exchange)\//i',
        '/\/cgi-bin\//i',
    ];

    public static function register_hooks(): void
    {
        // Priority 5 — runs after Redirects (which is at 1).
        add_action('template_redirect', [self::class, 'maybe_log'], 5);
    }

    public static function maybe_log(): void
    {
        if (!is_404() || is_admin()) {
            return;
        }

        $path = self::current_path();
        if ($path === '' || self::is_excluded($path)) {
            return;
        }

        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_not_found';
        $site  = get_current_blog_id();
        $ref   = isset($_SERVER['HTTP_REFERER']) ? esc_url_raw((string) $_SERVER['HTTP_REFERER']) : '';
        $ua    = isset($_SERVER['HTTP_USER_AGENT']) ? substr(sanitize_text_field((string) $_SERVER['HTTP_USER_AGENT']), 0, 255) : '';

        // Upsert — increment hit_count when path is seen again.
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT id, hit_count FROM {$table} WHERE site_id = %d AND path = %s",
            $site,
            $path
        ));

        if ($existing) {
            $wpdb->update(
                $table,
                [
                    'hit_count' => ((int) $existing->hit_count) + 1,
                    'last_seen' => current_time('mysql'),
                    'referrer'  => $ref,
                    'user_agent' => $ua,
                ],
                ['id' => (int) $existing->id]
            );
        } else {
            $wpdb->insert($table, [
                'site_id'    => $site,
                'path'       => $path,
                'referrer'   => $ref,
                'user_agent' => $ua,
                'hit_count'  => 1,
                'first_seen' => current_time('mysql'),
                'last_seen'  => current_time('mysql'),
                'status'     => 'open',
            ]);
        }
    }

    private static function current_path(): string
    {
        $uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '';
        $uri = sanitize_text_field($uri);
        $parts = wp_parse_url($uri);
        $path  = (string) ($parts['path'] ?? '');
        $query = isset($parts['query']) ? '?' . (string) $parts['query'] : '';
        // Hard cap to avoid pathological lengths.
        return substr($path . $query, 0, 2000);
    }

    private static function is_excluded(string $path): bool
    {
        foreach (self::EXCLUDE_PATTERNS as $pattern) {
            if (preg_match($pattern, $path)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Remove already-logged 404 rows that now match the exclusion patterns
     * (scanner/verification noise). Runs once on plugin upgrade so existing
     * lists are cleaned up, not just future hits. Returns rows deleted.
     */
    public static function purge_excluded_rows(): int
    {
        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_not_found';

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $rows = $wpdb->get_results("SELECT id, path FROM {$table}");
        if (empty($rows)) {
            return 0;
        }

        $delete_ids = [];
        foreach ($rows as $row) {
            if (self::is_excluded((string) $row->path)) {
                $delete_ids[] = (int) $row->id;
            }
        }

        if (empty($delete_ids)) {
            return 0;
        }

        $placeholders = implode(',', array_fill(0, count($delete_ids), '%d'));
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $wpdb->query($wpdb->prepare("DELETE FROM {$table} WHERE id IN ({$placeholders})", ...$delete_ids));

        return count($delete_ids);
    }
}
