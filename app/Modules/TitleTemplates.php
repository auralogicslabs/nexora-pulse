<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

use WP_Post;

defined('ABSPATH') || exit;

/**
 * Resolves global title + description templates with placeholder variables.
 *
 * Supported placeholders:
 *   %title%       — post title
 *   %sitename%    — site name (bloginfo)
 *   %tagline%     — site tagline (bloginfo description)
 *   %sep%         — configurable separator (default "—")
 *   %category%    — first category name (posts only)
 *   %author%      — post author display name
 *   %date%        — post date formatted (Y-m-d)
 *   %excerpt%     — first 155 chars of post excerpt or content
 *   %page%        — paginated page number (1, 2, ...)
 *   %currentyear% — current year, useful for "2026 buyer's guide" templates
 */
final class TitleTemplates
{
    private const OPTION_KEY = 'nexora_pulse_title_templates';

    public const DEFAULTS = [
        'post_title'     => '%title% %sep% %sitename%',
        'post_desc'      => '%excerpt%',
        'page_title'     => '%title% %sep% %sitename%',
        'page_desc'      => '%excerpt%',
        'home_title'     => '%sitename% %sep% %tagline%',
        'home_desc'      => '%tagline%',
        'archive_title'  => '%title% archive %sep% %sitename%',
        'archive_desc'   => 'Latest %title% posts from %sitename%.',
        'separator'      => '—',
    ];

    public static function get(): array
    {
        $stored = (array) (get_option(self::OPTION_KEY, []) ?: []);
        return array_merge(self::DEFAULTS, $stored);
    }

    public static function save(array $values): array
    {
        $allowed = array_keys(self::DEFAULTS);
        $filtered = [];
        foreach ($allowed as $key) {
            if (isset($values[$key])) {
                $filtered[$key] = sanitize_text_field((string) $values[$key]);
            }
        }
        update_option(self::OPTION_KEY, $filtered);
        return self::get();
    }

    public static function reset(): array
    {
        delete_option(self::OPTION_KEY);
        return self::DEFAULTS;
    }

    public static function placeholders(): array
    {
        return [
            ['key' => '%title%',       'label' => __('Post / page title', 'nexora-pulse')],
            ['key' => '%sitename%',    'label' => __('Site name', 'nexora-pulse')],
            ['key' => '%tagline%',     'label' => __('Site tagline', 'nexora-pulse')],
            ['key' => '%sep%',         'label' => __('Separator', 'nexora-pulse')],
            ['key' => '%category%',    'label' => __('Primary category (posts)', 'nexora-pulse')],
            ['key' => '%author%',      'label' => __('Author name', 'nexora-pulse')],
            ['key' => '%date%',        'label' => __('Post date (Y-m-d)', 'nexora-pulse')],
            ['key' => '%excerpt%',     'label' => __('Auto excerpt (155 chars)', 'nexora-pulse')],
            ['key' => '%currentyear%', 'label' => __('Current year', 'nexora-pulse')],
            ['key' => '%page%',        'label' => __('Pagination page #', 'nexora-pulse')],
        ];
    }

    /**
     * Resolve a template for a given post, falling back through home/archive when no post.
     */
    public static function resolve(string $template, ?WP_Post $post = null): string
    {
        $sep      = self::get()['separator'] ?? self::DEFAULTS['separator'];
        $sitename = wp_strip_all_tags((string) get_bloginfo('name'));
        $tagline  = wp_strip_all_tags((string) get_bloginfo('description'));
        $year     = gmdate('Y');

        $replacements = [
            '%sitename%'    => $sitename,
            '%tagline%'     => $tagline,
            '%sep%'         => $sep,
            '%currentyear%' => $year,
            '%page%'        => (string) (get_query_var('paged') ?: 1),
        ];

        if ($post instanceof WP_Post) {
            $excerpt = wp_strip_all_tags((string) get_the_excerpt($post));
            if (mb_strlen($excerpt) > 155) {
                $excerpt = mb_substr($excerpt, 0, 152) . '…';
            }

            $cats     = ($post->post_type === 'post') ? get_the_category($post->ID) : [];
            $category = !empty($cats) ? (string) $cats[0]->name : '';

            $author = (string) get_the_author_meta('display_name', (int) $post->post_author);
            $date   = mysql2date('Y-m-d', $post->post_date);

            $replacements = array_merge($replacements, [
                '%title%'    => wp_strip_all_tags((string) get_the_title($post)),
                '%excerpt%'  => $excerpt,
                '%category%' => $category,
                '%author%'   => $author,
                '%date%'     => (string) $date,
            ]);
        }

        $output = strtr($template, $replacements);

        // Collapse any leftover unknown placeholders + extra whitespace + dangling separators.
        $output = preg_replace('/%[a-z_]+%/i', '', $output) ?? $output;
        $output = preg_replace('/\s{2,}/', ' ', $output) ?? $output;
        $output = trim($output, " {$sep}");

        return trim($output);
    }
}
