<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class OriginalityController extends BaseController
{
    protected $rest_base = 'originality'; // phpcs:ignore

    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/originality/duplicates', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_duplicates'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'threshold' => ['type' => 'number', 'default' => 70, 'minimum' => 1, 'maximum' => 100],
                'page'      => ['type' => 'integer', 'default' => 1],
                'per_page'  => ['type' => 'integer', 'default' => 20, 'maximum' => 100],
            ],
        ]);

        register_rest_route($this->namespace, '/originality/scan', [
            'methods'             => 'POST',
            'callback'            => [$this, 'start_scan'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
        ]);

        // Progress endpoint — originality scans synchronously today, so this
        // always returns running=false. Kept for UI parity with analyzer/links.
        register_rest_route($this->namespace, '/originality/progress', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_progress'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);
    }

    public function get_progress(WP_REST_Request $request): WP_REST_Response
    {
        return $this->success([
            'running' => false,
            'total'   => 0,
            'done'    => 0,
            'percent' => 0,
        ]);
    }

    public function get_duplicates(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $site_id   = $this->get_site_id();
        $threshold = (float) $request->get_param('threshold');
        $page      = (int) $request->get_param('page');
        $per_page  = (int) $request->get_param('per_page');
        $offset    = ($page - 1) * $per_page;
        $table     = $wpdb->prefix . 'nexora_pulse_similarity';

        // Only surface pairs where BOTH posts are still published. INNER JOIN on
        // a publish filter excludes stale pairs that reference drafted or deleted
        // posts, so the count and the list never mislead the user.
        $total = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table} s
             INNER JOIN {$wpdb->posts} p1 ON p1.ID = s.post_id_a AND p1.post_status = 'publish'
             INNER JOIN {$wpdb->posts} p2 ON p2.ID = s.post_id_b AND p2.post_status = 'publish'
             WHERE s.site_id = %d AND s.similarity >= %f",
            $site_id, $threshold
        ));

        $items = $wpdb->get_results($wpdb->prepare(
            "SELECT s.*, p1.post_title as title_a, p2.post_title as title_b
             FROM {$table} s
             INNER JOIN {$wpdb->posts} p1 ON p1.ID = s.post_id_a AND p1.post_status = 'publish'
             INNER JOIN {$wpdb->posts} p2 ON p2.ID = s.post_id_b AND p2.post_status = 'publish'
             WHERE s.site_id = %d AND s.similarity >= %f
             ORDER BY s.similarity DESC
             LIMIT %d OFFSET %d",
            $site_id, $threshold, $per_page, $offset
        ));

        return $this->success([
            'items'       => $items,
            'total'       => $total,
            'page'        => $page,
            'per_page'    => $per_page,
            'total_pages' => (int) ceil($total / $per_page),
        ]);
    }

    public function start_scan(WP_REST_Request $request): WP_REST_Response
    {
        $site_id = $this->get_site_id();
        $engine  = new \NexoraPulse\Modules\OriginalityEngine();
        $result  = $engine->start_background_scan($site_id);
        delete_transient("nexora_pulse_summary_{$site_id}");
        return $this->success($result);
    }
}
