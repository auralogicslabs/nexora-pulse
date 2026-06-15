<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

use WP_Post;

defined('ABSPATH') || exit;

/**
 * Keyword density + placement checker.
 * Measures focus-keyword presence in title, meta description, H1, first paragraph,
 * URL slug, body, and image alt text — matching Yoast's evaluation surface.
 */
final class KeywordAnalyzer
{
    public function analyze(WP_Post $post, ?string $focus_kw = null): array
    {
        if ($focus_kw === null) {
            $focus_kw = $this->resolve_focus_keyword($post);
        }

        $focus_kw = trim((string) $focus_kw);
        if ($focus_kw === '') {
            return [
                'focus_kw' => '',
                'checks'   => [],
                'density'  => 0.0,
                'message'  => __('Add a focus keyword in the SEO Meta editor to see placement analysis.', 'nexora-pulse'),
            ];
        }

        $extractor = new ContentExtractor();
        $html      = $extractor->get_html($post);
        $text      = wp_strip_all_tags($html);

        $meta_title = $this->resolve_meta_title($post);
        $meta_desc  = $this->resolve_meta_desc($post);
        $slug       = (string) $post->post_name;

        // H1 — prefer extractor, fall back to post title.
        $h1_tags = $extractor->get_h1_tags($post);
        $h1_text = !empty($h1_tags) ? (string) $h1_tags[0] : (string) get_the_title($post);

        // First paragraph (~first 200 chars of plain text).
        $first_para = mb_substr(trim($text), 0, 250);

        // Body density.
        $words      = $this->split_words($text);
        $word_count = count($words);
        $kw_hits    = $this->count_keyword_occurrences($text, $focus_kw);
        $density    = $word_count > 0 ? round(($kw_hits / $word_count) * 100, 2) : 0.0;

        // Image alts.
        preg_match_all('/<img[^>]+alt=["\']([^"\']*)["\']/i', $html, $alt_matches);
        $alts        = $alt_matches[1] ?? [];
        $alt_with_kw = 0;
        foreach ($alts as $a) {
            if ($this->contains_keyword($a, $focus_kw)) {
                $alt_with_kw++;
            }
        }

        $checks = [
            $this->build_check(
                'title',
                __('Focus keyword in SEO title', 'nexora-pulse'),
                $this->contains_keyword($meta_title, $focus_kw),
                __('Add the focus keyword to the SEO title — preferably near the start.', 'nexora-pulse')
            ),
            $this->build_check(
                'meta_desc',
                __('Focus keyword in meta description', 'nexora-pulse'),
                $this->contains_keyword($meta_desc, $focus_kw),
                __('Include the focus keyword in the meta description for stronger SERP signal.', 'nexora-pulse')
            ),
            $this->build_check(
                'h1',
                __('Focus keyword in H1', 'nexora-pulse'),
                $this->contains_keyword($h1_text, $focus_kw),
                __('Use the focus keyword (or a close variant) in the page H1.', 'nexora-pulse')
            ),
            $this->build_check(
                'first_paragraph',
                __('Focus keyword in first paragraph', 'nexora-pulse'),
                $this->contains_keyword($first_para, $focus_kw),
                __('Mention the focus keyword within the first 100 words of the content.', 'nexora-pulse')
            ),
            $this->build_check(
                'url',
                __('Focus keyword in URL slug', 'nexora-pulse'),
                $this->slug_contains_keyword($slug, $focus_kw),
                __('Include the focus keyword (lowercased, hyphenated) in the URL slug.', 'nexora-pulse')
            ),
            $this->build_check(
                'image_alt',
                count($alts) > 0
                    /* translators: %1$d: number of images whose alt text contains the focus keyword; %2$d: total images. */
                    ? sprintf(__('Focus keyword in image alt text (%1$d of %2$d images)', 'nexora-pulse'), $alt_with_kw, count($alts))
                    : __('Focus keyword in image alt text', 'nexora-pulse'),
                count($alts) === 0 ? null : ($alt_with_kw > 0),
                __('Add the focus keyword to at least one image alt text.', 'nexora-pulse')
            ),
            $this->build_density_check($density, $kw_hits, $word_count),
        ];

        return [
            'focus_kw'    => $focus_kw,
            'word_count'  => $word_count,
            'kw_hits'     => $kw_hits,
            'density'     => $density,
            'checks'      => $checks,
        ];
    }

    private function build_check(string $key, string $label, ?bool $pass, string $fix): array
    {
        return [
            'key'     => $key,
            'label'   => $label,
            'status'  => $pass === null ? 'skipped' : ($pass ? 'good' : 'bad'),
            'message' => $pass === null ? __('No images on this page to check.', 'nexora-pulse')
                : ($pass ? __('Looks great.', 'nexora-pulse') : $fix),
        ];
    }

    private function build_density_check(float $density, int $hits, int $words): array
    {
        // Yoast-style ranges: 0.5%–2.5% is healthy.
        $status = 'good';
        $msg    = sprintf(
            /* translators: %1$s density, %2$d hits, %3$d words */
            __('Healthy density at %1$s%% (%2$d hits across %3$d words).', 'nexora-pulse'),
            number_format($density, 2),
            $hits,
            $words
        );

        if ($density < 0.5) {
            $status = 'bad';
            $msg    = sprintf(
                /* translators: %1$s current density, %2$d hits */
                __('Density is only %1$s%% (%2$d mentions). Aim for 0.5%%–2.5%% for clear topical relevance.', 'nexora-pulse'),
                number_format($density, 2),
                $hits
            );
        } elseif ($density > 2.5) {
            $status = 'bad';
            $msg    = sprintf(
                /* translators: %s current density */
                __('Density is %s%% — risk of keyword stuffing. Aim for under 2.5%% and use natural variations.', 'nexora-pulse'),
                number_format($density, 2)
            );
        }

        return [
            'key'     => 'density',
            'label'   => __('Body keyword density', 'nexora-pulse'),
            'status'  => $status,
            'message' => $msg,
        ];
    }

    private function contains_keyword(string $haystack, string $keyword): bool
    {
        if (trim($haystack) === '' || trim($keyword) === '') {
            return false;
        }
        // Loose word-boundary match, case-insensitive, accent-insensitive.
        $haystack = mb_strtolower($this->strip_accents($haystack));
        $keyword  = mb_strtolower($this->strip_accents($keyword));
        return str_contains($haystack, $keyword);
    }

    private function slug_contains_keyword(string $slug, string $keyword): bool
    {
        if ($slug === '' || $keyword === '') {
            return false;
        }
        $slug_norm = strtolower(str_replace(['-', '_'], ' ', $slug));
        $kw_norm   = strtolower(trim($keyword));
        return str_contains($slug_norm, $kw_norm);
    }

    private function count_keyword_occurrences(string $text, string $keyword): int
    {
        if (trim($text) === '' || trim($keyword) === '') {
            return 0;
        }
        $text    = mb_strtolower($this->strip_accents($text));
        $keyword = mb_strtolower($this->strip_accents($keyword));
        return mb_substr_count($text, $keyword);
    }

    private function split_words(string $text): array
    {
        preg_match_all('/[a-zA-Z]+/u', $text, $m);
        return $m[0] ?? [];
    }

    private function strip_accents(string $s): string
    {
        if (function_exists('iconv')) {
            $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
            if ($converted !== false) {
                return $converted;
            }
        }
        return $s;
    }

    private function resolve_focus_keyword(WP_Post $post): string
    {
        $ncx = (array) (get_post_meta($post->ID, '_ncx_seo_data', true) ?: []);
        return (string) (
            ($ncx['focus_kw'] ?? '')
            ?: get_post_meta($post->ID, '_nexora_focus_kw', true)
            ?: get_post_meta($post->ID, '_yoast_wpseo_focuskw', true)
            ?: ''
        );
    }

    private function resolve_meta_title(WP_Post $post): string
    {
        $ncx = (array) (get_post_meta($post->ID, '_ncx_seo_data', true) ?: []);
        return (string) (
            ($ncx['og_title'] ?? '')
            ?: get_post_meta($post->ID, '_nexora_meta_title', true)
            ?: get_post_meta($post->ID, '_yoast_wpseo_title', true)
            ?: get_the_title($post)
        );
    }

    private function resolve_meta_desc(WP_Post $post): string
    {
        $ncx = (array) (get_post_meta($post->ID, '_ncx_seo_data', true) ?: []);
        return (string) (
            ($ncx['og_desc'] ?? '')
            ?: get_post_meta($post->ID, '_nexora_meta_desc', true)
            ?: get_post_meta($post->ID, '_yoast_wpseo_metadesc', true)
            ?: ''
        );
    }
}
