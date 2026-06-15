<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class ActionsController extends BaseController
{
    protected $rest_base = 'actions'; // phpcs:ignore

    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/actions', [
            'methods'             => 'GET',
            'callback'            => [$this, 'list_actions'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'status'   => ['type' => 'string', 'default' => 'all'],
                'page'     => ['type' => 'integer', 'default' => 1],
                'per_page' => ['type' => 'integer', 'default' => 20, 'maximum' => 100],
            ],
        ]);

        register_rest_route($this->namespace, '/actions/(?P<id>[\d]+)/retry', [
            'methods'             => 'POST',
            'callback'            => [$this, 'retry'],
            'permission_callback' => [$this, 'update_item_permissions_check'],
        ]);
    }

    public function list_actions(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $site_id  = $this->get_site_id();
        $status   = sanitize_text_field($request->get_param('status'));
        $page     = (int) $request->get_param('page');
        $per_page = (int) $request->get_param('per_page');
        $offset   = ($page - 1) * $per_page;
        $table    = $wpdb->prefix . 'nexora_pulse_actions';

        $where = [$wpdb->prepare('site_id = %d', $site_id)];
        if ($status !== 'all') {
            $where[] = $wpdb->prepare('status = %s', $status);
        }
        $where_sql = 'WHERE ' . implode(' AND ', $where);

        // phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $total = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table} {$where_sql}");
        $items = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} {$where_sql} ORDER BY queued_at DESC LIMIT %d OFFSET %d",
            $per_page, $offset
        ));
        // phpcs:enable

        return $this->success([
            'items'       => $items,
            'total'       => $total,
            'page'        => $page,
            'per_page'    => $per_page,
            'total_pages' => (int) ceil($total / $per_page),
        ]);
    }

    public function retry(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $id    = (int) $request->get_param('id');
        $table = $wpdb->prefix . 'nexora_pulse_actions';
        $wpdb->update($table, ['status' => 'queued', 'started_at' => null, 'finished_at' => null, 'result' => null], ['id' => $id, 'site_id' => $this->get_site_id()]);
        return $this->success(['retried' => true]);
    }
}
