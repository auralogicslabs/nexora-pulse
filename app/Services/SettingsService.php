<?php
declare(strict_types=1);

namespace NexoraPulse\Services;

defined('ABSPATH') || exit;

final class SettingsService
{
    private const OPTION_KEY = 'nexora_pulse_settings';

    private array $defaults = [
        'license_key'       => '',
        'license_tier'      => 'free',
        'scan_frequency'    => 'daily',
        'notify_admin'      => 1,
        'notify_email'      => '',
        'ai_provider'       => 'openai',
        'ai_model'          => 'gpt-4o-mini',
        'gsc_connected'     => false,
        'gsc_site_url'      => '',
        // SEO head injection settings
        'twitter_site'      => '',
        'verify_google'     => '',
        'verify_bing'       => '',
        'verify_yandex'     => '',
        'ga4_id'            => '',
        'gtm_id'            => '',
    ];

    public function all(): array
    {
        $saved = (array) get_site_option(self::OPTION_KEY, []);
        return array_merge($this->defaults, $saved);
    }

    public function get_public_settings(): array
    {
        $all = $this->all();
        // Never expose raw keys over REST.
        unset($all['ai_api_key'], $all['gsc_client_secret'], $all['gsc_access_token'], $all['gsc_refresh_token']);
        $all['ai_api_key_set']         = !empty($this->get_encrypted('ai_api_key'));
        $all['gsc_client_secret_set']  = !empty($this->get_encrypted('gsc_client_secret'));
        $all['pagespeed_api_key_set']  = !empty($this->get_encrypted('pagespeed_api_key'));
        return $all;
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->all()[$key] ?? $default;
    }

    public function update(array $data): void
    {
        $current  = $this->all();
        $allowed  = [
            'scan_frequency', 'notify_admin', 'notify_email',
            'ai_provider', 'ai_model',
            'twitter_site', 'verify_google', 'verify_bing', 'verify_yandex',
            'ga4_id', 'gtm_id',
        ];
        foreach ($allowed as $key) {
            if (isset($data[$key])) {
                $current[$key] = match ($key) {
                    'notify_admin'      => (int) (bool) $data[$key],
                    'notify_email'      => sanitize_email($data[$key]),
                    'scan_frequency'    => in_array($data[$key], ['hourly', 'twicedaily', 'daily', 'weekly'], true) ? $data[$key] : 'daily',
                    default             => sanitize_text_field($data[$key]),
                };
            }
        }
        update_site_option(self::OPTION_KEY, $current);

        // Mirror head-injection settings as individual wp_options so SocialPreview
        // can read them with a fast get_option() call from any hook context.
        $head_keys = ['twitter_site', 'verify_google', 'verify_bing', 'verify_yandex', 'ga4_id', 'gtm_id'];
        foreach ($head_keys as $k) {
            if (isset($current[$k])) {
                update_option("nexora_pulse_{$k}", $current[$k]);
            }
        }

        // Bust the head-scan cache so detection re-runs on next page load.
        \NexoraPulse\Modules\SocialPreview::bust_head_cache();

        // Re-schedule cron if frequency changed.
        if (isset($data['scan_frequency'])) {
            wp_clear_scheduled_hook('nexora_pulse_daily_scan');
            wp_schedule_event(time(), $current['scan_frequency'], 'nexora_pulse_daily_scan');
        }
    }

    public function save_api_keys(array $keys): void
    {
        $current = $this->all();
        if (!empty($keys['ai_provider'])) {
            $current['ai_provider'] = sanitize_text_field($keys['ai_provider']);
        }
        if (!empty($keys['ai_model'])) {
            $current['ai_model'] = sanitize_text_field($keys['ai_model']);
        }
        if (!empty($keys['ai_api_key'])) {
            $this->save_encrypted('ai_api_key', $keys['ai_api_key']);
        }
        update_site_option(self::OPTION_KEY, $current);
    }

    public function activate_license(string $key): array|\WP_Error
    {
        if (empty($key)) {
            return new \WP_Error('invalid_key', __('License key cannot be empty.', 'nexora-pulse'));
        }
        // Placeholder — real license validation would hit Auralogics license server.
        $tier = str_starts_with($key, 'PRO-') ? 'pro' : 'free';
        $current = $this->all();
        $current['license_key']  = sanitize_text_field($key);
        $current['license_tier'] = $tier;
        update_site_option(self::OPTION_KEY, $current);
        /* translators: %s: license tier name (e.g. PRO). */
        return ['tier' => $tier, 'message' => sprintf(__('License activated (%s).', 'nexora-pulse'), strtoupper($tier))];
    }

    /**
     * Full factory reset for this site.
     *
     * This is the Danger Zone "Clear All Data" action. It erases EVERYTHING the
     * plugin persists for the current site so the next page load behaves exactly
     * like a fresh install: every table row, all integration credentials and
     * OAuth tokens, all settings/options, the onboarding flag, the install id,
     * and every cached transient. After this runs the user must reconnect GSC,
     * re-enter API keys, and will see the setup wizard again.
     *
     * User-authored per-post SEO content (_nexora_og_*, _nexora_meta_*) is left
     * untouched — same policy as uninstall.php — so titles/descriptions survive.
     */
    public function clear_site_data(int $site_id): void
    {
        global $wpdb;

        // 1. Empty every data table for this site. Includes redirects,
        //    index_status, and not_found which the old version missed.
        $tables = [
            'logs', 'gsc_data', 'issues', 'links', 'redirects', 'similarity',
            'ai_history', 'actions', 'credits', 'index_status', 'not_found',
        ];
        foreach ($tables as $t) {
            $table = $wpdb->prefix . "nexora_pulse_{$t}";
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            $wpdb->query($wpdb->prepare("DELETE FROM {$table} WHERE site_id = %d", $site_id));
        }

        // 2. Wipe all encrypted credentials & OAuth tokens (GSC, AI, PageSpeed).
        //    These live in (site_)options as nexora_pulse_enc_* — clear by wildcard
        //    so we never miss a key, on both single-site and multisite.
        // phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE 'nexora\\_pulse\\_enc\\_%'");
        if (is_multisite()) {
            $wpdb->query("DELETE FROM {$wpdb->sitemeta} WHERE meta_key LIKE 'nexora\\_pulse\\_enc\\_%'");
        }
        // phpcs:enable

        // 3. Reset all plugin settings/options back to a clean install state.
        delete_site_option(self::OPTION_KEY);
        delete_site_option('nexora_pulse_robots_txt');
        delete_option('nexora_pulse_robots_txt');

        // 4. Reset onboarding so the setup wizard shows again, and rotate the
        //    install id so the frontend treats this as a brand-new install
        //    (clears persisted localStorage prefs on next load).
        delete_metadata('user', 0, 'nexora_pulse_onboarding_complete', '', true);
        update_option('nexora_pulse_install_id', wp_generate_uuid4());

        // 5. Clear per-post scan markers so analyzer/links re-scan from scratch.
        delete_metadata('post', 0, '_nexora_pulse_scanned_at', '', true);
        delete_metadata('post', 0, '_nexora_links_scanned', '', true);

        // 6. Flush every cached transient — scan progress, summaries, head scan,
        //    sitemap cache. Wildcard so nothing stale survives.
        // phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
        $wpdb->query(
            "DELETE FROM {$wpdb->options}
             WHERE option_name LIKE '\\_transient\\_nexora\\_pulse\\_%'
                OR option_name LIKE '\\_transient\\_timeout\\_nexora\\_pulse\\_%'"
        );
        if (is_multisite()) {
            $wpdb->query(
                "DELETE FROM {$wpdb->sitemeta}
                 WHERE meta_key LIKE '\\_site\\_transient\\_nexora\\_pulse\\_%'
                    OR meta_key LIKE '\\_site\\_transient\\_timeout\\_nexora\\_pulse\\_%'"
            );
        }
        // phpcs:enable
    }

    public function save_encrypted(string $key, string $value): void
    {
        // Use WP auth keys as simple XOR encryption — adequate for API keys in wp_options.
        $encoded = base64_encode($value ^ str_repeat(wp_salt(), (int) ceil(strlen($value) / strlen(wp_salt()))));
        update_site_option("nexora_pulse_enc_{$key}", $encoded);
    }

    public function get_encrypted(string $key): string
    {
        $encoded = (string) get_site_option("nexora_pulse_enc_{$key}", '');
        if (empty($encoded)) {
            return '';
        }
        $decoded = base64_decode($encoded, true);
        if ($decoded === false) {
            return '';
        }
        return $decoded ^ str_repeat(wp_salt(), (int) ceil(strlen($decoded) / strlen(wp_salt())));
    }
}
