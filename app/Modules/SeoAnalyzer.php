<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

use WP_Post;

defined('ABSPATH') || exit;

final class SeoAnalyzer
{
    private const BATCH_SIZE = 50;

    public function start_batch_scan(int $site_id): array
    {
        if (get_transient("nexora_pulse_scan_running_{$site_id}")) {
            return ['status' => 'already_running'];
        }

        $posts = get_posts([
            'post_type'      => ['post', 'page'],
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'fields'         => 'ids',
        ]);

        $total = count($posts);

        if ($total === 0) {
            return ['status' => 'done', 'total' => 0, 'issues_found' => 0];
        }

        set_transient("nexora_pulse_scan_total_{$site_id}", $total, HOUR_IN_SECONDS);
        set_transient("nexora_pulse_scan_done_{$site_id}", 0, HOUR_IN_SECONDS);
        set_transient("nexora_pulse_scan_running_{$site_id}", 1, HOUR_IN_SECONDS);
        set_transient("nexora_pulse_scan_queue_{$site_id}", $posts, HOUR_IN_SECONDS);

        // Run first batch synchronously so the user sees immediate results.
        // Subsequent batches are handled via WP-Cron.
        self::run_background_scan();

        return ['status' => 'started', 'total' => $total];
    }

    public static function run_background_scan(): void
    {
        $site_id   = get_current_blog_id();
        $instance  = new self();
        $queue     = (array) get_transient("nexora_pulse_scan_queue_{$site_id}");

        if (empty($queue)) {
            delete_transient("nexora_pulse_scan_running_{$site_id}");
            return;
        }

        $batch    = array_splice($queue, 0, self::BATCH_SIZE);
        $done_now = 0;

        foreach ($batch as $post_id) {
            $post = get_post((int) $post_id);
            if ($post) {
                // clear_existing=true removes stale issues before re-inserting so
                // resolved issues don't accumulate across scan runs.
                $instance->analyze_post($post, true);
                $done_now++;
            }
        }

        $done = (int) get_transient("nexora_pulse_scan_done_{$site_id}") + $done_now;
        set_transient("nexora_pulse_scan_done_{$site_id}", $done, HOUR_IN_SECONDS);
        set_transient("nexora_pulse_scan_queue_{$site_id}", $queue, HOUR_IN_SECONDS);

        if (!empty($queue)) {
            wp_schedule_single_event(time() + 2, 'nexora_pulse_daily_scan');
        } else {
            delete_transient("nexora_pulse_scan_running_{$site_id}");
            delete_transient("nexora_pulse_scan_queue_{$site_id}");
            \NexoraPulse\Services\Logger::info(
                'analyzer',
                'SEO scan completed',
                "Finished scanning {$done} pages."
            );
            // Email the admin a summary if alerts are enabled and the scan turned
            // up critical/high-severity issues.
            self::maybe_send_scan_alert($site_id);
        }
    }

    /**
     * Send the admin an email summary after a scan when notifications are on and
     * critical or high-severity issues exist. Honors the notify_admin toggle and
     * the configured notify_email address.
     */
    private static function maybe_send_scan_alert(int $site_id): void
    {
        $settings = new \NexoraPulse\Services\SettingsService();

        if ((int) $settings->get('notify_admin', 0) !== 1) {
            return;
        }

        $to = sanitize_email((string) ($settings->get('notify_email', '') ?: get_option('admin_email')));
        if ($to === '' || !is_email($to)) {
            return;
        }

        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_issues';
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $counts = $wpdb->get_row($wpdb->prepare(
            "SELECT
                SUM(severity = 'critical') AS critical,
                SUM(severity = 'high')     AS high,
                COUNT(*)                   AS total
             FROM {$table} WHERE site_id = %d AND status = 'open'",
            $site_id
        ), ARRAY_A);

        $critical = (int) ($counts['critical'] ?? 0);
        $high     = (int) ($counts['high'] ?? 0);
        $total    = (int) ($counts['total'] ?? 0);

        // Only email when there's something genuinely worth a notification.
        if ($critical === 0 && $high === 0) {
            return;
        }

        $site_name = get_bloginfo('name');
        $admin_url = admin_url('admin.php?page=nexora-pulse#/analyzer');

        $subject = sprintf(
            /* translators: 1: number of critical+high issues, 2: site name */
            __('[%1$s] Nexora Pulse found %2$d SEO issues that need attention', 'nexora-pulse'),
            $site_name,
            $critical + $high
        );

        /* translators: %s: site name. */
        $body  = sprintf(__('Your latest Nexora Pulse SEO scan of %s is complete.', 'nexora-pulse'), $site_name) . "\n\n";
        $body .= __('Issues found:', 'nexora-pulse') . "\n";
        /* translators: %d: number of critical issues. */
        $body .= '• ' . sprintf(__('%d critical', 'nexora-pulse'), $critical) . "\n";
        /* translators: %d: number of high-priority issues. */
        $body .= '• ' . sprintf(__('%d high priority', 'nexora-pulse'), $high) . "\n";
        /* translators: %d: total number of open issues. */
        $body .= '• ' . sprintf(__('%d open issues in total', 'nexora-pulse'), $total) . "\n\n";
        $body .= __('Review and fix them here:', 'nexora-pulse') . "\n" . $admin_url . "\n\n";
        $body .= __('— Nexora Pulse', 'nexora-pulse') . "\n";
        $body .= __('You are receiving this because email alerts are enabled in Nexora Pulse → Settings. Turn them off there any time.', 'nexora-pulse');

        wp_mail($to, $subject, $body);
    }

    public function analyze_post(WP_Post $post, bool $clear_existing = false): array
    {
        $site_id   = get_current_blog_id();
        $post_url  = (string) get_permalink($post->ID);
        $extractor = new ContentExtractor();
        $issues    = [];

        if ($clear_existing) {
            global $wpdb;
            $wpdb->delete($wpdb->prefix . 'nexora_pulse_issues', [
                'site_id' => $site_id,
                'post_id' => $post->ID,
            ]);
        }

        $issues = array_merge(
            $issues,
            $this->check_metadata($post),
            $this->check_content($post, $extractor),
            $this->check_technical($post)
        );

        $this->save_issues($issues, $post->ID, $post_url, $site_id);

        // Stamp a "last scanned" marker so a clean page (which writes zero issue
        // rows) is still recognised as scanned. Without this, a page that passes
        // every check is indistinguishable from one that was never analysed, and
        // the inventory wrongly reports it as "Not scanned".
        update_post_meta($post->ID, '_nexora_pulse_scanned_at', current_time('mysql'));

        // Invalidate caches.
        delete_transient("nexora_pulse_summary_{$site_id}");
        delete_transient("nexora_pulse_oxygen_{$site_id}");

        return ['post_id' => $post->ID, 'issues_found' => count($issues)];
    }

    public static function on_post_save(int $post_id, WP_Post $post): void
    {
        if (wp_is_post_revision($post_id) || $post->post_status !== 'publish') {
            return;
        }
        if (!in_array($post->post_type, ['post', 'page'], true)) {
            return;
        }
        $instance = new self();
        $instance->analyze_post($post, true);
    }

    // -------------------------------------------------------------------------
    // Checks
    // -------------------------------------------------------------------------

    private function check_metadata(WP_Post $post): array
    {
        $issues = [];
        $title  = get_the_title($post);

        $ncx_seo_data = (array) (get_post_meta($post->ID, '_ncx_seo_data', true) ?: []);
        $meta_title = (string) (
            ($ncx_seo_data['og_title'] ?? '') ?:
            get_post_meta($post->ID, '_nl_meta_title', true) ?:       // Nexora Engine native field
            get_post_meta($post->ID, '_nexora_meta_title', true) ?:
            get_post_meta($post->ID, '_yoast_wpseo_title', true) ?:
            get_post_meta($post->ID, '_aioseo_title', true) ?:
            $title
        );

        // Explicit saved description — checked across all known plugins.
        // Nexora Engine stores its native description in `_nl_meta_description`,
        // so that is checked first; the others cover Yoast / AIOSEO / legacy keys.
        $saved_desc = (string) (
            ($ncx_seo_data['og_desc'] ?? '') ?:
            get_post_meta($post->ID, '_nl_meta_description', true) ?: // Nexora Engine native field
            get_post_meta($post->ID, '_nexora_meta_desc', true) ?:
            get_post_meta($post->ID, '_yoast_wpseo_metadesc', true) ?:
            get_post_meta($post->ID, '_aioseo_description', true) ?:
            ''
        );

        // Nexora Engine auto-generates from excerpt at render time — mirror that fallback
        // so we don't flag pages where Engine is already outputting a description.
        $auto_excerpt = wp_strip_all_tags((string) get_the_excerpt($post));
        $meta_desc    = $saved_desc ?: $auto_excerpt;

        if (empty($meta_desc)) {
            $issues[] = $this->make_issue('metadata', 'missing_meta_desc', 'Missing Meta Description', 'high',
                'This page has no meta description. Nexora Engine will auto-generate one from the post content, but auto-generated descriptions are often too long or irrelevant.',
                'Add a hand-crafted meta description between 120–155 characters using the SEO Meta Editor.'
            );
        } elseif (empty($saved_desc) && !empty($auto_excerpt)) {
            // Engine is outputting an auto-excerpt — this is not ideal but not critical.
            $issues[] = $this->make_issue('metadata', 'auto_generated_desc', 'Meta Description is Auto-Generated', 'medium',
                'No custom meta description is set. Nexora Engine is using the post excerpt automatically, which is often too long or off-topic for search snippets.',
                'Set a focused, hand-written meta description between 120–155 characters using the SEO Meta Editor.'
            );
        } elseif (strlen($meta_desc) > 160) {
            $issues[] = $this->make_issue('metadata', 'meta_desc_too_long', 'Meta Description Too Long', 'medium',
                "Meta description is " . strlen($meta_desc) . " characters. Google truncates at ~155–160.",
                'Shorten your meta description to under 155 characters.'
            );
        } elseif (strlen($meta_desc) < 50) {
            $issues[] = $this->make_issue('metadata', 'meta_desc_too_short', 'Meta Description Too Short', 'low',
                "Meta description is only " . strlen($meta_desc) . " characters.",
                'Expand your meta description to at least 120 characters for better CTR.'
            );
        }

        // Title length.
        if (strlen($meta_title) > 60) {
            $issues[] = $this->make_issue('metadata', 'title_too_long', 'SEO Title Too Long', 'medium',
                "Title is " . strlen($meta_title) . " characters. Google typically shows ~60 characters.",
                'Shorten the title to under 60 characters.'
            );
        }

        // Missing title.
        if (empty(trim($title))) {
            $issues[] = $this->make_issue('metadata', 'missing_title', 'Missing Page Title', 'critical',
                'This page has no title, which severely impacts rankings.',
                'Add a descriptive, keyword-rich title.'
            );
        }

        return $issues;
    }

    private function check_content(WP_Post $post, ContentExtractor $extractor): array
    {
        $issues  = [];

        // Use the universal extractor — works for Elementor, Gutenberg,
        // Divi, WPBakery, Bricks, Beaver Builder, Oxygen, and classic editor.
        $html    = $extractor->get_html($post);
        $text    = wp_strip_all_tags($html);
        $words   = str_word_count($text);

        // Missing featured image.
        if (!has_post_thumbnail($post->ID) && $post->post_type === 'post') {
            $issues[] = $this->make_issue('content', 'missing_featured_image', 'No Featured Image Set', 'medium',
                'Posts without a featured image get lower click-through rates on social media and in Google Discover.',
                'Add a high-quality featured image (at least 1200×630px) to improve social sharing and Discover eligibility.'
            );
        }

        // Thin content.
        if ($words < 300 && $post->post_type === 'post') {
            $issues[] = $this->make_issue('content', 'thin_content', 'Thin Content', 'high',
                "This post has only {$words} words of body content. Thin content rarely ranks in competitive searches and can be passed over for indexing.",
                'Expand the content to at least 600–800 words with depth and unique insights.'
            );
        }

        // H1 check — uses extracted HTML so Elementor headings are correctly parsed.
        $h1_tags = $extractor->get_h1_tags($post);
        $h1_count = count($h1_tags);

        // Also count H1s that might come from the theme title wrapper
        // by checking if the post title itself would render as H1.
        $post_has_title   = !empty(trim(get_the_title($post)));
        $theme_title_as_h1 = $post_has_title; // Standard WordPress themes always wrap post title in <h1>.

        if ($h1_count === 0 && !$theme_title_as_h1) {
            // Truly no H1 anywhere.
            $issues[] = $this->make_issue('content', 'missing_h1', 'Missing H1 Tag', 'high',
                'No H1 heading was found in the page content and the post has no title. Search engines use the H1 as the primary topic signal.',
                'Add a descriptive H1 heading that includes your primary keyword.'
            );
        } elseif ($h1_count > 1) {
            // Multiple H1s inside the builder content — genuine error.
            $issues[] = $this->make_issue('content', 'multiple_h1', 'Multiple H1 Tags', 'medium',
                "Found {$h1_count} H1 tags in the page content. Pages should have exactly one H1.",
                'Keep only one H1 (your page title) and use H2/H3 for all section headings.'
            );
        }

        // Internal links — use extractor so Elementor link widgets are counted.
        $internal_links = $extractor->count_internal_links($post);
        if ($internal_links === 0 && $words > 300 && $post->post_type === 'post') {
            $issues[] = $this->make_issue('content', 'no_internal_links', 'No Internal Links in Content', 'medium',
                'This post has no internal links pointing to other pages on your site. Internal links distribute authority and help visitors discover related content.',
                'Add 2–5 internal links to relevant posts, your category pages, or your most important pages.'
            );
        }

        // Images without alt — use extractor so Elementor image widgets are checked.
        $missing_names = $extractor->get_images_missing_alt($post);
        $missing_alt   = count($missing_names);
        if ($missing_alt > 0) {
            // Show up to 6 filenames inline; collapse the rest into a "+N more" tail.
            $shown   = array_slice($missing_names, 0, 6);
            $remain  = $missing_alt - count($shown);
            $list    = implode(', ', $shown) . ($remain > 0 ? ", +{$remain} more" : '');
            $issues[] = $this->make_issue('content', 'images_missing_alt', 'Images Missing Alt Text', 'medium',
                "{$missing_alt} image(s) are missing alt text, hurting accessibility and image SEO. Affected: {$list}.",
                'Add descriptive alt text to each image listed above. Open the page in the editor, click each image, and fill in the Alt Text field — or set the alt on the attachment in Media Library so it applies everywhere the image is used.'
            );
        }

        return $issues;
    }

    private function check_technical(WP_Post $post): array
    {
        $issues = [];

        // Noindex: check Nexora Pulse key first, then Yoast.
        $noindex = (bool) get_post_meta($post->ID, '_nexora_noindex', true)
            || get_post_meta($post->ID, '_yoast_wpseo_meta-robots-noindex', true) === '1';

        // Noindex check.
        if ($noindex) {
            $issues[] = $this->make_issue('technical', 'noindex', 'Page is Noindexed', 'critical',
                'This page has a noindex directive and will not appear in search results.',
                "Remove the noindex directive if this page should rank in search."
            );
        }

        // Canonical missing or self-referencing — just flag if post has explicit non-canonical.
        $canonical = (string) (
            get_post_meta($post->ID, '_nexora_canonical', true) ?:
            get_post_meta($post->ID, '_yoast_wpseo_canonical', true) ?:
            ''
        );
        if (!empty($canonical)) {
            $permalink = (string) get_permalink($post->ID);
            $canonical_host  = wp_parse_url($canonical, PHP_URL_HOST);
            $permalink_host  = wp_parse_url($permalink, PHP_URL_HOST);
            if ($canonical_host && $canonical_host !== $permalink_host) {
                $issues[] = $this->make_issue('technical', 'cross_domain_canonical', 'Cross-Domain Canonical Tag', 'high',
                    "This page has a canonical pointing to a different domain: {$canonical}",
                    'Ensure the canonical URL points to the correct version of this page.'
                );
            }
        }

        // Slug contains stop words — mild flag.
        $slug       = $post->post_name;
        $stop_words = ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        $slug_parts = explode('-', $slug);
        $stop_count = count(array_intersect($slug_parts, $stop_words));
        if ($stop_count >= 3 && count($slug_parts) <= 6) {
            $issues[] = $this->make_issue('technical', 'slug_stop_words', 'URL Slug Contains Many Stop Words', 'low',
                "The URL slug '{$slug}' contains {$stop_count} stop words, making it unnecessarily long.",
                'Simplify the URL slug to contain only the most important keywords.'
            );
        }

        // Last modified date — very old content flag (2+ years without update).
        $modified_ts = strtotime((string) $post->post_modified);
        $age_days    = (time() - $modified_ts) / DAY_IN_SECONDS;
        if ($age_days > 730 && $post->post_type === 'post') {
            $issues[] = $this->make_issue('content', 'stale_content', 'Content Not Updated in 2+ Years', 'low',
                'This post has not been updated in over 2 years. Google favors fresh, regularly updated content.',
                'Review and refresh this content with current information, updated statistics, and new insights.'
            );
        }

        return $issues;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function make_issue(string $module, string $key, string $title, string $severity, string $explanation, string $recommendation): array
    {
        return compact('module', 'key', 'title', 'severity', 'explanation', 'recommendation');
    }

    private function save_issues(array $issues, int $post_id, string $url, int $site_id): void
    {
        if (empty($issues)) {
            return;
        }

        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_issues';

        $placeholders = [];
        $values       = [];

        foreach ($issues as $issue) {
            $placeholders[] = '(%d, %d, %s, %s, %s, %s, %s, %s, %s, %s)';
            array_push(
                $values,
                $site_id,
                $post_id,
                $url,
                $issue['module'],
                $issue['key'],
                $issue['title'],
                $issue['severity'],
                $issue['explanation'],
                $issue['recommendation'],
                'open'
            );
        }

        // phpcs:disable WordPress.DB.PreparedSQL.NotPrepared
        $sql = $wpdb->prepare(
            "INSERT INTO {$table}
             (site_id, post_id, url, module, issue_key, title, severity, explanation, recommendation, status)
             VALUES " . implode(', ', $placeholders) . "
             ON DUPLICATE KEY UPDATE
               title          = VALUES(title),
               severity       = VALUES(severity),
               explanation    = VALUES(explanation),
               recommendation = VALUES(recommendation),
               status         = IF(status = 'open', 'open', status)",
            $values
        );
        $wpdb->query($sql);
        // phpcs:enable
    }
}
