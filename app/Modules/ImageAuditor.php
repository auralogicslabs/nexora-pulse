<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

defined('ABSPATH') || exit;

/**
 * Site-wide image SEO audit — alt coverage, file size warnings, modern format usage.
 * Operates on the WordPress media library + scans rendered post content for inline imgs.
 */
final class ImageAuditor
{
    /** Above this size in bytes we flag as oversize. */
    private const SIZE_WARNING_BYTES = 250 * 1024;   // 250 KB
    /** Above this size we flag as critical. */
    private const SIZE_CRITICAL_BYTES = 1024 * 1024; // 1 MB

    private const MODERN_FORMATS = ['webp', 'avif'];

    public function audit(int $limit = 50): array
    {
        $library_summary  = $this->library_summary();
        $oversize         = $this->find_oversize_images($limit);
        $missing_alt      = $this->find_attachments_missing_alt($limit);
        $legacy_format    = $this->find_legacy_format_images($limit);

        return [
            'summary'      => $library_summary,
            'oversize'     => $oversize,
            'missing_alt'  => $missing_alt,
            'legacy_format' => $legacy_format,
        ];
    }

    private function library_summary(): array
    {
        global $wpdb;

        $total = (int) $wpdb->get_var("
            SELECT COUNT(*) FROM {$wpdb->posts}
            WHERE post_type = 'attachment' AND post_mime_type LIKE 'image/%'
        ");

        if ($total === 0) {
            return [
                'total_images'    => 0,
                'with_alt'        => 0,
                'missing_alt'     => 0,
                'alt_coverage'    => 100,
                'oversize_count'  => 0,
                'modern_format_count' => 0,
                'modern_format_pct' => 0,
            ];
        }

        $with_alt = (int) $wpdb->get_var("
            SELECT COUNT(DISTINCT p.ID)
            FROM {$wpdb->posts} p
            INNER JOIN {$wpdb->postmeta} pm
                ON pm.post_id = p.ID
               AND pm.meta_key = '_wp_attachment_image_alt'
               AND pm.meta_value <> ''
            WHERE p.post_type = 'attachment'
              AND p.post_mime_type LIKE 'image/%'
        ");

        $modern_count = (int) $wpdb->get_var("
            SELECT COUNT(*) FROM {$wpdb->posts}
            WHERE post_type = 'attachment'
              AND (post_mime_type = 'image/webp' OR post_mime_type = 'image/avif')
        ");

        $oversize_count = $this->count_oversize_attachments();

        return [
            'total_images'         => $total,
            'with_alt'             => $with_alt,
            'missing_alt'          => $total - $with_alt,
            'alt_coverage'         => (int) round(($with_alt / $total) * 100),
            'oversize_count'       => $oversize_count,
            'modern_format_count'  => $modern_count,
            'modern_format_pct'    => (int) round(($modern_count / $total) * 100),
        ];
    }

    private function count_oversize_attachments(): int
    {
        // Bytes are stored in _wp_attachment_metadata serialized data.
        // We can't query that efficiently, so fall back to a sampled scan.
        global $wpdb;
        $sampled = (array) $wpdb->get_col("
            SELECT p.ID FROM {$wpdb->posts} p
            WHERE p.post_type = 'attachment' AND p.post_mime_type LIKE 'image/%'
            ORDER BY p.post_date DESC
            LIMIT 200
        ");

        $count = 0;
        foreach ($sampled as $id) {
            $size = $this->get_attachment_filesize((int) $id);
            if ($size > self::SIZE_WARNING_BYTES) {
                $count++;
            }
        }
        // Extrapolate to total.
        $total = (int) $wpdb->get_var("
            SELECT COUNT(*) FROM {$wpdb->posts}
            WHERE post_type = 'attachment' AND post_mime_type LIKE 'image/%'
        ");
        if ($total <= count($sampled)) {
            return $count;
        }
        return (int) round(($count / max(1, count($sampled))) * $total);
    }

    private function find_oversize_images(int $limit): array
    {
        global $wpdb;
        $image_like = $wpdb->esc_like('image/') . '%';
        $ids = (array) $wpdb->get_col($wpdb->prepare("
            SELECT p.ID FROM {$wpdb->posts} p
            WHERE p.post_type = 'attachment' AND p.post_mime_type LIKE %s
            ORDER BY p.post_date DESC
            LIMIT %d
        ", $image_like, $limit * 4)); // over-sample, then filter

        $items = [];
        foreach ($ids as $id) {
            $id   = (int) $id;
            $size = $this->get_attachment_filesize($id);
            if ($size <= self::SIZE_WARNING_BYTES) {
                continue;
            }
            $items[] = $this->describe_attachment($id, [
                'filesize'      => $size,
                'severity'      => $size > self::SIZE_CRITICAL_BYTES ? 'critical' : 'high',
                'recommendation' => __('Compress or resize this image — it slows down page load.', 'nexora-pulse'),
            ]);
            if (count($items) >= $limit) {
                break;
            }
        }

        // Sort largest first.
        usort($items, fn ($a, $b) => ($b['filesize'] ?? 0) <=> ($a['filesize'] ?? 0));
        return $items;
    }

    private function find_attachments_missing_alt(int $limit): array
    {
        global $wpdb;
        $image_like = $wpdb->esc_like('image/') . '%';
        $rows = (array) $wpdb->get_results($wpdb->prepare("
            SELECT p.ID, p.post_title, p.post_date
            FROM {$wpdb->posts} p
            LEFT JOIN {$wpdb->postmeta} pm
                ON pm.post_id = p.ID
               AND pm.meta_key = '_wp_attachment_image_alt'
            WHERE p.post_type = 'attachment'
              AND p.post_mime_type LIKE %s
              AND (pm.meta_value IS NULL OR pm.meta_value = '')
            ORDER BY p.post_date DESC
            LIMIT %d
        ", $image_like, $limit));

        $items = [];
        foreach ($rows as $r) {
            $items[] = $this->describe_attachment((int) $r->ID, [
                'severity'       => 'medium',
                'recommendation' => __('Add descriptive alt text in the Media Library — improves accessibility and image search.', 'nexora-pulse'),
            ]);
        }
        return $items;
    }

    private function find_legacy_format_images(int $limit): array
    {
        global $wpdb;
        $rows = (array) $wpdb->get_results($wpdb->prepare("
            SELECT p.ID, p.post_title, p.post_mime_type, p.post_date
            FROM {$wpdb->posts} p
            WHERE p.post_type = 'attachment'
              AND p.post_mime_type IN ('image/jpeg', 'image/png')
            ORDER BY p.post_date DESC
            LIMIT %d
        ", $limit));

        $items = [];
        foreach ($rows as $r) {
            $items[] = $this->describe_attachment((int) $r->ID, [
                'severity'       => 'low',
                'recommendation' => __('Convert to WebP or AVIF — 25-50% smaller files at same visual quality.', 'nexora-pulse'),
            ]);
        }
        return $items;
    }

    private function describe_attachment(int $id, array $extra = []): array
    {
        $meta  = wp_get_attachment_metadata($id);
        $url   = (string) wp_get_attachment_url($id);
        $title = (string) get_the_title($id);
        $alt   = (string) get_post_meta($id, '_wp_attachment_image_alt', true);
        $mime  = (string) get_post_mime_type($id);
        $size  = $this->get_attachment_filesize($id);
        $width  = (int) ($meta['width']  ?? 0);
        $height = (int) ($meta['height'] ?? 0);

        return array_merge([
            'id'         => $id,
            'title'      => $title,
            'url'        => $url,
            'edit_url'   => get_edit_post_link($id, 'raw'),
            'alt'        => $alt,
            'mime'       => $mime,
            'format'     => $this->mime_to_format($mime),
            'filesize'   => $size,
            'filesize_h' => size_format($size),
            'width'      => $width,
            'height'     => $height,
        ], $extra);
    }

    private function get_attachment_filesize(int $id): int
    {
        $meta = wp_get_attachment_metadata($id);
        if (isset($meta['filesize']) && (int) $meta['filesize'] > 0) {
            return (int) $meta['filesize'];
        }
        $file = get_attached_file($id);
        if ($file && file_exists($file)) {
            return (int) filesize($file);
        }
        return 0;
    }

    private function mime_to_format(string $mime): string
    {
        return match ($mime) {
            'image/jpeg' => 'JPEG',
            'image/png'  => 'PNG',
            'image/webp' => 'WebP',
            'image/avif' => 'AVIF',
            'image/gif'  => 'GIF',
            'image/svg+xml' => 'SVG',
            default      => strtoupper(str_replace('image/', '', $mime)),
        };
    }
}
