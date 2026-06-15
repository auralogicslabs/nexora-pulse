<?php
declare(strict_types=1);

namespace NexoraPulse\Core;

defined('ABSPATH') || exit;

final class Plugin
{
    private static ?self $instance = null;

    public static function boot(): void
    {
        if (self::$instance !== null) {
            return;
        }
        self::$instance = new self();
    }

    private function __construct()
    {
        // No load_plugin_textdomain() call: WordPress.org auto-loads plugin
        // translations since WP 4.6, and loading before init triggers a
        // _doing_it_wrong notice on WP 6.7+.
        $this->maybe_migrate();
        $this->register_services();
    }

    private function maybe_migrate(): void
    {
        $installed = get_option('nexora_pulse_db_version', '');
        if (version_compare($installed, \NexoraPulse\Database\Migrator::DB_VERSION, '<')) {
            \NexoraPulse\Database\Migrator::create_tables();
        }
    }

    private function register_services(): void
    {
        // REST API.
        add_action('rest_api_init', [\NexoraPulse\Rest\Router::class, 'register']);

        // Stop page/proxy caches (LiteSpeed, Cloudflare, WP Super Cache, etc.)
        // from serving stale connection-state responses — otherwise the SPA
        // shows "Not connected" right after a successful connect until the cache
        // is purged, and users (reasonably) blame the plugin.
        \NexoraPulse\Rest\NoCache::register();

        // Admin UI.
        if (is_admin()) {
            \NexoraPulse\Admin\AdminPage::get_instance();
        }

        // Soft redirects via template_redirect (universal – no server config needed).
        add_action('template_redirect', [\NexoraPulse\Modules\Redirects::class, 'maybe_redirect'], 1);

        // 404 monitor — logs unmatched paths so admins can convert to redirects.
        \NexoraPulse\Modules\NotFoundMonitor::register_hooks();

        // Schema JSON-LD in wp_head.
        \NexoraPulse\Modules\SchemaEngine::register_hooks();

        // Social Preview OG/Twitter meta in wp_head.
        \NexoraPulse\Modules\SocialPreview::register_hooks();

        // XML Sitemap at /nexora-sitemap.xml.
        \NexoraPulse\Modules\SitemapEngine::register_hooks();

        // On new multisite blog – provision tables.
        add_action('wp_initialize_site', [\NexoraPulse\Database\Migrator::class, 'on_new_blog']);

        // Cron jobs.
        add_action('nexora_pulse_daily_scan',         [\NexoraPulse\Modules\SeoAnalyzer::class,         'run_background_scan']);
        // GscSync::run() is an instance method, so wrap it in a closure rather
        // than registering a static-style [class, 'run'] callback (which fatals
        // when WP-Cron invokes it).
        add_action('nexora_pulse_gsc_sync', static function (): void {
            (new \NexoraPulse\Modules\GscSync())->run();
        });
        add_action('nexora_pulse_link_scan',          [\NexoraPulse\Modules\LinkEngine::class,           'run_background_scan']);
        add_action('nexora_pulse_similarity_scan',    [\NexoraPulse\Modules\OriginalityEngine::class,    'run_background_scan']);
        add_action('nexora_pulse_index_scan_continue', [\NexoraPulse\Rest\IndexHealthController::class,   'continue_scan']);

        // Content save hooks.
        add_action('save_post', [\NexoraPulse\Modules\SeoAnalyzer::class, 'on_post_save'], 20, 2);
        // Keep the internal link graph current — re-scan the saved post's
        // outgoing links (the batch scanner only covers never-scanned posts).
        add_action('save_post', [\NexoraPulse\Modules\LinkEngine::class, 'on_post_save'], 25, 2);

        // robots.txt filter — append custom rules from settings.
        add_filter('robots_txt', [$this, 'filter_robots_txt'], 10, 2);
    }

    public function filter_robots_txt(string $output, bool $public): string
    {
        if (!$public) {
            return $output;
        }

        // Append Nexora sitemap reference if not already present.
        $sitemap_url = get_home_url() . '/nexora-sitemap.xml';
        if (strpos($output, 'nexora-sitemap.xml') === false) {
            $output .= "\nSitemap: {$sitemap_url}\n";
        }

        $custom = (string) get_option('nexora_pulse_robots_txt', '');
        if (!empty(trim($custom))) {
            $output .= "\n# Custom rules (Nexora Pulse)\n" . $custom . "\n";
        }
        return $output;
    }
}
