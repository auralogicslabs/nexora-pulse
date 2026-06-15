<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class AiController extends BaseController
{
    protected $rest_base = 'ai'; // phpcs:ignore

    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/ai/generate', [
            'methods'             => 'POST',
            'callback'            => [$this, 'generate'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/ai/history', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_history'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'post_id'  => ['type' => 'integer', 'default' => 0],
                'page'     => ['type' => 'integer', 'default' => 1],
                'per_page' => ['type' => 'integer', 'default' => 20, 'maximum' => 100],
            ],
        ]);

        register_rest_route($this->namespace, '/ai/approve/(?P<id>[\d]+)', [
            'methods'             => 'POST',
            'callback'            => [$this, 'approve'],
            'permission_callback' => [$this, 'update_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/ai/reject/(?P<id>[\d]+)', [
            'methods'             => 'POST',
            'callback'            => [$this, 'reject'],
            'permission_callback' => [$this, 'update_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/ai/rollback/(?P<id>[\d]+)', [
            'methods'             => 'POST',
            'callback'            => [$this, 'rollback'],
            'permission_callback' => [$this, 'update_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/ai/providers', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_providers'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);
    }

    public function generate(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $gate = new \NexoraPulse\Services\FeatureGate();
        if (!$gate->is_allowed('ai_generate')) {
            return $this->error(__('AI generation requires a Pro license.', 'nexora-pulse'), 402);
        }

        $post_id     = (int) $request->get_param('post_id');
        $action_type = sanitize_text_field((string) $request->get_param('action_type'));

        $valid_actions = ['meta_description', 'seo_title', 'schema'];
        if (!in_array($action_type, $valid_actions, true)) {
            return $this->error('Invalid action_type.', 422);
        }

        $post = get_post($post_id);
        if (!$post) {
            return $this->error('Post not found.', 404);
        }

        $ai     = new \NexoraPulse\Services\AiService();
        $result = $ai->generate($post, $action_type, get_current_user_id(), $this->get_site_id());

        if (is_wp_error($result)) {
            return $this->error($result->get_error_message(), 500);
        }

        return $this->success($result);
    }

    public function get_history(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $site_id  = $this->get_site_id();
        $post_id  = (int) $request->get_param('post_id');
        $page     = (int) $request->get_param('page');
        $per_page = (int) $request->get_param('per_page');
        $offset   = ($page - 1) * $per_page;
        $table    = $wpdb->prefix . 'nexora_pulse_ai_history';

        $where = [$wpdb->prepare('site_id = %d', $site_id)];
        if ($post_id) {
            $where[] = $wpdb->prepare('post_id = %d', $post_id);
        }
        $where_sql = 'WHERE ' . implode(' AND ', $where);

        // phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $total = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table} {$where_sql}");
        $items = $wpdb->get_results($wpdb->prepare(
            "SELECT id, post_id, action_type, provider, status, created_at, applied_at FROM {$table} {$where_sql} ORDER BY created_at DESC LIMIT %d OFFSET %d",
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

    public function approve(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $id  = (int) $request->get_param('id');
        $ai  = new \NexoraPulse\Services\AiService();
        $res = $ai->approve($id, $this->get_site_id());
        if (is_wp_error($res)) {
            return $this->error($res->get_error_message(), 400);
        }
        return $this->success($res);
    }

    public function reject(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $id    = (int) $request->get_param('id');
        $table = $wpdb->prefix . 'nexora_pulse_ai_history';
        $wpdb->update($table, ['status' => 'rejected'], ['id' => $id, 'site_id' => $this->get_site_id()]);
        return $this->success(['rejected' => true]);
    }

    public function rollback(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $id  = (int) $request->get_param('id');
        $ai  = new \NexoraPulse\Services\AiService();
        $res = $ai->rollback($id, $this->get_site_id());
        if (is_wp_error($res)) {
            return $this->error($res->get_error_message(), 400);
        }
        return $this->success($res);
    }

    public function get_providers(WP_REST_Request $request): WP_REST_Response
    {
        return $this->success(\NexoraPulse\Services\AiService::get_providers());
    }
}
