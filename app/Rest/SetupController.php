<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

/**
 * Setup / "Get Started" controller.
 *
 * Computes the real status of every SEO foundation and Google connection so the
 * Get Started page can show an honest, auto-detected checklist — and performs
 * the safe 1-click foundation actions (verification meta, sitemap submit info).
 */
final class SetupController extends BaseController
{
    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/setup/status', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_status'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/setup/verify-google', [
            'methods'             => 'POST',
            'callback'            => [$this, 'save_google_verification'],
            'permission_callback' => [$this, 'update_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/setup/mark-sitemap-submitted', [
            'methods'             => 'POST',
            'callback'            => [$this, 'mark_sitemap_submitted'],
            'permission_callback' => [$this, 'update_item_permissions_check'],
        ]);
    }

    public function get_status(WP_REST_Request $request): WP_REST_Response
    {
        $settings = new \NexoraPulse\Services\SettingsService();

        // ── Foundations (Pulse provides these) ──────────────────────────
        $sitemap_url = home_url('/nexora-sitemap.xml');
        // SocialPreview emits the verification meta from this option.
        $verify_code = (string) get_option('nexora_pulse_verify_google', '');

        // ── Connections ────────────────────────────────────────────────
        $gsc          = new \NexoraPulse\Modules\GscSync();
        $gsc_status   = $gsc->get_connection_status();
        $gsc_connected = !empty($gsc_status['connected']);
        $pagespeed_connected = !empty($settings->get_encrypted('pagespeed_api_key'));
        $ai_connected = !empty($settings->get_encrypted('ai_api_key'));

        // ── Analysis state ─────────────────────────────────────────────
        global $wpdb;
        $issues_table = $wpdb->prefix . 'nexora_pulse_issues';
        $site_id      = $this->get_site_id();
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $issue_rows   = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$issues_table} WHERE site_id = %d", $site_id));
        $scan_done    = $issue_rows > 0;

        $index_table  = $wpdb->prefix . 'nexora_pulse_index_status';
        // The Index Doctor table may not exist until first run — guard it.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery
        $index_exists = (string) $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $index_table)) === $index_table;
        $index_done   = false;
        if ($index_exists) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            $index_done = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$index_table} WHERE site_id = %d", $site_id)) > 0;
        }

        $is_pro = (new \NexoraPulse\Services\FeatureGate())->is_pro();

        // Each item: id, done, plus item-specific data for the UI.
        $items = [
            // Phase 1 — Foundations
            'sitemap' => [
                'done'        => true, // Pulse serves an XML sitemap automatically.
                'sitemap_url' => $sitemap_url,
            ],
            'meta' => [
                // Considered handled once the user has run a scan and resolved the
                // high-severity issues (missing titles/descriptions surface there).
                'done'        => $scan_done && $this->open_high_issue_count($wpdb, $issues_table, $site_id) === 0,
                'scan_done'   => $scan_done,
                'open_high'   => $this->open_high_issue_count($wpdb, $issues_table, $site_id),
            ],
            'schema' => [
                'done' => true, // SchemaEngine emits Article/Org schema automatically.
            ],
            'robots' => [
                'done' => true, // Pulse manages robots directives via wp_robots.
            ],

            // Phase 2 — Connect Google
            'verify_google' => [
                'done'        => $verify_code !== '',
                'has_code'    => $verify_code !== '',
            ],
            'gsc' => [
                'done'      => $gsc_connected,
                'site_url'  => $gsc_status['site_url'] ?? '',
            ],
            'submit_sitemap' => [
                // Can't be auto-detected via API; treat as done once GSC is connected
                // (we guide them to submit it). Stored as a user-dismissable flag.
                'done'        => (bool) get_user_meta(get_current_user_id(), 'nexora_pulse_sitemap_submitted', true),
                'sitemap_url' => $sitemap_url,
                'available'   => $gsc_connected,
            ],
            'pagespeed' => [
                'done' => $pagespeed_connected,
            ],

            // Phase 3 — Analyze & act
            'scan' => [
                'done'        => $scan_done,
                'issue_count' => $issue_rows,
            ],
            'index_doctor' => [
                'done'      => $index_done,
                'available' => $gsc_connected,
            ],
            'ai' => [
                'done'      => $ai_connected,
                'is_pro'    => $is_pro,
                'optional'  => true,
            ],
        ];

        // Overall progress across non-optional items.
        $counted = array_filter($items, static fn ($i) => empty($i['optional']));
        $done    = array_filter($counted, static fn ($i) => !empty($i['done']));
        $progress = count($counted) > 0 ? (int) round(count($done) / count($counted) * 100) : 0;

        return $this->success([
            'items'      => $items,
            'progress'   => $progress,
            'done_count' => count($done),
            'total'      => count($counted),
            'is_pro'     => $is_pro,
        ]);
    }

    public function mark_sitemap_submitted(WP_REST_Request $request): WP_REST_Response
    {
        update_user_meta(get_current_user_id(), 'nexora_pulse_sitemap_submitted', '1');
        return $this->success(['done' => true]);
    }

    /** Count of open high/critical-severity issues (missing titles/descriptions land here). */
    private function open_high_issue_count(\wpdb $wpdb, string $table, int $site_id): int
    {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table} WHERE site_id = %d AND status = 'open' AND severity IN ('high','critical')",
            $site_id
        ));
    }

    /**
     * Save the Google site-verification code → Pulse injects the meta tag,
     * which lets the user verify the site in Search Console without editing
     * theme files or DNS.
     */
    public function save_google_verification(WP_REST_Request $request): WP_REST_Response
    {
        $raw  = (string) $request->get_param('code');
        // Accept either the raw token or the full <meta> tag — extract the token.
        if (preg_match('/content=["\']([^"\']+)["\']/', $raw, $m)) {
            $raw = $m[1];
        }
        $code = sanitize_text_field(trim($raw));

        // SocialPreview reads this option directly to emit the verification meta.
        update_option('nexora_pulse_verify_google', $code);

        // Bust the cached head-scan so the new tag is reflected immediately
        // (otherwise the 12h-cached scan could keep the old detection result).
        \NexoraPulse\Modules\SocialPreview::bust_head_cache();

        return $this->success([
            'saved'    => true,
            'has_code' => $code !== '',
        ]);
    }
}
