<?php
declare(strict_types=1);

namespace NexoraPulse\Services;

defined('ABSPATH') || exit;

/**
 * Single source of truth for detecting other SEO plugins and Nexora Engine.
 *
 * Nexora Pulse must coexist peacefully with the SEO plugin a site already
 * runs. The cardinal rule for wp.org release: never output a duplicate
 * <title>, meta description, canonical, robots, Open Graph, Twitter, or
 * JSON-LD tag. Every meta-emitting module asks this class first.
 *
 * Detection is intentionally conservative — when in doubt, assume another
 * plugin owns the tag and stay silent, because a missing tag is recoverable
 * but a duplicate tag is a visible SEO defect.
 */
final class SeoEnvironment
{
    /**
     * Known SEO plugins, keyed by a stable slug. Each entry lists the
     * constants/classes/functions that prove the plugin is active.
     *
     * @var array<string, array{name: string, constants: string[], classes: string[], functions: string[]}>
     */
    private const PLUGINS = [
        'yoast' => [
            'name'      => 'Yoast SEO',
            'constants' => ['WPSEO_VERSION'],
            'classes'   => ['WPSEO_Options'],
            'functions' => [],
        ],
        'rankmath' => [
            'name'      => 'Rank Math',
            'constants' => ['RANK_MATH_VERSION'],
            'classes'   => ['RankMath'],
            'functions' => [],
        ],
        'aioseo' => [
            'name'      => 'All in One SEO',
            'constants' => ['AIOSEO_VERSION'],
            'classes'   => [],
            'functions' => ['aioseo'],
        ],
        'seopress' => [
            'name'      => 'SEOPress',
            'constants' => ['SEOPRESS_VERSION'],
            'classes'   => [],
            'functions' => ['seopress_get_service'],
        ],
        'squirrly' => [
            'name'      => 'Squirrly SEO',
            'constants' => ['SQ_VERSION'],
            'classes'   => [],
            'functions' => [],
        ],
        'slim_seo' => [
            'name'      => 'Slim SEO',
            'constants' => ['SLIM_SEO_VER'],
            'classes'   => [],
            'functions' => [],
        ],
        'the_seo_framework' => [
            'name'      => 'The SEO Framework',
            'constants' => ['THE_SEO_FRAMEWORK_VERSION'],
            'classes'   => ['The_SEO_Framework\\Load'],
            'functions' => ['the_seo_framework'],
        ],
    ];

    /** @var array<string, string>|null cached active plugins (slug => name) */
    private static ?array $active = null;

    /**
     * Returns active third-party SEO plugins as slug => display name.
     *
     * @return array<string, string>
     */
    public static function active_seo_plugins(): array
    {
        if (self::$active !== null) {
            return self::$active;
        }

        $found = [];
        foreach (self::PLUGINS as $slug => $def) {
            foreach ($def['constants'] as $const) {
                if (defined($const)) {
                    $found[$slug] = $def['name'];
                    continue 2;
                }
            }
            foreach ($def['classes'] as $class) {
                if (class_exists($class)) {
                    $found[$slug] = $def['name'];
                    continue 2;
                }
            }
            foreach ($def['functions'] as $fn) {
                if (function_exists($fn)) {
                    $found[$slug] = $def['name'];
                    continue 2;
                }
            }
        }

        self::$active = $found;
        return $found;
    }

    /**
     * True when ANY third-party SEO plugin is active. When true, Pulse must
     * not output the core meta set (description, canonical, robots, OG,
     * Twitter, JSON-LD) — the active plugin already owns it.
     */
    public static function other_seo_active(): bool
    {
        return !empty(self::active_seo_plugins());
    }

    /**
     * True when Nexora Engine is handling OG/Twitter/JSON-LD itself.
     */
    public static function engine_active(): bool
    {
        return class_exists('NCX_SEO');
    }

    /**
     * The friendly name of the primary active SEO plugin, or '' if none.
     * Used for "Existing SEO plugin detected: Yoast SEO" style notices.
     */
    public static function primary_seo_plugin_name(): string
    {
        $active = self::active_seo_plugins();
        return $active ? (string) reset($active) : '';
    }

    /**
     * Should Pulse emit its own OG / Twitter / JSON-LD / description /
     * canonical block? Only when neither another SEO plugin nor Nexora
     * Engine is already doing it.
     */
    public static function pulse_owns_meta_output(): bool
    {
        return !self::other_seo_active() && !self::engine_active();
    }

    /** Reset the cache — useful in tests or after plugin (de)activation. */
    public static function reset_cache(): void
    {
        self::$active = null;
    }
}
