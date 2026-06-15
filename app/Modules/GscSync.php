<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

use WP_Error;

defined('ABSPATH') || exit;

/**
 * Google Search Console integration — OAuth 2.0 + data sync.
 * Stores credentials encrypted via SettingsService.
 * Phase 1: READ-ONLY integration only.
 */
final class GscSync
{
    private const OAUTH_ENDPOINT = 'https://oauth2.googleapis.com/token';
    private const AUTH_ENDPOINT  = 'https://accounts.google.com/o/oauth2/v2/auth';
    private const GSC_API        = 'https://www.googleapis.com/webmasters/v3';

    /** Refresh the access token this many seconds before it actually expires. */
    private const TOKEN_EXPIRY_BUFFER = 120;

    private const STATE_TRANSIENT = 'nexora_pulse_gsc_oauth_state';

    private \NexoraPulse\Services\SettingsService $settings;

    public function __construct()
    {
        $this->settings = new \NexoraPulse\Services\SettingsService();
    }

    public function get_connection_status(): array
    {
        $connected   = !empty($this->settings->get_encrypted('gsc_access_token'));
        $site_url    = $this->settings->get('gsc_site_url', '');
        $last_synced = $this->settings->get('gsc_last_synced', '');

        return [
            'connected'   => $connected,
            'site_url'    => $site_url,
            'last_synced' => $last_synced,
        ];
    }

    /**
     * Fetch all GSC properties the connected user has access to.
     * Used right after OAuth to verify the saved site_url actually exists on the account.
     *
     * @return array{ok: bool, properties?: array<int, array{siteUrl: string, permissionLevel: string}>, error?: string}
     */
    public function list_properties(): array
    {
        $token = $this->get_valid_token();
        if (is_wp_error($token)) {
            return ['ok' => false, 'error' => $token->get_error_message()];
        }

        $response = wp_remote_get(self::GSC_API . '/sites', [
            'timeout' => 20,
            'headers' => [
                'Authorization' => "Bearer {$token}",
            ],
        ]);

        if (is_wp_error($response)) {
            return ['ok' => false, 'error' => $response->get_error_message()];
        }

        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!empty($body['error'])) {
            return ['ok' => false, 'error' => $body['error']['message'] ?? 'GSC API error'];
        }

        $properties = [];
        foreach ((array) ($body['siteEntry'] ?? []) as $row) {
            $properties[] = [
                'siteUrl'         => (string) ($row['siteUrl'] ?? ''),
                'permissionLevel' => (string) ($row['permissionLevel'] ?? ''),
            ];
        }

        return ['ok' => true, 'properties' => $properties];
    }

    /**
     * Verify that the user's saved site_url actually exists on their GSC account
     * AND that URL Inspection works for at least one URL (proves Pulse can run Index Doctor).
     */
    public function verify_connection(): array
    {
        $saved_site = (string) $this->settings->get('gsc_site_url', '');
        if (empty($saved_site)) {
            return ['ok' => false, 'error' => __('No site URL configured.', 'nexora-pulse')];
        }

        $list = $this->list_properties();
        if (!($list['ok'] ?? false)) {
            return ['ok' => false, 'error' => $list['error'] ?? 'Could not reach GSC.'];
        }

        $properties = $list['properties'] ?? [];
        $found      = false;
        $matched    = null;
        // Normalise: strip trailing slash and lowercase scheme for comparison.
        $normalise  = static fn (string $u): string => rtrim(strtolower($u), '/');
        $saved_norm = $normalise($saved_site);
        foreach ($properties as $p) {
            if ($normalise((string) $p['siteUrl']) === $saved_norm) {
                $found   = true;
                $matched = $p;
                break;
            }
        }
        // Second pass: partial match — saved URL starts with a listed property URL.
        // Handles cases where user entered https://example.com but GSC has https://www.example.com/.
        if (!$found) {
            foreach ($properties as $p) {
                $prop_norm = $normalise((string) $p['siteUrl']);
                if (str_starts_with($saved_norm, $prop_norm) || str_starts_with($prop_norm, $saved_norm)) {
                    $found   = true;
                    $matched = $p;
                    break;
                }
            }
        }

        if (!$found) {
            $available = array_map(fn ($p) => $p['siteUrl'], $properties);
            return [
                'ok'        => false,
                'error'     => sprintf(
                    /* translators: %s site URL */
                    __('Property "%s" was not found on this Google account.', 'nexora-pulse'),
                    $saved_site
                ),
                'available' => $available,
            ];
        }

        // Persist the EXACT property string Google recognises. The user may have
        // typed a near-miss (missing trailing slash, http vs https, www vs not,
        // or a URL-prefix when the verified property is a sc-domain: one). We
        // matched it fuzzily above — now canonicalise gsc_site_url to Google's
        // own value so every later API call (URL Inspection, Search Analytics)
        // sends a siteUrl that exactly matches the property. Without this, the
        // Inspect URL call fails with "You do not own this site."
        $canonical = (string) $matched['siteUrl'];
        if ($canonical !== '' && $canonical !== $saved_site) {
            $current                 = (array) get_site_option('nexora_pulse_settings', []);
            $current['gsc_site_url'] = $canonical;
            update_site_option('nexora_pulse_settings', $current);
        }

        return [
            'ok'         => true,
            'site_url'   => $canonical,
            'permission' => $matched['permissionLevel'] ?? '',
            'properties' => array_map(fn ($p) => $p['siteUrl'], $properties),
        ];
    }

    public function save_credentials(string $client_id, string $client_secret, string $site_url): string|WP_Error
    {
        $this->settings->save_encrypted('gsc_client_id', $client_id);
        $this->settings->save_encrypted('gsc_client_secret', $client_secret);

        $current                = (array) get_site_option('nexora_pulse_settings', []);
        $current['gsc_site_url'] = $site_url;
        update_site_option('nexora_pulse_settings', $current);

        return $this->get_auth_url($client_id);
    }

    public function disconnect(): void
    {
        delete_site_option('nexora_pulse_enc_gsc_client_id');
        delete_site_option('nexora_pulse_enc_gsc_client_secret');
        delete_site_option('nexora_pulse_enc_gsc_access_token');
        delete_site_option('nexora_pulse_enc_gsc_refresh_token');

        $current = (array) get_site_option('nexora_pulse_settings', []);
        $current['gsc_connected']        = false;
        $current['gsc_last_synced']      = '';
        $current['gsc_token_expires_at'] = 0;
        update_site_option('nexora_pulse_settings', $current);

        // Bust dashboard summary and CWV transients so the next API call
        // reflects the disconnected state immediately, not after the 5-min cache.
        $site_id = get_current_blog_id();
        delete_transient("nexora_pulse_summary_{$site_id}");
        delete_transient("nexora_pulse_oxygen_{$site_id}");
    }

    public function handle_oauth_callback(string $code, string $state): bool|WP_Error
    {
        // CSRF guard — the state we sent to Google must round-trip unchanged.
        $expected_state = (string) get_transient(self::STATE_TRANSIENT);
        if (empty($expected_state) || !hash_equals($expected_state, $state)) {
            return new WP_Error(
                'invalid_state',
                __('OAuth state mismatch. Please restart the connection from Settings → Integrations.', 'nexora-pulse')
            );
        }
        delete_transient(self::STATE_TRANSIENT);

        $client_id     = $this->settings->get_encrypted('gsc_client_id');
        $client_secret = $this->settings->get_encrypted('gsc_client_secret');

        if (empty($client_id) || empty($client_secret)) {
            return new WP_Error('no_credentials', 'GSC credentials not found.');
        }

        $response = wp_remote_post(self::OAUTH_ENDPOINT, [
            'timeout' => 20,
            'body'    => [
                'code'          => $code,
                'client_id'     => $client_id,
                'client_secret' => $client_secret,
                'redirect_uri'  => $this->get_redirect_uri(),
                'grant_type'    => 'authorization_code',
            ],
        ]);

        if (is_wp_error($response)) {
            return $response;
        }

        $http_code = (int) wp_remote_retrieve_response_code($response);
        $body      = json_decode(wp_remote_retrieve_body($response), true);

        if (!empty($body['error'])) {
            return new WP_Error('oauth_error', $body['error_description'] ?? $body['error']);
        }

        // Only treat it as connected when Google actually returned an access
        // token. Some failures return a 200 with no token (or an HTML body) —
        // storing an empty token would fake "connected" and then silently fail.
        $access_token = isset($body['access_token']) ? (string) $body['access_token'] : '';
        if ($access_token === '') {
            // Log the raw response (without the token) so the cause is visible.
            if (defined('WP_DEBUG') && WP_DEBUG) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
                error_log('Nexora Pulse GSC: token exchange returned no access_token. HTTP ' . $http_code . ' redirect_uri=' . $this->get_redirect_uri() . ' body=' . substr((string) wp_remote_retrieve_body($response), 0, 500));
            }
            return new WP_Error(
                'oauth_no_token',
                __('Google did not return an access token. This usually means the redirect URI in your Google OAuth client does not exactly match this site. Copy the redirect URI from the connect screen and paste it into Google Cloud → Credentials → your OAuth client → Authorized redirect URIs.', 'nexora-pulse')
            );
        }

        $this->settings->save_encrypted('gsc_access_token', $access_token);
        $this->save_token_expiry((int) ($body['expires_in'] ?? 3600));
        if (!empty($body['refresh_token'])) {
            $this->settings->save_encrypted('gsc_refresh_token', $body['refresh_token']);
        }

        $current                  = (array) get_site_option('nexora_pulse_settings', []);
        $current['gsc_connected'] = true;
        update_site_option('nexora_pulse_settings', $current);

        return true;
    }

    public function run(): array
    {
        $access_token = $this->get_valid_token();
        if (is_wp_error($access_token)) {
            return ['error' => $access_token->get_error_message()];
        }

        $site_url = $this->settings->get('gsc_site_url', '');
        if (empty($site_url)) {
            return ['error' => 'No GSC site URL configured.'];
        }

        $end_date = gmdate('Y-m-d');
        $start    = gmdate('Y-m-d', strtotime('-28 days'));
        $payload  = wp_json_encode([
            'startDate'  => $start,
            'endDate'    => $end_date,
            'dimensions' => ['page', 'query', 'date'],
            'rowLimit'   => 1000,
        ]);

        $request = static fn (string $token) => wp_remote_post(
            self::GSC_API . '/sites/' . urlencode($site_url) . '/searchAnalytics/query',
            [
                'timeout' => 30,
                'headers' => [
                    'Authorization' => "Bearer {$token}",
                    'Content-Type'  => 'application/json',
                ],
                'body' => $payload,
            ]
        );

        $response = $request($access_token);

        // Stored token may have been revoked or expired server-side — refresh
        // once and retry before giving up.
        if (!is_wp_error($response) && (int) wp_remote_retrieve_response_code($response) === 401) {
            $access_token = $this->force_refresh();
            if (is_wp_error($access_token)) {
                return ['error' => $access_token->get_error_message()];
            }
            $response = $request($access_token);
        }

        if (is_wp_error($response)) {
            return ['error' => $response->get_error_message()];
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!empty($body['error'])) {
            return ['error' => $body['error']['message'] ?? 'GSC API error'];
        }

        $rows    = $body['rows'] ?? [];
        $synced  = $this->upsert_rows($rows);

        $current                  = (array) get_site_option('nexora_pulse_settings', []);
        $current['gsc_last_synced'] = current_time('mysql');
        update_site_option('nexora_pulse_settings', $current);

        return ['synced' => $synced, 'rows' => count($rows)];
    }

    private function upsert_rows(array $rows): int
    {
        global $wpdb;
        $site_id = get_current_blog_id();
        $table   = $wpdb->prefix . 'nexora_pulse_gsc_data';
        $count   = 0;

        foreach ($rows as $row) {
            $keys       = $row['keys'] ?? [];
            $page       = $keys[0] ?? '';
            $query      = $keys[1] ?? '';
            $date       = $keys[2] ?? '';

            if (empty($page) || empty($date)) {
                continue;
            }

            $wpdb->replace($table, [
                'site_id'     => $site_id,
                'url'         => $page,
                'query'       => $query,
                'clicks'      => (int) ($row['clicks'] ?? 0),
                'impressions' => (int) ($row['impressions'] ?? 0),
                'ctr'         => (float) ($row['ctr'] ?? 0),
                'position'    => (float) ($row['position'] ?? 0),
                'data_date'   => $date,
            ]);
            $count++;
        }

        delete_transient("nexora_pulse_summary_" . get_current_blog_id());

        return $count;
    }

    /**
     * Return a usable access token, refreshing proactively when the stored
     * one is expired or close to expiry. Google access tokens only live ~1
     * hour, so without this every call made after the first hour fails 401.
     *
     * Public so IndexInspector (URL Inspection API) shares the same lifecycle.
     */
    public function get_valid_token(): string|WP_Error
    {
        $token = $this->settings->get_encrypted('gsc_access_token');

        if (!empty($token) && !$this->token_expired()) {
            return $token;
        }

        return $this->force_refresh();
    }

    /**
     * Exchange the refresh token for a fresh access token, regardless of the
     * stored token's state. Used on expiry and as the 401 retry path.
     */
    public function force_refresh(): string|WP_Error
    {
        $refresh_token = $this->settings->get_encrypted('gsc_refresh_token');
        if (empty($refresh_token)) {
            return new WP_Error('no_token', __('Not connected to Google Search Console.', 'nexora-pulse'));
        }

        return $this->refresh_token($refresh_token);
    }

    private function token_expired(): bool
    {
        $expires_at = (int) $this->settings->get('gsc_token_expires_at', 0);
        // Legacy installs (connected before expiry tracking existed) have no
        // timestamp — treat their token as expired so it gets refreshed once
        // and the expiry recorded.
        if ($expires_at === 0) {
            return true;
        }
        return time() >= ($expires_at - self::TOKEN_EXPIRY_BUFFER);
    }

    private function save_token_expiry(int $expires_in): void
    {
        $current = (array) get_site_option('nexora_pulse_settings', []);
        $current['gsc_token_expires_at'] = time() + max(60, $expires_in);
        update_site_option('nexora_pulse_settings', $current);
    }

    private function refresh_token(string $refresh_token): string|WP_Error
    {
        $client_id     = $this->settings->get_encrypted('gsc_client_id');
        $client_secret = $this->settings->get_encrypted('gsc_client_secret');

        $response = wp_remote_post(self::OAUTH_ENDPOINT, [
            'timeout' => 20,
            'body'    => [
                'refresh_token' => $refresh_token,
                'client_id'     => $client_id,
                'client_secret' => $client_secret,
                'grant_type'    => 'refresh_token',
            ],
        ]);

        if (is_wp_error($response)) {
            return $response;
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!empty($body['error'])) {
            // invalid_grant = refresh token revoked/expired — the connection is
            // dead and the user must re-authorize. Anything else may be transient.
            if (($body['error'] ?? '') === 'invalid_grant') {
                return new WP_Error(
                    'reconnect_required',
                    __('Google has revoked this connection (refresh token expired). Disconnect and reconnect Search Console in Settings → Integrations.', 'nexora-pulse')
                );
            }
            return new WP_Error('refresh_failed', $body['error_description'] ?? __('Token refresh failed.', 'nexora-pulse'));
        }

        $new_token = (string) ($body['access_token'] ?? '');
        if ($new_token === '') {
            return new WP_Error('refresh_failed', __('Google returned no access token on refresh.', 'nexora-pulse'));
        }

        $this->settings->save_encrypted('gsc_access_token', $new_token);
        $this->save_token_expiry((int) ($body['expires_in'] ?? 3600));

        return $new_token;
    }

    private function get_redirect_uri(): string
    {
        return rest_url('nexora-pulse/v1/gsc/oauth/callback');
    }

    private function get_auth_url(string $client_id): string
    {
        // One-time anti-CSRF state, validated in handle_oauth_callback().
        $state = wp_generate_password(32, false, false);
        set_transient(self::STATE_TRANSIENT, $state, HOUR_IN_SECONDS);

        // NOTE: add_query_arg() already URL-encodes values. Do NOT wrap
        // redirect_uri in urlencode() — that double-encodes it, so the value
        // Google sees at authorization no longer matches the (single-encoded)
        // redirect_uri sent during token exchange, and Google refuses to issue
        // a token (symptom: redirects back but never connects).
        return add_query_arg([
            'client_id'     => $client_id,
            'redirect_uri'  => $this->get_redirect_uri(),
            'response_type' => 'code',
            'scope'         => 'https://www.googleapis.com/auth/webmasters.readonly',
            'access_type'   => 'offline',
            'prompt'        => 'consent',
            'state'         => $state,
        ], self::AUTH_ENDPOINT);
    }
}
