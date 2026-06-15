<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class GscController extends BaseController
{
    protected $rest_base = 'gsc'; // phpcs:ignore

    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/gsc/status', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_status'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/gsc/connect', [
            'methods'             => 'POST',
            'callback'            => [$this, 'connect'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/gsc/disconnect', [
            'methods'             => 'POST',
            'callback'            => [$this, 'disconnect'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/gsc/sync', [
            'methods'             => 'POST',
            'callback'            => [$this, 'trigger_sync'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/gsc/performance', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_performance'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'days'     => ['type' => 'integer', 'default' => 28, 'minimum' => 7, 'maximum' => 90],
                'page'     => ['type' => 'integer', 'default' => 1],
                'per_page' => ['type' => 'integer', 'default' => 20, 'maximum' => 100],
            ],
        ]);

        register_rest_route($this->namespace, '/gsc/oauth/callback', [
            'methods'             => 'GET',
            'callback'            => [$this, 'oauth_callback'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route($this->namespace, '/gsc/verify', [
            'methods'             => 'POST',
            'callback'            => [$this, 'verify_connection'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/gsc/redirect-uri', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_redirect_uri'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);
    }

    public function get_redirect_uri(WP_REST_Request $request): WP_REST_Response
    {
        return $this->success([
            'redirect_uri' => rest_url('nexora-pulse/v1/gsc/oauth/callback'),
        ]);
    }

    public function verify_connection(WP_REST_Request $request): WP_REST_Response
    {
        $gsc = new \NexoraPulse\Modules\GscSync();
        return $this->success($gsc->verify_connection());
    }

    public function get_status(WP_REST_Request $request): WP_REST_Response
    {
        $gsc    = new \NexoraPulse\Modules\GscSync();
        $status = $gsc->get_connection_status();
        return $this->success($status);
    }

    public function connect(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $client_id     = sanitize_text_field((string) $request->get_param('client_id'));
        $client_secret = sanitize_text_field((string) $request->get_param('client_secret'));
        $site_url      = esc_url_raw((string) $request->get_param('site_url'));

        if (empty($client_id) || empty($client_secret) || empty($site_url)) {
            return $this->error('client_id, client_secret, and site_url are required.', 422);
        }

        $gsc    = new \NexoraPulse\Modules\GscSync();
        $result = $gsc->save_credentials($client_id, $client_secret, $site_url);

        if (is_wp_error($result)) {
            return $this->error($result->get_error_message(), 400);
        }

        return $this->success(['message' => __('GSC credentials saved. Authorize access to complete connection.', 'nexora-pulse'), 'auth_url' => $result]);
    }

    public function disconnect(WP_REST_Request $request): WP_REST_Response
    {
        $gsc = new \NexoraPulse\Modules\GscSync();
        $gsc->disconnect();
        return $this->success(['message' => __('Google Search Console disconnected.', 'nexora-pulse')]);
    }

    public function trigger_sync(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $gsc    = new \NexoraPulse\Modules\GscSync();
        $result = $gsc->run();

        // Surface sync failures as real errors — wrapping them in a 200 made
        // the UI toast "sync complete" while the table stayed empty.
        // Use 400 not 502: nginx/reverse proxies intercept 502 and replace the
        // JSON body with their own HTML error page, breaking JSON.parse on the client.
        if (!empty($result['error'])) {
            return $this->error((string) $result['error'], 400);
        }

        return $this->success($result);
    }

    public function get_performance(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $site_id  = $this->get_site_id();
        $days     = (int) $request->get_param('days');
        $page     = (int) $request->get_param('page');
        $per_page = (int) $request->get_param('per_page');
        $offset   = ($page - 1) * $per_page;
        $table    = $wpdb->prefix . 'nexora_pulse_gsc_data';
        $since    = gmdate('Y-m-d', strtotime("-{$days} days"));

        $total = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(DISTINCT url) FROM {$table} WHERE site_id = %d AND data_date >= %s",
            $site_id, $since
        ));

        $items = $wpdb->get_results($wpdb->prepare(
            "SELECT url,
             SUM(clicks) as clicks,
             SUM(impressions) as impressions,
             AVG(ctr) as avg_ctr,
             AVG(position) as avg_position
             FROM {$table}
             WHERE site_id = %d AND data_date >= %s
             GROUP BY url
             ORDER BY clicks DESC
             LIMIT %d OFFSET %d",
            $site_id, $since, $per_page, $offset
        ));

        return $this->success([
            'items'       => $items,
            'total'       => $total,
            'page'        => $page,
            'per_page'    => $per_page,
            'total_pages' => (int) ceil($total / $per_page),
            'days'        => $days,
        ]);
    }

    public function oauth_callback(WP_REST_Request $request): void
    {
        $code  = sanitize_text_field((string) $request->get_param('code'));
        $state = sanitize_text_field((string) $request->get_param('state'));

        if (empty($code)) {
            wp_die('Authorization failed: no code received.', 'GSC OAuth', ['response' => 400]);
        }

        $gsc    = new \NexoraPulse\Modules\GscSync();
        $result = $gsc->handle_oauth_callback($code, $state);

        if (is_wp_error($result)) {
            wp_die(esc_html($result->get_error_message()), 'GSC OAuth Error', ['response' => 400]);
        }

        wp_safe_redirect(admin_url('admin.php?page=nexora-pulse#/integrations?gsc=connected'));
        exit;
    }
}
