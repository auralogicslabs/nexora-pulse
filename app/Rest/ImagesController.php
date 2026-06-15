<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class ImagesController extends BaseController
{
    protected $rest_base = 'images'; // phpcs:ignore

    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/images/audit', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_audit'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'limit' => ['type' => 'integer', 'default' => 30, 'minimum' => 5, 'maximum' => 100],
            ],
        ]);
    }

    public function get_audit(WP_REST_Request $request): WP_REST_Response
    {
        $limit = (int) $request->get_param('limit');
        $auditor = new \NexoraPulse\Modules\ImageAuditor();
        return $this->success($auditor->audit($limit));
    }
}
