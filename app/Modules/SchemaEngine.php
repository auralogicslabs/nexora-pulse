<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

use NexoraPulse\Services\SeoEnvironment;

defined('ABSPATH') || exit;

/**
 * Injects JSON-LD schema markup into singular post/page heads.
 * Free: Article + BreadcrumbList.
 * Pro: FAQ, HowTo, Product (future).
 */
final class SchemaEngine
{
    public static function register_hooks(): void
    {
        add_action('wp_head', [self::class, 'output_schema'], 5);
    }

    public static function output_schema(): void
    {
        if (!is_singular(['post', 'page'])) {
            return;
        }

        $post    = get_queried_object();
        if (!$post instanceof \WP_Post) {
            return;
        }

        // Defer the Article + BreadcrumbList graph to any active SEO plugin
        // (Yoast, Rank Math, AIOSEO, SEOPress, …) or Nexora Engine — they already
        // emit those, so emitting our own would duplicate structured data. Custom
        // per-post schemas (FAQ, HowTo, etc.) still emit because nothing else
        // handles them.
        $schemas = [];

        if (SeoEnvironment::pulse_owns_meta_output()) {
            $schemas[] = self::build_article($post);
            $schemas[] = self::build_breadcrumb($post);
        }

        // Custom schema stored per-post (set via REST endpoint).
        $custom = (string) get_post_meta($post->ID, '_nexora_schema_custom', true);
        if (!empty($custom)) {
            $decoded = json_decode($custom, true);
            if (is_array($decoded)) {
                $schemas[] = $decoded;
            }
        }

        foreach (array_filter($schemas) as $schema) {
            $json = wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            // Harden against a "</script>" breakout from any user-supplied custom
            // schema value: escape the characters that could terminate the script
            // context as JSON unicode escapes. JSON parsers decode them identically.
            $json = str_replace(
                ['<', '>', '&'],
                ['\u003C', '\u003E', '\u0026'],
                (string) $json
            );
            echo '<script type="application/ld+json">' . "\n" . $json . "\n" . '</script>' . "\n"; // phpcs:ignore
        }
    }

    private static function build_article(\WP_Post $post): array
    {
        $author      = get_userdata($post->post_author);
        $author_name = $author ? $author->display_name : get_bloginfo('name');
        $thumbnail   = get_the_post_thumbnail_url($post->ID, 'large');
        $site_name   = get_bloginfo('name');
        $logo        = self::site_logo_url();

        $schema = [
            '@context' => 'https://schema.org',
            '@type'    => $post->post_type === 'post' ? 'BlogPosting' : 'WebPage',
            'headline' => get_the_title($post->ID),
            'url'      => (string) get_permalink($post->ID),
            'datePublished'  => get_the_date('c', $post),
            'dateModified'   => get_the_modified_date('c', $post),
            'author' => [
                '@type' => 'Person',
                'name'  => $author_name,
            ],
            'publisher' => [
                '@type' => 'Organization',
                'name'  => $site_name,
            ],
            'description' => self::get_description($post),
            'mainEntityOfPage' => [
                '@type' => '@WebPage',
                '@id'   => (string) get_permalink($post->ID),
            ],
        ];

        if ($thumbnail) {
            $schema['image'] = $thumbnail;
        }
        if ($logo) {
            $schema['publisher']['logo'] = ['@type' => 'ImageObject', 'url' => $logo];
        }

        return $schema;
    }

    private static function build_breadcrumb(\WP_Post $post): array
    {
        $items = [];
        $pos   = 1;

        $items[] = [
            '@type'    => 'ListItem',
            'position' => $pos++,
            'name'     => get_bloginfo('name'),
            'item'     => get_home_url(),
        ];

        if ($post->post_type === 'post') {
            $cat = get_the_category($post->ID);
            if (!empty($cat)) {
                $items[] = [
                    '@type'    => 'ListItem',
                    'position' => $pos++,
                    'name'     => $cat[0]->name,
                    'item'     => (string) get_category_link($cat[0]->term_id),
                ];
            }
        }

        $items[] = [
            '@type'    => 'ListItem',
            'position' => $pos,
            'name'     => get_the_title($post->ID),
            'item'     => (string) get_permalink($post->ID),
        ];

        return [
            '@context'        => 'https://schema.org',
            '@type'           => 'BreadcrumbList',
            'itemListElement' => $items,
        ];
    }

    private static function get_description(\WP_Post $post): string
    {
        $desc = (string) get_post_meta($post->ID, '_yoast_wpseo_metadesc', true)
             ?: (string) get_post_meta($post->ID, '_aioseo_description', true)
             ?: $post->post_excerpt;
        return $desc ?: wp_trim_words(wp_strip_all_tags($post->post_content), 30, '');
    }

    private static function site_logo_url(): string
    {
        $logo_id = (int) get_theme_mod('custom_logo');
        if ($logo_id) {
            $src = wp_get_attachment_image_url($logo_id, 'full');
            if ($src) {
                return $src;
            }
        }
        return '';
    }
}
