<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class DashboardController extends BaseController
{
    protected $rest_base = 'dashboard'; // phpcs:ignore

    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/dashboard/summary', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_summary'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/dashboard/oxygen-score', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_oxygen_score'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/dashboard/recent-logs', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_recent_logs'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/dashboard/opportunities', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_opportunities'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/dashboard/cwv', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_cwv'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/dashboard/onboarding', [
            'methods'             => 'POST',
            'callback'            => [$this, 'complete_onboarding'],
            'permission_callback' => [$this, 'update_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/dashboard/pagespeed', [
            'methods'             => 'POST',
            'callback'            => [$this, 'save_pagespeed_key'],
            'permission_callback' => [$this, 'update_item_permissions_check'],
        ]);
    }

    public function get_summary(WP_REST_Request $request): WP_REST_Response
    {
        $service = new \NexoraPulse\Services\DashboardService();
        return $this->success($service->get_summary($this->get_site_id()));
    }

    public function get_oxygen_score(WP_REST_Request $request): WP_REST_Response
    {
        $service = new \NexoraPulse\Services\DashboardService();
        return $this->success($service->get_oxygen_score($this->get_site_id()));
    }

    public function get_recent_logs(WP_REST_Request $request): WP_REST_Response
    {
        $limit   = (int) ($request->get_param('limit') ?? 20);
        $service = new \NexoraPulse\Services\DashboardService();
        return $this->success($service->get_recent_logs($this->get_site_id(), $limit));
    }

    public function get_opportunities(WP_REST_Request $request): WP_REST_Response
    {
        $service = new \NexoraPulse\Services\DashboardService();
        return $this->success($service->get_opportunities($this->get_site_id()));
    }

    public function complete_onboarding(WP_REST_Request $request): WP_REST_Response
    {
        update_user_meta(get_current_user_id(), 'nexora_pulse_onboarding_complete', 1);
        return $this->success(['completed' => true]);
    }

    public function save_pagespeed_key(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $api_key = sanitize_text_field((string) $request->get_param('api_key'));
        if (empty($api_key)) {
            return $this->error('API key is required.', 422);
        }

        // Validate the key against Google before saving, so the user gets the
        // real reason immediately instead of a silent "saved" that later fails.
        $test = add_query_arg([
            'url'      => rawurlencode(get_home_url()),
            'strategy' => 'mobile',
            'key'      => $api_key,
            'category' => 'performance',
        ], 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed');

        $resp = wp_remote_get($test, ['timeout' => 30]);

        if (is_wp_error($resp)) {
            return $this->error('Could not reach Google PageSpeed. Check your server connection: ' . $resp->get_error_message(), 400);
        }

        $code = (int) wp_remote_retrieve_response_code($resp);
        if ($code !== 200) {
            $body    = json_decode(wp_remote_retrieve_body($resp), true);
            $gmsg    = $body['error']['message'] ?? '';
            $reason  = $body['error']['errors'][0]['reason'] ?? '';
            $hint    = 'PageSpeed rejected this key (HTTP ' . $code . ').';

            if (stripos($gmsg, 'referer') !== false || stripos($gmsg, 'referrer') !== false || $reason === 'API_KEY_HTTP_REFERRER_BLOCKED') {
                $hint = 'Your API key has an "HTTP referrers (websites)" restriction. Pulse calls PageSpeed from your server, which has no referrer — set the key\'s Application restriction to "None" (or restrict by your server IP) and try again.';
            } elseif ($reason === 'API_KEY_SERVICE_BLOCKED' || stripos($gmsg, 'not been used') !== false || stripos($gmsg, 'disabled') !== false) {
                $hint = 'The PageSpeed Insights API is not enabled, or this key is restricted to other APIs. Enable "PageSpeed Insights API" in Google Cloud and allow it under the key\'s API restrictions.';
            } elseif ($reason === 'API_KEY_INVALID' || stripos($gmsg, 'API key not valid') !== false) {
                $hint = 'This API key is not valid. Re-copy it from Google Cloud → Credentials.';
            } elseif ($gmsg !== '') {
                $hint = 'Google said: ' . $gmsg;
            }

            return $this->error($hint, 422);
        }

        $settings = new \NexoraPulse\Services\SettingsService();
        $settings->save_encrypted('pagespeed_api_key', $api_key);
        delete_transient('nexora_pulse_cwv_data');
        return $this->success(['saved' => true]);
    }

    public function get_cwv(WP_REST_Request $request): WP_REST_Response
    {
        $settings = new \NexoraPulse\Services\SettingsService();

        $cached = get_transient('nexora_pulse_cwv_data');
        if (is_array($cached)) {
            return $this->success($cached);
        }

        $api_key  = $settings->get_encrypted('pagespeed_api_key');

        if (empty($api_key)) {
            return $this->success(null);
        }

        $url      = get_home_url();
        $endpoint = add_query_arg([
            'url'      => rawurlencode($url),
            'strategy' => 'mobile',
            'key'      => $api_key,
            'category' => 'performance',
        ], 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed');

        $response = wp_remote_get($endpoint, ['timeout' => 30]);

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return $this->success(['error' => 'PageSpeed API request failed. Check your API key.']);
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        $lhr  = $body['lighthouseResult']['audits'] ?? [];
        // Field data (CrUX, real Chrome users at P75). May be absent for low-traffic
        // URLs — fall back to origin-level data when the specific URL has none.
        $fwd  = $body['loadingExperience']['metrics']
             ?? $body['originLoadingExperience']['metrics']
             ?? [];

        $percentile = static function (array $fwd, string $key): ?float {
            return isset($fwd[$key]['percentile']) ? (float) $fwd[$key]['percentile'] : null;
        };

        // Whether Google has any real-user (CrUX) field data for this property.
        $hasField = !empty($fwd);

        $cls = $percentile($fwd, 'CUMULATIVE_LAYOUT_SHIFT_SCORE');

        $result = [
            // Core Web Vitals — CrUX field data at P75 (real users).
            'lcp'        => $percentile($fwd, 'LARGEST_CONTENTFUL_PAINT_MS'),
            'inp'        => $percentile($fwd, 'INTERACTION_TO_NEXT_PAINT'),
            'cls'        => $cls !== null ? round($cls / 100, 2) : null,
            'ttfb'       => $percentile($fwd, 'EXPERIMENTAL_TIME_TO_FIRST_BYTE'),
            // Lab TTFB from Lighthouse (always available) — shown as a fallback
            // server-timing signal when no field data exists yet.
            'ttfb_lab'   => isset($lhr['server-response-time']['numericValue'])
                          ? (float) $lhr['server-response-time']['numericValue']
                          : null,
            'has_field'  => $hasField,
            // Lighthouse lab performance score (always available).
            'score'      => isset($body['lighthouseResult']['categories']['performance']['score'])
                          ? (int) round($body['lighthouseResult']['categories']['performance']['score'] * 100)
                          : null,
            'fetched_at' => gmdate('Y-m-d H:i:s'),
        ];

        set_transient('nexora_pulse_cwv_data', $result, 6 * HOUR_IN_SECONDS);
        return $this->success($result);
    }
}
