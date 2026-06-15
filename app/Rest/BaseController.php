<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Controller;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

defined('ABSPATH') || exit;

abstract class BaseController extends WP_REST_Controller
{
    // No type annotations — WP_REST_Controller declares these untyped; PHP 8.2+ forbids
    // adding a type on an inherited property, and narrows method signature compatibility.
    protected $namespace = Router::NAMESPACE; // phpcs:ignore
    protected $rest_base = ''; // phpcs:ignore

    // Permission callbacks — must match WP_REST_Controller::get_items_permissions_check($request)
    // signature exactly (no typed param, no return type) for PHP 8.2 compatibility.
    public function get_items_permissions_check($request) // phpcs:ignore
    {
        return $this->check_admin();
    }

    public function get_item_permissions_check($request) // phpcs:ignore
    {
        return $this->check_admin();
    }

    public function create_item_permissions_check($request) // phpcs:ignore
    {
        return $this->check_admin();
    }

    public function update_item_permissions_check($request) // phpcs:ignore
    {
        return $this->check_admin();
    }

    public function delete_item_permissions_check($request) // phpcs:ignore
    {
        return $this->check_admin();
    }

    private function check_admin(): bool|WP_Error
    {
        if (!current_user_can('manage_options')) {
            return new WP_Error('forbidden', __('Insufficient permissions.', 'nexora-pulse'), ['status' => 403]);
        }
        return true;
    }

    protected function success(mixed $data, int $status = 200): WP_REST_Response
    {
        return new WP_REST_Response(['success' => true, 'data' => $data], $status);
    }

    protected function error(string $message, int $status = 400): WP_Error
    {
        return new WP_Error('nexora_pulse_error', $message, ['status' => $status]);
    }

    protected function get_site_id(): int
    {
        return get_current_blog_id();
    }
}
