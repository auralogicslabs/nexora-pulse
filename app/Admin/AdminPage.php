<?php
declare(strict_types=1);

namespace NexoraPulse\Admin;

defined('ABSPATH') || exit;

final class AdminPage
{
    private static ?self $instance = null;

    public static function get_instance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct()
    {
        add_action('admin_menu', [$this, 'register_menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('network_admin_menu', [$this, 'register_network_menu']);
        add_action('admin_notices', [$this, 'maybe_show_seo_notice']);
        add_action('wp_ajax_nexora_pulse_dismiss_seo_notice', [$this, 'dismiss_seo_notice']);
        add_action('admin_head', [$this, 'menu_icon_css']);
    }

    /**
     * Trust-building notice: when another SEO plugin is active, tell the user
     * up front that Pulse runs in analysis mode and won't create duplicate tags,
     * with a link to the Compatibility Center. Shown once until dismissed.
     */
    public function maybe_show_seo_notice(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        // Only on Pulse's own screens and the Plugins page — never noise elsewhere.
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        $screen_id = $screen ? (string) $screen->id : '';
        $relevant = $screen_id === 'plugins'
            || strpos($screen_id, 'nexora-pulse') !== false;
        if (!$relevant) {
            return;
        }

        if (get_user_meta(get_current_user_id(), 'nexora_pulse_seo_notice_dismissed', true)) {
            return;
        }

        $name = \NexoraPulse\Services\SeoEnvironment::primary_seo_plugin_name();
        if ($name === '') {
            return;
        }

        $url = admin_url('admin.php?page=nexora-pulse#/compatibility');
        ?>
        <div class="notice notice-info is-dismissible" data-nexora-seo-notice="1">
            <p>
                <strong><?php echo esc_html__('Nexora Pulse', 'nexora-pulse'); ?>:</strong>
                <?php
                /* translators: %s: detected SEO plugin name */
                $notice_template = __('%s is active, so Pulse is running in analysis mode — it will not output its own meta tags and cannot create duplicates.', 'nexora-pulse');
                echo esc_html(sprintf($notice_template, $name));
                ?>
                <a href="<?php echo esc_url($url); ?>"><?php echo esc_html__('View compatibility details', 'nexora-pulse'); ?></a>
            </p>
        </div>
        <script>
        (function(){
            document.addEventListener('click', function(e){
                var n = e.target.closest('[data-nexora-seo-notice] .notice-dismiss');
                if (!n) return;
                var data = new FormData();
                data.append('action', 'nexora_pulse_dismiss_seo_notice');
                data.append('nonce', '<?php echo esc_js(wp_create_nonce('nexora_pulse_seo_notice')); ?>');
                fetch(ajaxurl, { method: 'POST', body: data, credentials: 'same-origin' });
            });
        })();
        </script>
        <?php
    }

    public function dismiss_seo_notice(): void
    {
        check_ajax_referer('nexora_pulse_seo_notice', 'nonce');
        if (current_user_can('manage_options')) {
            update_user_meta(get_current_user_id(), 'nexora_pulse_seo_notice_dismissed', '1');
        }
        wp_die();
    }

    public function register_menu(): void
    {
        add_menu_page(
            __('Nexora Pulse', 'nexora-pulse'),
            __('Nexora Pulse', 'nexora-pulse'),
            'manage_options',
            'nexora-pulse',
            [$this, 'render'],
            $this->get_menu_icon(),
            30
        );

        // Single submenu entry that matches the parent slug to rename "Nexora Pulse" to "Dashboard".
        // All navigation between sections is handled by the React SPA via HashRouter — no separate WP pages.
        add_submenu_page(
            'nexora-pulse',
            __('Dashboard', 'nexora-pulse'),
            __('Dashboard', 'nexora-pulse'),
            'manage_options',
            'nexora-pulse',
            [$this, 'render']
        );
    }

    public function register_network_menu(): void
    {
        if (!is_network_admin()) {
            return;
        }
        add_menu_page(
            __('Nexora Pulse Network', 'nexora-pulse'),
            __('Nexora Pulse', 'nexora-pulse'),
            'manage_network',
            'nexora-pulse-network',
            [$this, 'render'],
            $this->get_menu_icon(),
            30
        );
    }

    public function render(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have permission to access this page.', 'nexora-pulse'));
        }
        // The SPA manages its own layout inside the WP content area.
        // No .wrap class — avoids WP's default max-width and left padding.
        echo '<div id="nexora-pulse-root"></div>';
    }

    public function enqueue_assets(string $hook): void
    {
        if (!str_contains($hook, 'nexora-pulse')) {
            return;
        }

        $dist_url = NEXORA_PULSE_URL . 'assets/dist/';
        $css_file = NEXORA_PULSE_DIR . 'assets/dist/nexora-pulse.css';
        $js_file  = NEXORA_PULSE_DIR . 'assets/dist/nexora-pulse.js';
        $deps     = [];

        // Append file mtime so each new build busts the browser cache, even when
        // the semantic plugin version (e.g. 1.0.0) hasn't changed.
        $version = NEXORA_PULSE_VERSION;
        if (file_exists($js_file)) {
            $version .= '.' . filemtime($js_file);
        }

        // CSS is only emitted separately when Vite splits chunks; in IIFE mode it is
        // injected at runtime by the JS bundle. Only enqueue if the file actually exists.
        if (file_exists($css_file)) {
            wp_enqueue_style(
                'nexora-pulse',
                $dist_url . 'nexora-pulse.css',
                [],
                $version
            );
        }

        wp_enqueue_script(
            'nexora-pulse',
            $dist_url . 'nexora-pulse.js',
            $deps,
            $version,
            true  // load in footer
        );

        // Bridge: pass WP context to React app.
        wp_localize_script('nexora-pulse', 'NexoraPulse', [
            'apiUrl'    => rest_url('nexora-pulse/v1/'),
            'nonce'     => wp_create_nonce('wp_rest'),
            'adminUrl'  => admin_url(),
            'siteUrl'   => get_site_url(),
            'pluginUrl' => NEXORA_PULSE_URL,
            'version'   => NEXORA_PULSE_VERSION,
            // Server-side install signature — used by the frontend to detect a fresh
            // install and force-reset persisted preferences (onboarding wizard etc.)
            // that would otherwise stay in browser localStorage across uninstalls.
            'installId' => (string) get_option('nexora_pulse_install_id', ''),
            'onboardingComplete' => (bool) get_user_meta(get_current_user_id(), 'nexora_pulse_onboarding_complete', true),
            'user'      => [
                'id'    => get_current_user_id(),
                'name'  => wp_get_current_user()->display_name,
                'email' => wp_get_current_user()->user_email,
            ],
            'license'  => (new \NexoraPulse\Services\FeatureGate())->get_tier(),
            'proFeatures' => \NexoraPulse\Services\FeatureGate::pro_features(),
        ]);
    }

    private function get_menu_icon(): string
    {
        // Return 'none' and paint the icon with CSS instead. Passing a large PNG
        // URL here makes some admin themes render it at full size; the CSS
        // background approach guarantees a crisp 20x20 brand mark in the menu.
        return 'none';
    }

    /**
     * Size the Nexora Pulse admin-menu icon to 20x20 via CSS background-image.
     * Hooked on admin_head so it applies on every admin screen.
     */
    public function menu_icon_css(): void
    {
        $icon = esc_url(NEXORA_PULSE_URL . 'assets/img/nexora-icon.png');
        $style = '<style id="nexora-pulse-menu-icon">'
           . '#adminmenu #toplevel_page_nexora-pulse .wp-menu-image{'
           . 'background:url("' . $icon . '") center center no-repeat !important;'
           . 'background-size:20px 20px !important;}'
           . '#adminmenu #toplevel_page_nexora-pulse .wp-menu-image img,'
           . '#adminmenu #toplevel_page_nexora-pulse .wp-menu-image:before{display:none !important;}'
           . '</style>';
        // $icon is escaped with esc_url(); the rest is a static CSS literal.
        echo wp_kses($style, ['style' => ['id' => true]]);
    }
}
