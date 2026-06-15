<?php
/**
 * Nexora Pulse uninstall cleanup.
 *
 * IMPORTANT: this file is intentionally self-contained. It does NOT load the
 * plugin autoloader or any plugin class, so a missing/partial file or a PHP
 * quirk can never throw a fatal during uninstall. A fatal here would cause
 * WordPress to abort the delete and leave the plugin in an undeletable state,
 * so every operation below is guarded and failure-tolerant.
 */

defined('WP_UNINSTALL_PLUGIN') || exit;

global $wpdb;

// ─── Drop plugin tables ────────────────────────────────────────────
$tables = [
    'nexora_pulse_logs',
    'nexora_pulse_gsc_data',
    'nexora_pulse_issues',
    'nexora_pulse_links',
    'nexora_pulse_redirects',
    'nexora_pulse_similarity',
    'nexora_pulse_ai_history',
    'nexora_pulse_actions',
    'nexora_pulse_credits',
    'nexora_pulse_index_status',
    'nexora_pulse_not_found',
];

foreach ($tables as $table) {
    // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- One-shot uninstall cleanup.
    $wpdb->query("DROP TABLE IF EXISTS `{$wpdb->prefix}{$table}`");
}

// ─── Options & transients (wildcard) ───────────────────────────────
// Covers every option the plugin writes: nexora_pulse_settings, version,
// install_id, db_version, the encrypted credentials (nexora_pulse_enc_*,
// including Google OAuth tokens — the readme promises these are removed),
// mirrored head-tag options (nexora_pulse_verify_*, ga4_id, gtm_id,
// twitter_site), robots.txt rules, and all nexora_pulse_* transients.
// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery -- One-shot uninstall cleanup.
$wpdb->query(
    "DELETE FROM {$wpdb->options}
     WHERE option_name LIKE 'nexora\\_pulse\\_%'
        OR option_name LIKE '\\_transient\\_nexora\\_pulse\\_%'
        OR option_name LIKE '\\_transient\\_timeout\\_nexora\\_pulse\\_%'"
);

// Multisite: the same keys may live in sitemeta (update_site_option()).
if (is_multisite()) {
    $wpdb->query(
        "DELETE FROM {$wpdb->sitemeta}
         WHERE meta_key LIKE 'nexora\\_pulse\\_%'
            OR meta_key LIKE '\\_site\\_transient\\_nexora\\_pulse\\_%'
            OR meta_key LIKE '\\_site\\_transient\\_timeout\\_nexora\\_pulse\\_%'"
    );
}
// phpcs:enable

// ─── Per-user onboarding state (so a reinstall shows the wizard) ────
if (function_exists('delete_metadata')) {
    delete_metadata('user', 0, 'nexora_pulse_onboarding_complete', '', true);
    // Per-post scan timestamps written by the analyzer / link scanner.
    delete_metadata('post', 0, '_nexora_pulse_scanned_at', '', true);
    delete_metadata('post', 0, '_nexora_links_scanned', '', true);
}
// NOTE: per-post SEO content (_nexora_og_*, _nexora_meta_*, _ncx_seo_data) is
// intentionally preserved — it is user-authored content shared with Nexora
// Engine, and deleting it would destroy titles/descriptions on reinstall.
