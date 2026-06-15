<?php
/**
 * Plugin Name:       Nexora Pulse – SEO Operations Platform
 * Plugin URI:        https://auralogicslabs.com/products/nexora-pulse
 * Description:       Modern SEO toolkit with Search Console insights, indexing intelligence, schema, internal linking, duplicate content detection, and SEO opportunity analysis.
 * Version:           1.0.0
 * Author:            Auralogics Labs
 * Author URI:        https://auralogicslabs.com
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       nexora-pulse
 * Domain Path:       /languages
 * Requires at least: 6.0
 * Requires PHP:      8.0
 *
 * @package NexoraPulse
 */

declare(strict_types=1);

defined('ABSPATH') || exit;

define('NEXORA_PULSE_VERSION',   '1.0.0');
define('NEXORA_PULSE_FILE',      __FILE__);
define('NEXORA_PULSE_DIR',       plugin_dir_path(__FILE__));
define('NEXORA_PULSE_URL',       plugin_dir_url(__FILE__));
define('NEXORA_PULSE_BASENAME',  plugin_basename(__FILE__));
define('NEXORA_PULSE_NAMESPACE', 'NexoraPulse');

// Autoloader.
if (file_exists(NEXORA_PULSE_DIR . 'vendor/autoload.php')) {
    require_once NEXORA_PULSE_DIR . 'vendor/autoload.php';
} else {
    require_once NEXORA_PULSE_DIR . 'app/autoload.php';
}

register_activation_hook(__FILE__, static function ($network_wide = false): void {
    \NexoraPulse\Database\Migrator::run((bool) $network_wide);
    \NexoraPulse\Core\Scheduler::register();
    // Bust head-scan cache so existing analytics/verification is re-detected.
    delete_transient('nexora_pulse_head_scan');
    // Stamp a unique install ID so the React app can detect fresh installs
    // and reset browser-persisted state (onboarding wizard, etc.).
    if (!get_option('nexora_pulse_install_id')) {
        update_option('nexora_pulse_install_id', wp_generate_uuid4(), false);
    }
});

register_deactivation_hook(__FILE__, static function (): void {
    \NexoraPulse\Core\Scheduler::deregister();
});

// NOTE: uninstall cleanup is handled by the self-contained uninstall.php
// (WordPress prefers that file over register_uninstall_hook). It is kept
// dependency-free on purpose so it can never fatal and block deletion.

add_action('plugins_loaded', static function (): void {
    \NexoraPulse\Core\Plugin::boot();
}, 5);
