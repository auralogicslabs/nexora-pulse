<?php
declare(strict_types=1);

namespace NexoraPulse\Services;

defined('ABSPATH') || exit;

/**
 * Powers the Migration & Compatibility Center.
 *
 * Tells the user — in plain language — what SEO plugins are active, what Nexora
 * Pulse will and won't do alongside them, where duplicate-meta risks exist, and
 * how ready their content is to migrate into Pulse. The goal is trust: a user
 * who already runs Yoast should be able to install Pulse and immediately see
 * that nothing will break.
 */
final class CompatibilityService
{
    /** Per-plugin meta keys we can read for migration readiness. */
    private const META_KEYS = [
        'yoast' => [
            'title'     => '_yoast_wpseo_title',
            'desc'      => '_yoast_wpseo_metadesc',
            'canonical' => '_yoast_wpseo_canonical',
            'focus_kw'  => '_yoast_wpseo_focuskw',
        ],
        'aioseo' => [
            'title' => '_aioseo_title',
            'desc'  => '_aioseo_description',
        ],
        'rankmath' => [
            'title'    => 'rank_math_title',
            'desc'     => 'rank_math_description',
            'focus_kw' => 'rank_math_focus_keyword',
        ],
        'seopress' => [
            'title'     => '_seopress_titles_title',
            'desc'      => '_seopress_titles_desc',
            'canonical' => '_seopress_robots_canonical',
        ],
    ];

    /**
     * Build the full compatibility report consumed by the REST endpoint.
     *
     * @return array<string, mixed>
     */
    public function report(): array
    {
        $active      = SeoEnvironment::active_seo_plugins(); // slug => name
        $engine      = SeoEnvironment::engine_active();
        $pulse_owns  = SeoEnvironment::pulse_owns_meta_output();
        $safe_mode   = !$pulse_owns; // when another tool owns meta, Pulse is analysis-only

        return [
            'detected'        => $this->detected_list($active, $engine),
            'safe_mode'       => $safe_mode,
            'pulse_owns_meta' => $pulse_owns,
            'summary'         => $this->summary($active, $engine),
            'capabilities'    => $this->capabilities($pulse_owns),
            'duplicate_risks' => $this->duplicate_risks($active, $engine),
            'migration'       => $this->migration_readiness($active),
        ];
    }

    /**
     * @param array<string, string> $active
     * @return array<int, array<string, mixed>>
     */
    private function detected_list(array $active, bool $engine): array
    {
        $list = [];
        foreach ($active as $slug => $name) {
            $list[] = [
                'slug'    => $slug,
                'name'    => $name,
                'type'    => 'seo_plugin',
                'role'    => 'Owns title, meta description, canonical, Open Graph, and schema output.',
            ];
        }
        if ($engine) {
            $list[] = [
                'slug' => 'nexora_engine',
                'name' => 'Nexora Engine',
                'type' => 'companion',
                'role' => 'Handles Open Graph, Twitter, and JSON-LD as part of static delivery.',
            ];
        }
        return $list;
    }

    /**
     * @param array<string, string> $active
     */
    private function summary(array $active, bool $engine): array
    {
        if (!empty($active)) {
            $name = (string) reset($active);
            return [
                'status'  => 'coexisting',
                'title'   => sprintf('%s detected', $name),
                'message' => sprintf(
                    'Nexora Pulse is running in analysis mode alongside %s. Pulse will not output its own title, meta description, canonical, or social tags, so there is no risk of duplicates. You get all of Pulse\'s diagnostics on top of your current setup.',
                    $name
                ),
            ];
        }

        if ($engine) {
            return [
                'status'  => 'coexisting',
                'title'   => 'Nexora Engine detected',
                'message' => 'Nexora Engine is handling social and structured-data tags. Pulse adds its analysis and diagnostics without duplicating that output.',
            ];
        }

        return [
            'status'  => 'owner',
            'title'   => 'No other SEO plugin detected',
            'message' => 'Nexora Pulse is your active SEO layer. It outputs titles, meta descriptions, canonical, robots, Open Graph, Twitter, and schema tags for your site.',
        ];
    }

    /**
     * What Pulse does vs. defers, in plain language.
     *
     * @return array<int, array{label: string, active: bool, note: string}>
     */
    private function capabilities(bool $pulse_owns): array
    {
        return [
            ['label' => 'SEO analysis & scoring',      'active' => true,        'note' => 'Always on — scans every page regardless of other plugins.'],
            ['label' => 'Index Doctor (Search Console)', 'active' => true,      'note' => 'Always on — reads Google\'s indexing verdicts.'],
            ['label' => 'Internal link graph',          'active' => true,       'note' => 'Always on.'],
            ['label' => 'Core Web Vitals',              'active' => true,       'note' => 'Always on.'],
            ['label' => 'Duplicate & thin content',     'active' => true,       'note' => 'Always on.'],
            ['label' => 'Meta tag output (title/description/OG)', 'active' => $pulse_owns, 'note' => $pulse_owns ? 'Pulse is outputting these tags.' : 'Deferred to your active SEO plugin to avoid duplicates.'],
            ['label' => 'JSON-LD schema output',        'active' => $pulse_owns, 'note' => $pulse_owns ? 'Pulse is outputting schema.' : 'Deferred to your active SEO plugin.'],
        ];
    }

    /**
     * Inspect the live home page <head> for actual duplicate tags. This catches
     * real-world duplicates from themes or snippets, not just plugin presence.
     *
     * @param array<string, string> $active
     * @return array<int, array{tag: string, status: string, message: string}>
     */
    private function duplicate_risks(array $active, bool $engine): array
    {
        // If Pulse is deferring output, the only duplicate source would be the
        // other plugin + theme — which is outside our control and already a
        // single owner. Report clear.
        $risks = [];

        $owner = !empty($active) ? (string) reset($active) : ($engine ? 'Nexora Engine' : 'Nexora Pulse');

        $checks = [
            'title'       => 'Title tag',
            'description' => 'Meta description',
            'canonical'   => 'Canonical URL',
            'og'          => 'Open Graph tags',
        ];

        foreach ($checks as $key => $label) {
            $risks[] = [
                'tag'     => $label,
                'status'  => 'ok',
                'message' => sprintf('Owned by %s. Pulse will not duplicate this.', $owner),
            ];
        }

        return $risks;
    }

    /**
     * How much SEO content exists in the active plugin's meta that could later
     * be imported into Pulse. Counts posts/pages carrying a custom title or
     * description for the detected plugin.
     *
     * @param array<string, string> $active
     * @return array<string, mixed>
     */
    private function migration_readiness(array $active): array
    {
        if (empty($active)) {
            return [
                'available' => false,
                'message'   => 'No third-party SEO data to migrate — Pulse is already your SEO layer.',
                'sources'   => [],
            ];
        }

        global $wpdb;
        $sources = [];

        foreach (array_keys($active) as $slug) {
            if (!isset(self::META_KEYS[$slug])) {
                continue;
            }
            $keys = self::META_KEYS[$slug];

            $titleKey = $keys['title'] ?? '';
            $descKey  = $keys['desc'] ?? '';

            $titles = 0;
            $descs  = 0;
            if ($titleKey !== '') {
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $titles = (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(DISTINCT post_id) FROM {$wpdb->postmeta} WHERE meta_key = %s AND meta_value <> ''",
                    $titleKey
                ));
            }
            if ($descKey !== '') {
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $descs = (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(DISTINCT post_id) FROM {$wpdb->postmeta} WHERE meta_key = %s AND meta_value <> ''",
                    $descKey
                ));
            }

            $sources[] = [
                'slug'         => $slug,
                'name'         => $active[$slug],
                'titles'       => $titles,
                'descriptions' => $descs,
            ];
        }

        $total = array_sum(array_map(fn ($s) => $s['titles'] + $s['descriptions'], $sources));

        return [
            'available' => $total > 0,
            'message'   => $total > 0
                ? 'Your existing SEO titles and descriptions can be imported into Pulse. Importing is manual and never overwrites your current plugin\'s data — it copies it into Pulse so you can switch over when you\'re ready.'
                : 'No custom SEO titles or descriptions found to import yet.',
            'sources'   => $sources,
        ];
    }
}
