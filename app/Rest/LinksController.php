<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class LinksController extends BaseController
{
    protected $rest_base = 'links'; // phpcs:ignore

    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/links/graph', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_graph'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/links/orphans', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_orphans'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/links/broken', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_broken'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/links/suggestions/(?P<post_id>[\d]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_suggestions'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/links/scan', [
            'methods'             => 'POST',
            'callback'            => [$this, 'start_scan'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/links/progress', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_progress'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);
    }

    public function get_graph(WP_REST_Request $request): WP_REST_Response
    {
        $engine = new \NexoraPulse\Modules\LinkEngine();
        return $this->success($engine->get_graph_data($this->get_site_id()));
    }

    public function get_orphans(WP_REST_Request $request): WP_REST_Response
    {
        $engine = new \NexoraPulse\Modules\LinkEngine();
        return $this->success($engine->get_orphans($this->get_site_id()));
    }

    public function get_broken(WP_REST_Request $request): WP_REST_Response
    {
        $engine = new \NexoraPulse\Modules\LinkEngine();
        return $this->success($engine->get_broken_links($this->get_site_id()));
    }

    public function get_suggestions(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id = (int) $request->get_param('post_id');
        if (!get_post($post_id)) {
            return $this->error('Post not found.', 404);
        }
        $engine = new \NexoraPulse\Modules\LinkEngine();
        return $this->success($engine->get_suggestions($post_id, $this->get_site_id()));
    }

    public function start_scan(WP_REST_Request $request): WP_REST_Response
    {
        $site_id = $this->get_site_id();
        $engine  = new \NexoraPulse\Modules\LinkEngine();
        $result  = $engine->start_background_scan($site_id);
        delete_transient("nexora_pulse_summary_{$site_id}");
        return $this->success($result);
    }

    public function get_progress(WP_REST_Request $request): WP_REST_Response
    {
        $site_id = $this->get_site_id();
        $total   = (int) get_transient("nexora_pulse_links_total_{$site_id}");
        $done    = (int) get_transient("nexora_pulse_links_done_{$site_id}");
        $running = (bool) get_transient("nexora_pulse_links_running_{$site_id}");

        return $this->success([
            'running' => $running,
            'total'   => $total,
            'done'    => $done,
            'percent' => $total > 0 ? (int) round($done / $total * 100) : 0,
        ]);
    }
}
