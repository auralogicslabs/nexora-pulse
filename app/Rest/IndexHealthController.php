<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class IndexHealthController extends BaseController
{
    protected $rest_base = 'index-health'; // phpcs:ignore

    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/index-health', [
            'methods'             => 'GET',
            'callback'            => [$this, 'list_status'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'filter' => [
                    'type'    => 'string',
                    'enum'    => ['all', 'rejected', 'indexed', 'high_risk'],
                    'default' => 'all',
                ],
            ],
        ]);

        register_rest_route($this->namespace, '/index-health/summary', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_summary'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/index-health/patterns', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_patterns'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/index-health/inspect/(?P<post_id>[\d]+)', [
            'methods'             => 'POST',
            'callback'            => [$this, 'inspect_post'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
            'args'                => [
                'force' => ['type' => 'boolean', 'default' => false],
            ],
        ]);

        register_rest_route($this->namespace, '/index-health/scan', [
            'methods'             => 'POST',
            'callback'            => [$this, 'bulk_scan'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
            'args'                => [
                'limit' => ['type' => 'integer', 'default' => 25, 'minimum' => 1, 'maximum' => 100],
            ],
        ]);

        register_rest_route($this->namespace, '/index-health/progress', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_progress'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/index-health/predict/(?P<post_id>[\d]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'predict_risk'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);
    }

    public function predict_risk(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id = (int) $request->get_param('post_id');
        $post    = get_post($post_id);

        if (!$post) {
            return $this->error(__('Post not found.', 'nexora-pulse'), 404);
        }

        $inspector = new \NexoraPulse\Modules\IndexInspector();
        return $this->success($inspector->predict_risk($post));
    }

    public function list_status(WP_REST_Request $request): WP_REST_Response
    {
        $site_id   = $this->get_site_id();
        $filter    = sanitize_text_field((string) $request->get_param('filter'));
        $inspector = new \NexoraPulse\Modules\IndexInspector();

        $rows = $inspector->list_for_site($site_id);

        $filtered = match ($filter) {
            'rejected'  => array_values(array_filter($rows, fn ($r) => !$r['is_indexed'])),
            'indexed'   => array_values(array_filter($rows, fn ($r) => $r['is_indexed'])),
            'high_risk' => array_values(array_filter($rows, fn ($r) => ($r['risk_score'] ?? 0) >= 70)),
            default     => $rows,
        };

        return $this->success([
            'items' => $filtered,
            'total' => count($filtered),
        ]);
    }

    public function get_summary(WP_REST_Request $request): WP_REST_Response
    {
        $inspector = new \NexoraPulse\Modules\IndexInspector();
        return $this->success($inspector->summary($this->get_site_id()));
    }

    public function get_patterns(WP_REST_Request $request): WP_REST_Response
    {
        $inspector = new \NexoraPulse\Modules\IndexInspector();
        return $this->success([
            'patterns' => $inspector->detect_patterns($this->get_site_id()),
        ]);
    }

    public function inspect_post(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id = (int) $request->get_param('post_id');
        $force   = (bool) $request->get_param('force');
        $post    = get_post($post_id);

        if (!$post) {
            return $this->error(__('Post not found.', 'nexora-pulse'), 404);
        }

        $inspector = new \NexoraPulse\Modules\IndexInspector();
        $result    = $inspector->inspect_post($post, $force);

        if (is_wp_error($result)) {
            return $this->error($result->get_error_message(), 400);
        }

        return $this->success($result);
    }

    public function bulk_scan(WP_REST_Request $request): WP_REST_Response
    {
        $site_id = $this->get_site_id();
        $limit   = (int) $request->get_param('limit');

        if (get_transient("nexora_pulse_index_scan_running_{$site_id}")) {
            return $this->success(['status' => 'already_running']);
        }

        // Queue the most-rejected or never-inspected pages first.
        $posts = $this->collect_scan_queue($site_id, $limit);

        if (empty($posts)) {
            return $this->success(['status' => 'done', 'total' => 0]);
        }

        set_transient("nexora_pulse_index_scan_total_{$site_id}",  count($posts), HOUR_IN_SECONDS);
        set_transient("nexora_pulse_index_scan_done_{$site_id}",   0,              HOUR_IN_SECONDS);
        set_transient("nexora_pulse_index_scan_running_{$site_id}", 1,             HOUR_IN_SECONDS);
        set_transient("nexora_pulse_index_scan_queue_{$site_id}",  $posts,         HOUR_IN_SECONDS);
        delete_transient("nexora_pulse_index_scan_error_{$site_id}");

        // Kick off first batch synchronously.
        $this->process_scan_batch($site_id);

        return $this->success(['status' => 'started', 'total' => count($posts)]);
    }

    public function get_progress(WP_REST_Request $request): WP_REST_Response
    {
        $site_id = $this->get_site_id();
        $total   = (int) get_transient("nexora_pulse_index_scan_total_{$site_id}");
        $done    = (int) get_transient("nexora_pulse_index_scan_done_{$site_id}");
        $running = (bool) get_transient("nexora_pulse_index_scan_running_{$site_id}");
        $error   = (string) get_transient("nexora_pulse_index_scan_error_{$site_id}");

        return $this->success([
            'running' => $running,
            'total'   => $total,
            'done'    => $done,
            'percent' => $total > 0 ? (int) round(($done / $total) * 100) : 0,
            'error'   => $error,
        ]);
    }

    // -------------------------------------------------------------
    // Internal: scan queue management
    // -------------------------------------------------------------

    private function collect_scan_queue(int $site_id, int $limit): array
    {
        global $wpdb;
        $status_table = $wpdb->prefix . 'nexora_pulse_index_status';

        // First: posts never inspected (left-join against status table).
        // $status_table is built from $wpdb->prefix (not user input) and the
        // query is prepared; the interpolated table name is safe.
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $ids = $wpdb->get_col($wpdb->prepare(
            "SELECT p.ID
             FROM {$wpdb->posts} p
             LEFT JOIN {$status_table} s ON s.post_id = p.ID AND s.site_id = %d
             WHERE p.post_status = 'publish' AND p.post_type IN ('post','page')
             AND s.id IS NULL
             ORDER BY p.post_date DESC
             LIMIT %d",
            $site_id,
            $limit
        )) ?: [];

        // Fill remaining slots with stale rows (>24h since last inspection).
        if (count($ids) < $limit) {
            $remaining   = $limit - count($ids);
            $cutoff      = gmdate('Y-m-d H:i:s', time() - DAY_IN_SECONDS);
            $stale_ids   = $wpdb->get_col($wpdb->prepare(
                "SELECT post_id FROM {$status_table}
                 WHERE site_id = %d AND inspected_at < %s
                 ORDER BY risk_score DESC, inspected_at ASC
                 LIMIT %d",
                $site_id,
                $cutoff,
                $remaining
            )) ?: [];
            $ids = array_merge($ids, $stale_ids);
        }

        return array_map('intval', array_unique($ids));
    }

    private function process_scan_batch(int $site_id): void
    {
        $queue = (array) get_transient("nexora_pulse_index_scan_queue_{$site_id}");
        if (empty($queue)) {
            delete_transient("nexora_pulse_index_scan_running_{$site_id}");
            return;
        }

        // Process up to 5 URLs per batch (API is rate-limited).
        $batch    = array_splice($queue, 0, 5);
        $inspector = new \NexoraPulse\Modules\IndexInspector();
        $done_now = 0;

        foreach ($batch as $post_id) {
            $post = get_post((int) $post_id);
            if (!$post) {
                continue;
            }
            $result = $inspector->inspect_post($post, false);
            $done_now++;

            // Quota or auth failures affect every URL — abort the whole queue
            // instead of burning through it with guaranteed failures, and keep
            // the error for the next progress poll so the UI can show it.
            if (is_wp_error($result)
                && in_array($result->get_error_code(), ['quota_exceeded', 'gsc_auth_error', 'no_token', 'reconnect_required', 'refresh_failed'], true)
            ) {
                set_transient("nexora_pulse_index_scan_error_{$site_id}", $result->get_error_message(), HOUR_IN_SECONDS);
                delete_transient("nexora_pulse_index_scan_queue_{$site_id}");
                delete_transient("nexora_pulse_index_scan_running_{$site_id}");
                return;
            }
        }

        $done = (int) get_transient("nexora_pulse_index_scan_done_{$site_id}") + $done_now;
        set_transient("nexora_pulse_index_scan_done_{$site_id}",  $done,  HOUR_IN_SECONDS);
        set_transient("nexora_pulse_index_scan_queue_{$site_id}", $queue, HOUR_IN_SECONDS);

        if (!empty($queue)) {
            // Continue via cron.
            wp_schedule_single_event(time() + 5, 'nexora_pulse_index_scan_continue');
        } else {
            delete_transient("nexora_pulse_index_scan_running_{$site_id}");
            delete_transient("nexora_pulse_index_scan_queue_{$site_id}");
        }
    }

    public static function continue_scan(): void
    {
        $controller = new self();
        $controller->process_scan_batch(get_current_blog_id());
    }
}
