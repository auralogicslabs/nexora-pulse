<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class RedirectsController extends BaseController
{
    protected $rest_base = 'redirects'; // phpcs:ignore

    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/redirects', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_redirects'],
                'permission_callback' => [$this, 'get_items_permissions_check'],
                'args'                => [
                    'page'     => ['type' => 'integer', 'default' => 1],
                    'per_page' => ['type' => 'integer', 'default' => 20, 'maximum' => 100],
                ],
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'add_redirect'],
                'permission_callback' => [$this, 'create_item_permissions_check'],
            ],
        ]);

        register_rest_route($this->namespace, '/redirects/(?P<id>[\d]+)', [
            [
                'methods'             => 'PATCH',
                'callback'            => [$this, 'edit_redirect'],
                'permission_callback' => [$this, 'update_item_permissions_check'],
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [$this, 'remove_redirect'],
                'permission_callback' => [$this, 'delete_item_permissions_check'],
            ],
        ]);

        // 404 monitor endpoints — list, dismiss, convert to redirect.
        register_rest_route($this->namespace, '/redirects/not-found', [
            'methods'             => 'GET',
            'callback'            => [$this, 'list_not_found'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'page'     => ['type' => 'integer', 'default' => 1],
                'per_page' => ['type' => 'integer', 'default' => 20, 'maximum' => 100],
                'status'   => ['type' => 'string', 'enum' => ['open','redirected','ignored','all'], 'default' => 'open'],
            ],
        ]);

        register_rest_route($this->namespace, '/redirects/not-found/(?P<id>[\d]+)', [
            'methods'             => 'PATCH',
            'callback'            => [$this, 'update_not_found'],
            'permission_callback' => [$this, 'update_item_permissions_check'],
            'args'                => [
                'status' => ['type' => 'string', 'enum' => ['open','ignored'], 'required' => true],
            ],
        ]);

        register_rest_route($this->namespace, '/redirects/not-found/(?P<id>[\d]+)/redirect', [
            'methods'             => 'POST',
            'callback'            => [$this, 'create_redirect_from_404'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
            'args'                => [
                'target_url' => ['type' => 'string', 'required' => true],
                'http_code'  => ['type' => 'integer', 'default' => 301, 'enum' => [301, 302, 307]],
            ],
        ]);
    }

    public function list_not_found(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $site_id  = $this->get_site_id();
        $page     = (int) $request->get_param('page');
        $per_page = (int) $request->get_param('per_page');
        $status   = sanitize_text_field((string) $request->get_param('status'));
        $offset   = ($page - 1) * $per_page;
        $table    = $wpdb->prefix . 'nexora_pulse_not_found';

        $where = [$wpdb->prepare('site_id = %d', $site_id)];
        if ($status !== 'all') {
            $where[] = $wpdb->prepare('status = %s', $status);
        }
        $where_sql = 'WHERE ' . implode(' AND ', $where);

        // phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $total = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table} {$where_sql}");
        $items = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} {$where_sql} ORDER BY hit_count DESC, last_seen DESC LIMIT %d OFFSET %d",
            $per_page,
            $offset
        ));
        // phpcs:enable

        return $this->success([
            'items'       => $items,
            'total'       => $total,
            'page'        => $page,
            'per_page'    => $per_page,
            'total_pages' => (int) ceil($total / max(1, $per_page)),
        ]);
    }

    public function update_not_found(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        global $wpdb;
        $id     = (int) $request->get_param('id');
        $status = sanitize_text_field((string) $request->get_param('status'));
        $table  = $wpdb->prefix . 'nexora_pulse_not_found';

        $updated = $wpdb->update(
            $table,
            ['status' => $status],
            ['id' => $id, 'site_id' => $this->get_site_id()]
        );

        if ($updated === false) {
            return $this->error(__('Could not update entry.', 'nexora-pulse'), 500);
        }

        return $this->success(['updated' => true]);
    }

    public function create_redirect_from_404(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        global $wpdb;
        $id        = (int) $request->get_param('id');
        $target    = esc_url_raw((string) $request->get_param('target_url'));
        $http_code = (int) $request->get_param('http_code');
        $site_id   = $this->get_site_id();

        $nf_table   = $wpdb->prefix . 'nexora_pulse_not_found';
        $rd_table   = $wpdb->prefix . 'nexora_pulse_redirects';

        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$nf_table} WHERE id = %d AND site_id = %d",
            $id,
            $site_id
        ));

        if (!$row) {
            return $this->error(__('404 entry not found.', 'nexora-pulse'), 404);
        }
        if (empty($target)) {
            return $this->error(__('Target URL is required.', 'nexora-pulse'), 422);
        }

        // Insert the redirect.
        $inserted = $wpdb->insert($rd_table, [
            'site_id'    => $site_id,
            'source_url' => (string) $row->path,
            'target_url' => $target,
            'http_code'  => $http_code,
            'enabled'    => 1,
            'hits'       => 0,
            'created_at' => current_time('mysql'),
        ]);

        if ($inserted === false) {
            return $this->error(__('Could not create redirect — source may already exist.', 'nexora-pulse'), 500);
        }

        $wpdb->update($nf_table, ['status' => 'redirected'], ['id' => $id]);

        \NexoraPulse\Services\Logger::info(
            'redirects',
            '404 converted to redirect',
            sprintf('%s → %s (%d)', $row->path, $target, $http_code)
        );

        return $this->success([
            'redirect_id' => (int) $wpdb->insert_id,
            'source'      => (string) $row->path,
            'target'      => $target,
        ]);
    }

    public function list_redirects(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $site_id  = $this->get_site_id();
        $page     = (int) $request->get_param('page');
        $per_page = (int) $request->get_param('per_page');
        $offset   = ($page - 1) * $per_page;
        $table    = $wpdb->prefix . 'nexora_pulse_redirects';

        $total = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE site_id = %d", $site_id));
        $items = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} WHERE site_id = %d ORDER BY created_at DESC LIMIT %d OFFSET %d",
            $site_id, $per_page, $offset
        ));

        return $this->success([
            'items'       => $items,
            'total'       => $total,
            'page'        => $page,
            'per_page'    => $per_page,
            'total_pages' => (int) ceil($total / $per_page),
        ]);
    }

    public function add_redirect(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $source = trailingslashit(esc_url_raw((string) $request->get_param('source_url')));
        $target = esc_url_raw((string) $request->get_param('target_url'));
        $type   = (int) ($request->get_param('type') ?? 301);

        if (empty($source) || empty($target)) {
            return $this->error('source_url and target_url are required.', 422);
        }
        if (!in_array($type, [301, 302, 307], true)) {
            $type = 301;
        }

        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_redirects';
        $wpdb->insert($table, [
            'site_id'    => $this->get_site_id(),
            'source_url' => $source,
            'target_url' => $target,
            'type'       => $type,
        ]);

        return $this->success(['id' => $wpdb->insert_id, 'message' => __('Redirect created.', 'nexora-pulse')], 201);
    }

    public function edit_redirect(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $id    = (int) $request->get_param('id');
        $table = $wpdb->prefix . 'nexora_pulse_redirects';
        $data  = [];

        if ($request->get_param('is_active') !== null) {
            $data['is_active'] = (int) (bool) $request->get_param('is_active');
        }
        if ($request->get_param('target_url')) {
            $data['target_url'] = esc_url_raw((string) $request->get_param('target_url'));
        }

        if ($data) {
            $wpdb->update($table, $data, ['id' => $id, 'site_id' => $this->get_site_id()]);
        }

        return $this->success(['updated' => true]);
    }

    public function remove_redirect(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $id    = (int) $request->get_param('id');
        $table = $wpdb->prefix . 'nexora_pulse_redirects';
        $wpdb->delete($table, ['id' => $id, 'site_id' => $this->get_site_id()]);
        return $this->success(['deleted' => true]);
    }
}
