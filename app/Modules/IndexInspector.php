<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

use WP_Error;
use WP_Post;

defined('ABSPATH') || exit;

/**
 * The Index Doctor — calls Google Search Console's URL Inspection API,
 * persists per-URL verdicts, and cross-references our own signals
 * (originality, links, content depth) to explain WHY a page isn't indexed.
 *
 * GSC URL Inspection API endpoint:
 *   POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
 *
 * Quota: ~2,000 requests/day/property. We aggressively cache + queue.
 */
final class IndexInspector
{
    private const API_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
    private const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

    /** Re-inspect a URL at most every 24h unless force=true. */
    private const CACHE_TTL_HOURS = 24;

    /** Soft daily quota — refuse new inspections after this many today. */
    private const DAILY_QUOTA = 1800;

    private \NexoraPulse\Services\SettingsService $settings;

    public function __construct()
    {
        $this->settings = new \NexoraPulse\Services\SettingsService();
    }

    // -------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------

    /**
     * Inspect a single URL via GSC API and persist the result.
     * Returns the persisted row data, or WP_Error if the call fails.
     */
    public function inspect_post(WP_Post $post, bool $force = false): array|WP_Error
    {
        $site_id = get_current_blog_id();
        $url     = (string) get_permalink($post->ID);

        if (empty($url)) {
            return new WP_Error('no_url', __('Post has no public URL.', 'nexora-pulse'));
        }

        // Cache check.
        if (!$force) {
            $existing = $this->get_row($site_id, $post->ID);
            if ($existing && $this->is_fresh($existing)) {
                return $existing;
            }
        }

        if (!$this->within_quota($site_id)) {
            return new WP_Error('quota_exceeded', __('Daily Google Search Console inspection quota reached. Try again tomorrow.', 'nexora-pulse'));
        }

        $gsc_site = (string) $this->settings->get('gsc_site_url', '');
        if (empty($gsc_site)) {
            return new WP_Error('no_gsc', __('Google Search Console is not connected.', 'nexora-pulse'));
        }

        $gsc = new GscSync();

        $token = $gsc->get_valid_token();
        if (is_wp_error($token)) {
            return $token;
        }

        $request = static fn (string $bearer) => wp_remote_post(self::API_ENDPOINT, [
            'timeout' => 25,
            'headers' => [
                'Authorization' => "Bearer {$bearer}",
                'Content-Type'  => 'application/json',
            ],
            'body' => wp_json_encode([
                'inspectionUrl' => $url,
                'siteUrl'       => $gsc_site,
            ]),
        ]);

        $response = $request($token);

        // Token may have been revoked server-side — refresh once and retry.
        if (!is_wp_error($response) && (int) wp_remote_retrieve_response_code($response) === 401) {
            $token = $gsc->force_refresh();
            if (is_wp_error($token)) {
                return $token;
            }
            $response = $request($token);
        }

        if (is_wp_error($response)) {
            return $response;
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);

        if ($code !== 200) {
            /* translators: %d: HTTP status code returned by Google. */
            $msg = $body['error']['message'] ?? sprintf(__('Google returned HTTP %d.', 'nexora-pulse'), $code);
            // 401/403 → credentials problem, not a per-URL problem. Use a
            // distinct code so bulk scans can abort instead of burning quota.
            $error_code = in_array((int) $code, [401, 403], true) ? 'gsc_auth_error' : 'gsc_api_error';

            // The "do not own this site / not part of this property" 403 means the
            // stored property doesn't match a verified GSC property, or this URL
            // falls outside it. Give an actionable message instead of Google's
            // raw text, and point the user at the one-click fix (reconnect, which
            // re-runs verify and canonicalises the property string).
            if ((int) $code === 403 && stripos($msg, 'do not own') !== false) {
                $msg = sprintf(
                    /* translators: %1$s inspected URL, %2$s stored GSC property */
                    __('Google does not recognise "%1$s" as part of your verified property "%2$s". Re-open the Search Console connection and confirm the correct property — Pulse will sync the exact property URL Google expects. If your site is a Domain property, make sure the inspected URL is on the same domain.', 'nexora-pulse'),
                    $url,
                    $gsc_site
                );
            }
            return new WP_Error($error_code, $msg);
        }

        $this->bump_quota($site_id);

        $parsed = $this->parse_inspection($body);
        $signals = $this->collect_signals($post);
        $risk   = $this->compute_risk_score($parsed, $signals);

        $row = $this->persist_row($site_id, $post->ID, $url, $parsed, $risk, $body);

        \NexoraPulse\Services\Logger::info(
            'index-doctor',
            'URL inspected',
            sprintf('%s — %s (risk: %d)', $url, $parsed['coverage_state'], $risk['score'])
        );

        return $row;
    }

    /**
     * Return all index status rows for a site, with computed signals + diagnosis.
     */
    public function list_for_site(int $site_id): array
    {
        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_index_status';

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE site_id = %d ORDER BY risk_score DESC, inspected_at DESC",
                $site_id
            ),
            ARRAY_A
        );

        return array_map(fn ($r) => $this->hydrate_row((array) $r), $rows ?: []);
    }

    /**
     * Aggregate summary — counts by coverage state + risk distribution.
     */
    public function summary(int $site_id): array
    {
        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_index_status';

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT coverage_state, verdict, risk_score FROM {$table} WHERE site_id = %d",
                $site_id
            ),
            ARRAY_A
        ) ?: [];

        $total          = count($rows);
        $indexed        = 0;
        $crawled_not    = 0;
        $discovered_not = 0;
        $excluded       = 0;
        $high_risk      = 0;

        foreach ($rows as $r) {
            $state = (string) ($r['coverage_state'] ?? '');
            if (stripos($state, 'submitted and indexed') !== false || stripos($state, 'indexed, not submitted') !== false) {
                $indexed++;
            } elseif (stripos($state, 'crawled') !== false) {
                $crawled_not++;
            } elseif (stripos($state, 'discovered') !== false) {
                $discovered_not++;
            } elseif (stripos($state, 'excluded') !== false || stripos($state, 'noindex') !== false) {
                $excluded++;
            }

            if ((int) ($r['risk_score'] ?? 0) >= 70) {
                $high_risk++;
            }
        }

        return [
            'total_inspected'        => $total,
            'indexed'                => $indexed,
            'crawled_not_indexed'    => $crawled_not,
            'discovered_not_indexed' => $discovered_not,
            'excluded'               => $excluded,
            'high_risk'              => $high_risk,
            'quota_used_today'       => $this->get_quota_used($site_id),
            'quota_total'            => self::DAILY_QUOTA,
        ];
    }

    /**
     * Pattern detector — find the systemic problem across rejected pages.
     * Returns a list of patterns like "9 of 11 rejected pages have <400 words".
     */
    public function detect_patterns(int $site_id): array
    {
        $rows     = $this->list_for_site($site_id);
        $rejected = array_filter($rows, fn ($r) => !$this->is_indexed_state((string) $r['coverage_state']));

        if (count($rejected) < 2) {
            return [];
        }

        $patterns       = [];
        $total_rejected = count($rejected);

        // Thin content pattern.
        $thin = 0;
        foreach ($rejected as $r) {
            if (!empty($r['signals']['thin_content'])) {
                $thin++;
            }
        }
        if ($thin >= max(2, (int) ceil($total_rejected * 0.5))) {
            $patterns[] = [
                'key'     => 'thin_content',
                'count'   => $thin,
                'total'   => $total_rejected,
                'message' => sprintf(
                    /* translators: %1$d affected pages, %2$d total rejected pages */
                    __('%1$d of %2$d rejected pages have under 300 words. Google often skips thin content.', 'nexora-pulse'),
                    $thin,
                    $total_rejected
                ),
                'fix'     => __('Expand affected pages to 600+ words with depth, examples, and unique insight.', 'nexora-pulse'),
            ];
        }

        // Orphan / no-internal-links pattern.
        $orphans = 0;
        foreach ($rejected as $r) {
            if (!empty($r['signals']['is_orphan'])) {
                $orphans++;
            }
        }
        if ($orphans >= max(2, (int) ceil($total_rejected * 0.4))) {
            $patterns[] = [
                'key'     => 'orphans',
                'count'   => $orphans,
                'total'   => $total_rejected,
                'message' => sprintf(
                    /* translators: %1$d orphan pages, %2$d total rejected */
                    __('%1$d of %2$d rejected pages have no incoming internal links. Google deprioritises orphans.', 'nexora-pulse'),
                    $orphans,
                    $total_rejected
                ),
                'fix'     => __('Add 2–5 internal links from related, high-authority pages to each affected URL.', 'nexora-pulse'),
            ];
        }

        // Duplicate / low originality pattern.
        $dupes = 0;
        foreach ($rejected as $r) {
            if (!empty($r['signals']['near_duplicate'])) {
                $dupes++;
            }
        }
        if ($dupes >= max(2, (int) ceil($total_rejected * 0.3))) {
            $patterns[] = [
                'key'     => 'duplicates',
                'count'   => $dupes,
                'total'   => $total_rejected,
                'message' => sprintf(
                    /* translators: %1$d near-duplicate pages, %2$d total rejected */
                    __('%1$d of %2$d rejected pages are near-duplicates of other content on your site.', 'nexora-pulse'),
                    $dupes,
                    $total_rejected
                ),
                'fix'     => __('Merge near-duplicates with canonical tags, or differentiate the content significantly.', 'nexora-pulse'),
            ];
        }

        // Stale content pattern.
        $stale = 0;
        foreach ($rejected as $r) {
            if (!empty($r['signals']['stale'])) {
                $stale++;
            }
        }
        if ($stale >= max(2, (int) ceil($total_rejected * 0.3))) {
            $patterns[] = [
                'key'     => 'stale',
                'count'   => $stale,
                'total'   => $total_rejected,
                'message' => sprintf(
                    /* translators: %1$d stale pages, %2$d total rejected */
                    __('%1$d of %2$d rejected pages haven\'t been updated in 2+ years.', 'nexora-pulse'),
                    $stale,
                    $total_rejected
                ),
                'fix'     => __('Refresh content with current information and update the post date.', 'nexora-pulse'),
            ];
        }

        return $patterns;
    }

    /**
     * Pre-publish risk prediction — uses only our local signals (no GSC API call).
     * Returns a 0-100 risk score + reasons. Used in the meta editor modal.
     */
    public function predict_risk(WP_Post $post): array
    {
        $signals = $this->collect_signals($post);

        // No coverage state available (this is a prediction, not an actual GSC verdict).
        $parsed = [
            'coverage_state'   => '',
            'verdict'          => '',
            'google_canonical' => '',
            'user_canonical'   => '',
        ];

        $risk = $this->compute_risk_score($parsed, $signals);

        return [
            'score'    => $risk['score'],
            'band'     => $this->risk_band($risk['score']),
            'reasons'  => $risk['reasons'],
            'signals'  => $risk['signals'],
            'is_prediction' => true,
        ];
    }

    // -------------------------------------------------------------
    // GSC response parsing
    // -------------------------------------------------------------

    private function parse_inspection(array $body): array
    {
        $result    = $body['inspectionResult'] ?? [];
        $indexing  = $result['indexStatusResult'] ?? [];

        return [
            'coverage_state'   => (string) ($indexing['coverageState']   ?? 'unknown'),
            'verdict'          => (string) ($indexing['verdict']         ?? 'unknown'),
            'robots_txt_state' => (string) ($indexing['robotsTxtState']  ?? 'unknown'),
            'indexing_state'   => (string) ($indexing['indexingState']   ?? 'unknown'),
            'page_fetch_state' => (string) ($indexing['pageFetchState'] ?? 'unknown'),
            'last_crawl_time'  => (string) ($indexing['lastCrawlTime']   ?? ''),
            'google_canonical' => (string) ($indexing['googleCanonical'] ?? ''),
            'user_canonical'   => (string) ($indexing['userCanonical']   ?? ''),
            'referring_urls'   => (array)  ($indexing['referringUrls']   ?? []),
        ];
    }

    // -------------------------------------------------------------
    // Cross-signal collection — uses our own modules
    // -------------------------------------------------------------

    private function collect_signals(WP_Post $post): array
    {
        global $wpdb;

        $extractor = new ContentExtractor();
        $text      = $extractor->get_text($post);
        $word_count = str_word_count($text);
        $site_id   = get_current_blog_id();

        // Internal link count (incoming).
        $links_table = $wpdb->prefix . 'nexora_pulse_links';
        $incoming    = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$links_table} WHERE site_id = %d AND target_id = %d",
            $site_id,
            $post->ID
        ));

        // Near-duplicate flag from originality engine.
        $sim_table  = $wpdb->prefix . 'nexora_pulse_similarity';
        $is_dupe    = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$sim_table}
             WHERE site_id = %d AND (post_id_a = %d OR post_id_b = %d) AND similarity >= 70",
            $site_id,
            $post->ID,
            $post->ID
        ));

        // Age — 2+ years without update considered stale.
        $modified_ts = strtotime((string) $post->post_modified);
        $age_days    = $modified_ts ? (time() - $modified_ts) / DAY_IN_SECONDS : 0;

        // Has handcrafted meta description?
        $ncx_data    = (array) (get_post_meta($post->ID, '_ncx_seo_data', true) ?: []);
        $has_meta    = !empty($ncx_data['og_desc'] ?? '')
            || !empty(get_post_meta($post->ID, '_nexora_meta_desc', true))
            || !empty(get_post_meta($post->ID, '_yoast_wpseo_metadesc', true));

        // Noindex flag.
        $is_noindex = (bool) get_post_meta($post->ID, '_nexora_noindex', true)
            || get_post_meta($post->ID, '_yoast_wpseo_meta-robots-noindex', true) === '1';

        return [
            'word_count'      => $word_count,
            'thin_content'    => $word_count > 0 && $word_count < 300,
            'incoming_links'  => $incoming,
            'is_orphan'       => $incoming === 0,
            'near_duplicate'  => $is_dupe > 0,
            'age_days'        => (int) $age_days,
            'stale'           => $age_days > 730,
            'has_meta_desc'   => $has_meta,
            'is_noindex'      => $is_noindex,
        ];
    }

    // -------------------------------------------------------------
    // Risk scoring (0–100) + reasons
    // -------------------------------------------------------------

    private function compute_risk_score(array $parsed, array $signals): array
    {
        $score   = 0;
        $reasons = [];

        // Coverage state is the strongest signal.
        $coverage = strtolower($parsed['coverage_state']);
        if (str_contains($coverage, 'crawled') && str_contains($coverage, 'not indexed')) {
            $score += 55;
            $reasons[] = [
                'severity' => 'critical',
                'message'  => __('Google crawled this page but decided NOT to index it. This usually indicates a quality or duplication signal.', 'nexora-pulse'),
            ];
        } elseif (str_contains($coverage, 'discovered') && str_contains($coverage, 'not indexed')) {
            $score += 45;
            $reasons[] = [
                'severity' => 'high',
                'message'  => __('Google knows this URL exists but hasn\'t crawled it. Often a crawl-budget or authority signal.', 'nexora-pulse'),
            ];
        } elseif (str_contains($coverage, 'excluded') || str_contains($coverage, 'noindex')) {
            $score += 80;
            $reasons[] = [
                'severity' => 'critical',
                'message'  => __('Page is explicitly excluded from indexing (noindex tag or canonical redirect).', 'nexora-pulse'),
            ];
        }

        // Verdict adjustments.
        if (strtoupper($parsed['verdict']) === 'FAIL') {
            $score += 10;
        }

        // Cross-signal weight (each adds risk because it correlates with rejection).
        if (!empty($signals['is_noindex'])) {
            $score += 25;
            $reasons[] = [
                'severity' => 'critical',
                'message'  => __('Page has a noindex directive set in WordPress. Remove it to allow indexing.', 'nexora-pulse'),
            ];
        }

        if (!empty($signals['thin_content'])) {
            $score += 15;
            $reasons[] = [
                'severity' => 'high',
                'message'  => sprintf(
                    /* translators: %d word count */
                    __('Only %d words on this page. Thin content rarely earns a Google index slot.', 'nexora-pulse'),
                    (int) $signals['word_count']
                ),
            ];
        }

        if (!empty($signals['is_orphan'])) {
            $score += 12;
            $reasons[] = [
                'severity' => 'high',
                'message'  => __('No internal links point to this page. Add links from related, high-authority content.', 'nexora-pulse'),
            ];
        }

        if (!empty($signals['near_duplicate'])) {
            $score += 18;
            $reasons[] = [
                'severity' => 'high',
                'message'  => __('Content is highly similar to another page on your site. Google often picks only one to index.', 'nexora-pulse'),
            ];
        }

        if (!empty($signals['stale'])) {
            $score += 6;
            $reasons[] = [
                'severity' => 'medium',
                'message'  => __('Content hasn\'t been updated in 2+ years. Freshness is a positive ranking signal.', 'nexora-pulse'),
            ];
        }

        if (empty($signals['has_meta_desc'])) {
            $score += 4;
            $reasons[] = [
                'severity' => 'low',
                'message'  => __('No hand-written meta description. Adding one improves click signals.', 'nexora-pulse'),
            ];
        }

        // Canonical mismatch with Google.
        if (!empty($parsed['google_canonical']) && !empty($parsed['user_canonical'])
            && $parsed['google_canonical'] !== $parsed['user_canonical']) {
            $score += 20;
            $reasons[] = [
                'severity' => 'high',
                'message'  => sprintf(
                    /* translators: %s the canonical URL Google chose */
                    __('Google picked a different canonical URL: %s. Your canonical signal is being overridden.', 'nexora-pulse'),
                    esc_url_raw($parsed['google_canonical'])
                ),
            ];
        }

        return [
            'score'   => max(0, min(100, $score)),
            'reasons' => $reasons,
            'signals' => $signals,
        ];
    }

    // -------------------------------------------------------------
    // Persistence
    // -------------------------------------------------------------

    private function persist_row(int $site_id, int $post_id, string $url, array $parsed, array $risk, array $raw): array
    {
        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_index_status';

        $data = [
            'site_id'         => $site_id,
            'post_id'         => $post_id,
            'url'             => $url,
            'coverage_state'  => $parsed['coverage_state'],
            'verdict'         => $parsed['verdict'],
            'robots_txt_state' => $parsed['robots_txt_state'],
            'indexing_state'  => $parsed['indexing_state'],
            'page_fetch_state' => $parsed['page_fetch_state'],
            'last_crawl_time' => $this->normalize_datetime($parsed['last_crawl_time']),
            'google_canonical' => $parsed['google_canonical'],
            'user_canonical'  => $parsed['user_canonical'],
            'referring_urls'  => wp_json_encode($parsed['referring_urls']),
            'risk_score'      => (int) $risk['score'],
            'risk_reasons'    => wp_json_encode([
                'reasons' => $risk['reasons'],
                'signals' => $risk['signals'],
            ]),
            'inspected_at'    => current_time('mysql'),
            'raw_response'    => wp_json_encode($raw),
        ];

        $existing = $this->get_row($site_id, $post_id);
        if ($existing) {
            $wpdb->update($table, $data, ['site_id' => $site_id, 'post_id' => $post_id]);
        } else {
            $wpdb->insert($table, $data);
        }

        $row = $this->get_row($site_id, $post_id);
        return $row ? $this->hydrate_row($row) : [];
    }

    private function get_row(int $site_id, int $post_id): ?array
    {
        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_index_status';

        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE site_id = %d AND post_id = %d",
                $site_id,
                $post_id
            ),
            ARRAY_A
        );

        return $row ?: null;
    }

    private function hydrate_row(array $row): array
    {
        $row['referring_urls'] = json_decode((string) ($row['referring_urls'] ?? ''), true) ?: [];
        $parsed_reasons        = json_decode((string) ($row['risk_reasons'] ?? ''), true) ?: [];
        $row['reasons']        = (array) ($parsed_reasons['reasons'] ?? []);
        $row['signals']        = (array) ($parsed_reasons['signals'] ?? []);

        $row['post_title']     = (string) get_the_title((int) $row['post_id']);
        $row['risk_score']     = (int) ($row['risk_score'] ?? 0);
        $row['risk_band']      = $this->risk_band($row['risk_score']);
        $row['is_indexed']     = $this->is_indexed_state((string) ($row['coverage_state'] ?? ''));

        unset($row['raw_response'], $row['risk_reasons']);

        return $row;
    }

    private function is_fresh(array $row): bool
    {
        $ts = strtotime((string) ($row['inspected_at'] ?? '0'));
        if (!$ts) {
            return false;
        }
        return (time() - $ts) < (self::CACHE_TTL_HOURS * HOUR_IN_SECONDS);
    }

    private function is_indexed_state(string $state): bool
    {
        $lower = strtolower($state);
        return str_contains($lower, 'submitted and indexed') || str_contains($lower, 'indexed, not submitted');
    }

    private function risk_band(int $score): string
    {
        return match (true) {
            $score >= 70 => 'high',
            $score >= 40 => 'medium',
            $score >= 15 => 'low',
            default      => 'minimal',
        };
    }

    private function normalize_datetime(string $iso): ?string
    {
        if (empty($iso)) {
            return null;
        }
        $ts = strtotime($iso);
        return $ts ? gmdate('Y-m-d H:i:s', $ts) : null;
    }

    // -------------------------------------------------------------
    // Quota tracking
    // -------------------------------------------------------------

    private function within_quota(int $site_id): bool
    {
        return $this->get_quota_used($site_id) < self::DAILY_QUOTA;
    }

    private function get_quota_used(int $site_id): int
    {
        $key = $this->quota_key($site_id);
        return (int) get_transient($key);
    }

    private function bump_quota(int $site_id): void
    {
        $key  = $this->quota_key($site_id);
        $used = (int) get_transient($key);
        set_transient($key, $used + 1, DAY_IN_SECONDS);
    }

    private function quota_key(int $site_id): string
    {
        return "nexora_pulse_gsc_inspect_quota_{$site_id}_" . gmdate('Y-m-d');
    }

}
