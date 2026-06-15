<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class SettingsController extends BaseController
{
    protected $rest_base = 'settings'; // phpcs:ignore

    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/settings', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_settings'],
                'permission_callback' => [$this, 'get_items_permissions_check'],
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'save_settings'],
                'permission_callback' => [$this, 'create_item_permissions_check'],
            ],
        ]);

        register_rest_route($this->namespace, '/settings/license', [
            'methods'             => 'POST',
            'callback'            => [$this, 'activate_license'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/settings/api-keys', [
            'methods'             => 'POST',
            'callback'            => [$this, 'save_api_keys'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/settings/clear-data', [
            'methods'             => 'POST',
            'callback'            => [$this, 'clear_data'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
        ]);

        // Migration & Compatibility Center — detected SEO plugins, duplicate-meta
        // risks, what Pulse defers, and migration readiness.
        register_rest_route($this->namespace, '/settings/compatibility', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_compatibility'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/settings/robots', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_robots'],
                'permission_callback' => [$this, 'get_items_permissions_check'],
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'save_robots'],
                'permission_callback' => [$this, 'create_item_permissions_check'],
            ],
        ]);

        register_rest_route($this->namespace, '/settings/templates', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_templates'],
                'permission_callback' => [$this, 'get_items_permissions_check'],
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'save_templates'],
                'permission_callback' => [$this, 'create_item_permissions_check'],
            ],
        ]);

        register_rest_route($this->namespace, '/settings/templates/preview', [
            'methods'             => 'POST',
            'callback'            => [$this, 'preview_template'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);
    }

    public function get_templates(WP_REST_Request $request): WP_REST_Response
    {
        return $this->success([
            'templates'    => \NexoraPulse\Modules\TitleTemplates::get(),
            'placeholders' => \NexoraPulse\Modules\TitleTemplates::placeholders(),
        ]);
    }

    public function save_templates(WP_REST_Request $request): WP_REST_Response
    {
        $body = $request->get_json_params();
        if (!is_array($body)) {
            $body = [];
        }
        $saved = \NexoraPulse\Modules\TitleTemplates::save($body);
        return $this->success(['templates' => $saved]);
    }

    public function preview_template(WP_REST_Request $request): WP_REST_Response
    {
        $template = (string) $request->get_param('template');
        $post_id  = (int) $request->get_param('post_id');
        $post     = $post_id ? get_post($post_id) : null;

        $rendered = \NexoraPulse\Modules\TitleTemplates::resolve($template, $post);
        return $this->success(['rendered' => $rendered]);
    }

    public function get_settings(WP_REST_Request $request): WP_REST_Response
    {
        $service = new \NexoraPulse\Services\SettingsService();
        return $this->success($service->get_public_settings());
    }

    public function save_settings(WP_REST_Request $request): WP_REST_Response
    {
        $service = new \NexoraPulse\Services\SettingsService();
        $service->update($request->get_json_params() ?: $request->get_body_params());
        return $this->success(['message' => __('Settings saved.', 'nexora-pulse')]);
    }

    public function activate_license(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $key     = sanitize_text_field((string) $request->get_param('license_key'));
        $service = new \NexoraPulse\Services\SettingsService();
        $result  = $service->activate_license($key);
        if (is_wp_error($result)) {
            return $this->error($result->get_error_message(), 400);
        }
        return $this->success($result);
    }

    public function save_api_keys(WP_REST_Request $request): WP_REST_Response
    {
        $service = new \NexoraPulse\Services\SettingsService();
        $service->save_api_keys([
            'ai_provider' => sanitize_text_field((string) $request->get_param('ai_provider')),
            'ai_api_key'  => sanitize_text_field((string) $request->get_param('ai_api_key')),
            'ai_model'    => sanitize_text_field((string) $request->get_param('ai_model')),
        ]);
        return $this->success(['message' => __('API keys saved.', 'nexora-pulse')]);
    }

    public function clear_data(WP_REST_Request $request): WP_REST_Response
    {
        $service = new \NexoraPulse\Services\SettingsService();
        $service->clear_site_data($this->get_site_id());
        return $this->success(['message' => __('All Nexora Pulse data cleared.', 'nexora-pulse')]);
    }

    public function get_compatibility(WP_REST_Request $request): WP_REST_Response
    {
        $service = new \NexoraPulse\Services\CompatibilityService();
        return $this->success($service->report());
    }

    public function get_robots(WP_REST_Request $request): WP_REST_Response
    {
        $custom = get_option('nexora_pulse_robots_txt', '');
        // Build effective robots.txt preview: WP default + custom appended.
        $default_lines = [
            'User-agent: *',
            'Disallow: /wp-admin/',
            'Allow: /wp-admin/admin-ajax.php',
            '',
            'Sitemap: ' . get_home_url() . '/nexora-sitemap.xml',
        ];
        return $this->success([
            'custom'   => $custom,
            'default'  => implode("\n", $default_lines),
            'preview'  => implode("\n", $default_lines) . (!empty($custom) ? "\n\n# Custom rules\n" . $custom : ''),
        ]);
    }

    public function save_robots(WP_REST_Request $request): WP_REST_Response
    {
        $content = (string) $request->get_param('content');
        // Sanitize: strip any PHP tags or server-side scripts.
        $content = preg_replace('/<\?.*?\?>/s', '', $content);
        update_option('nexora_pulse_robots_txt', sanitize_textarea_field($content));
        \NexoraPulse\Services\Logger::info('settings', 'robots.txt updated', 'Custom robots.txt rules saved.');
        return $this->success(['message' => 'robots.txt rules saved.']);
    }
}
