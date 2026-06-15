<?php
declare(strict_types=1);

namespace NexoraPulse\Database;

defined('ABSPATH') || exit;

final class Migrator
{
    private const DB_VERSION_KEY = 'nexora_pulse_db_version';
    public const  DB_VERSION     = '1.4.0';

    public static function run(bool $network_wide = false): void
    {
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        if ($network_wide && is_multisite()) {
            $sites = get_sites(['number' => 2000, 'fields' => 'ids']);
            foreach ($sites as $site_id) {
                switch_to_blog((int) $site_id);
                self::create_tables();
                restore_current_blog();
            }
        } else {
            self::create_tables();
        }

        self::seed_defaults();
    }

    public static function create_tables(): void
    {
        global $wpdb;

        if (!function_exists('dbDelta')) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        $c = $wpdb->get_charset_collate();
        $p = $wpdb->prefix . 'nexora_pulse_';

        $tables = [

            // Activity & scan logs
            "{$p}logs" => "CREATE TABLE {$p}logs (
                id          BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
                site_id     BIGINT UNSIGNED  NOT NULL DEFAULT 1,
                source      VARCHAR(60)      NOT NULL DEFAULT 'system',
                event_type  VARCHAR(80)      NOT NULL DEFAULT 'log',
                object_type VARCHAR(50)      NOT NULL DEFAULT '',
                object_id   BIGINT UNSIGNED  NOT NULL DEFAULT 0,
                severity    ENUM('info','warning','error','critical') NOT NULL DEFAULT 'info',
                title       VARCHAR(255)     NOT NULL DEFAULT '',
                message     TEXT,
                context_json LONGTEXT,
                created_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY site_source (site_id, source),
                KEY event_type  (event_type),
                KEY created_at  (created_at)
            ) $c",

            // Google Search Console synced data
            "{$p}gsc_data" => "CREATE TABLE {$p}gsc_data (
                id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                site_id       BIGINT UNSIGNED NOT NULL DEFAULT 1,
                url           VARCHAR(2083)   NOT NULL,
                query         VARCHAR(500)    NOT NULL DEFAULT '',
                clicks        INT UNSIGNED    NOT NULL DEFAULT 0,
                impressions   INT UNSIGNED    NOT NULL DEFAULT 0,
                ctr           DECIMAL(6,4)    NOT NULL DEFAULT 0.0000,
                position      DECIMAL(8,2)    NOT NULL DEFAULT 0.00,
                data_date     DATE            NOT NULL,
                synced_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY site_url_query_date (site_id, url(191), query(191), data_date),
                KEY site_id   (site_id),
                KEY data_date (data_date),
                KEY clicks    (clicks)
            ) $c",

            // SEO issues detected per-page
            "{$p}issues" => "CREATE TABLE {$p}issues (
                id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                site_id        BIGINT UNSIGNED NOT NULL DEFAULT 1,
                post_id        BIGINT UNSIGNED NOT NULL DEFAULT 0,
                url            VARCHAR(2083)   NOT NULL DEFAULT '',
                module         VARCHAR(60)     NOT NULL,
                issue_key      VARCHAR(120)    NOT NULL,
                title          VARCHAR(255)    NOT NULL,
                severity       ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low',
                explanation    TEXT,
                recommendation TEXT,
                status         ENUM('open','resolved','ignored') NOT NULL DEFAULT 'open',
                detected_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                resolved_at    DATETIME,
                PRIMARY KEY (id),
                UNIQUE KEY site_post_key (site_id, post_id, issue_key),
                KEY site_post   (site_id, post_id),
                KEY site_module (site_id, module),
                KEY severity    (severity),
                KEY status      (status)
            ) $c",

            // Internal links map
            "{$p}links" => "CREATE TABLE {$p}links (
                id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                site_id     BIGINT UNSIGNED NOT NULL DEFAULT 1,
                source_id   BIGINT UNSIGNED NOT NULL DEFAULT 0,
                target_id   BIGINT UNSIGNED NOT NULL DEFAULT 0,
                source_url  VARCHAR(2083)   NOT NULL DEFAULT '',
                target_url  VARCHAR(2083)   NOT NULL DEFAULT '',
                anchor_text VARCHAR(500)    NOT NULL DEFAULT '',
                is_broken   TINYINT(1)      NOT NULL DEFAULT 0,
                checked_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY site_source (site_id, source_id),
                KEY site_target (site_id, target_id),
                KEY is_broken   (is_broken)
            ) $c",

            // Redirect rules (soft – via template_redirect)
            "{$p}redirects" => "CREATE TABLE {$p}redirects (
                id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                site_id     BIGINT UNSIGNED NOT NULL DEFAULT 1,
                source_url  VARCHAR(2083)   NOT NULL,
                target_url  VARCHAR(2083)   NOT NULL,
                type        SMALLINT UNSIGNED NOT NULL DEFAULT 301,
                hits        INT UNSIGNED    NOT NULL DEFAULT 0,
                is_active   TINYINT(1)      NOT NULL DEFAULT 1,
                created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_hit_at DATETIME,
                PRIMARY KEY (id),
                KEY site_source (site_id, source_url(191)),
                KEY is_active   (is_active)
            ) $c",

            // Content similarity / duplicate detection
            "{$p}similarity" => "CREATE TABLE {$p}similarity (
                id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                site_id     BIGINT UNSIGNED NOT NULL DEFAULT 1,
                post_id_a   BIGINT UNSIGNED NOT NULL,
                post_id_b   BIGINT UNSIGNED NOT NULL,
                similarity  DECIMAL(5,2)    NOT NULL DEFAULT 0.00,
                simhash_a   VARCHAR(64)     NOT NULL DEFAULT '',
                simhash_b   VARCHAR(64)     NOT NULL DEFAULT '',
                detected_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY site_pair (site_id, post_id_a, post_id_b),
                KEY similarity (similarity)
            ) $c",

            // AI actions history (for preview/approval/rollback)
            "{$p}ai_history" => "CREATE TABLE {$p}ai_history (
                id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                site_id      BIGINT UNSIGNED NOT NULL DEFAULT 1,
                user_id      BIGINT UNSIGNED NOT NULL DEFAULT 0,
                post_id      BIGINT UNSIGNED NOT NULL DEFAULT 0,
                action_type  VARCHAR(80)     NOT NULL,
                provider     VARCHAR(60)     NOT NULL DEFAULT 'openai',
                prompt       TEXT,
                original     LONGTEXT,
                `generated`  LONGTEXT,
                status       ENUM('pending','approved','rejected','rolled_back') NOT NULL DEFAULT 'pending',
                applied_at   DATETIME,
                created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY site_post  (site_id, post_id),
                KEY status     (status),
                KEY created_at (created_at)
            ) $c",

            // Bulk / automation actions queue
            "{$p}actions" => "CREATE TABLE {$p}actions (
                id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                site_id     BIGINT UNSIGNED NOT NULL DEFAULT 1,
                action_type VARCHAR(80)     NOT NULL,
                payload     LONGTEXT,
                status      ENUM('queued','running','done','failed') NOT NULL DEFAULT 'queued',
                result      LONGTEXT,
                queued_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                started_at  DATETIME,
                finished_at DATETIME,
                PRIMARY KEY (id),
                KEY site_status (site_id, status),
                KEY queued_at   (queued_at)
            ) $c",

            // 404 Monitor — captures NotFound hits for one-click redirect creation
            "{$p}not_found" => "CREATE TABLE {$p}not_found (
                id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                site_id     BIGINT UNSIGNED NOT NULL DEFAULT 1,
                path        VARCHAR(2083)   NOT NULL,
                referrer    VARCHAR(2083)   NOT NULL DEFAULT '',
                user_agent  VARCHAR(255)    NOT NULL DEFAULT '',
                hit_count   INT UNSIGNED    NOT NULL DEFAULT 1,
                last_seen   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                first_seen  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                status      ENUM('open','redirected','ignored') NOT NULL DEFAULT 'open',
                PRIMARY KEY (id),
                UNIQUE KEY site_path (site_id, path(191)),
                KEY status (status),
                KEY last_seen (last_seen)
            ) $c",

            // Index Doctor — per-URL Google indexing verdict + cross-signal diagnosis
            "{$p}index_status" => "CREATE TABLE {$p}index_status (
                id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                site_id         BIGINT UNSIGNED NOT NULL DEFAULT 1,
                post_id         BIGINT UNSIGNED NOT NULL DEFAULT 0,
                url             VARCHAR(2083)   NOT NULL,
                coverage_state  VARCHAR(80)     NOT NULL DEFAULT 'unknown',
                verdict         VARCHAR(40)     NOT NULL DEFAULT 'unknown',
                robots_txt_state VARCHAR(40)    NOT NULL DEFAULT 'unknown',
                indexing_state  VARCHAR(80)     NOT NULL DEFAULT 'unknown',
                page_fetch_state VARCHAR(40)    NOT NULL DEFAULT 'unknown',
                last_crawl_time DATETIME        NULL,
                google_canonical VARCHAR(2083)  NOT NULL DEFAULT '',
                user_canonical  VARCHAR(2083)   NOT NULL DEFAULT '',
                referring_urls  LONGTEXT        NULL,
                risk_score      TINYINT UNSIGNED NOT NULL DEFAULT 0,
                risk_reasons    LONGTEXT        NULL,
                inspected_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                raw_response    LONGTEXT        NULL,
                PRIMARY KEY (id),
                UNIQUE KEY site_post (site_id, post_id),
                KEY coverage_state (coverage_state),
                KEY verdict (verdict),
                KEY risk_score (risk_score),
                KEY inspected_at (inspected_at)
            ) $c",

            // Credit / usage tracking for AI features
            "{$p}credits" => "CREATE TABLE {$p}credits (
                id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                site_id     BIGINT UNSIGNED NOT NULL DEFAULT 1,
                user_id     BIGINT UNSIGNED NOT NULL DEFAULT 0,
                action      VARCHAR(80)     NOT NULL,
                tokens_used INT UNSIGNED    NOT NULL DEFAULT 0,
                cost_usd    DECIMAL(10,6)   NOT NULL DEFAULT 0.000000,
                created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY site_id    (site_id),
                KEY created_at (created_at)
            ) $c",
        ];

        foreach ($tables as $sql) {
            dbDelta($sql);
        }

        // Clean out previously-logged scanner/verification 404 noise that the
        // expanded exclusion list now filters (one-time on upgrade).
        if (class_exists(\NexoraPulse\Modules\NotFoundMonitor::class)) {
            \NexoraPulse\Modules\NotFoundMonitor::purge_excluded_rows();
        }

        update_option(self::DB_VERSION_KEY, self::DB_VERSION);
    }

    public static function seed_defaults(): void
    {
        if (!get_site_option('nexora_pulse_settings')) {
            update_site_option('nexora_pulse_settings', [
                'license_key'    => '',
                'license_tier'   => 'free',
                'scan_frequency' => 'daily',
                'notify_admin'   => 1,
                'notify_email'   => get_option('admin_email'),
                'ai_provider'    => 'openai',
                'ai_model'       => 'gpt-4o-mini',
            ]);
        }
        update_site_option('nexora_pulse_version', NEXORA_PULSE_VERSION);
    }

    public static function on_new_blog(\WP_Site $new_site): void
    {
        switch_to_blog((int) $new_site->blog_id);
        self::create_tables();
        restore_current_blog();
    }

    public static function uninstall(): void
    {
        global $wpdb;
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
            // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
            $wpdb->query("DROP TABLE IF EXISTS {$wpdb->prefix}{$table}");
        }
        delete_site_option('nexora_pulse_settings');
        delete_site_option('nexora_pulse_version');
        delete_option('nexora_pulse_install_id');
        delete_option('nexora_pulse_db_version');

        // Drop per-user onboarding state so a fresh reinstall shows the wizard.
        delete_metadata('user', 0, 'nexora_pulse_onboarding_complete', '', true);
    }
}
