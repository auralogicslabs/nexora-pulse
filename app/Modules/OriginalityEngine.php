<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

defined('ABSPATH') || exit;

/**
 * SimHash-based local duplicate content detection.
 * Uses 64-bit SimHash + Hamming Distance to find near-duplicate pages.
 */
final class OriginalityEngine
{
    private const BATCH_SIZE = 30;
    private const SHINGLE_SIZE = 3;

    public function start_background_scan(int $site_id): array
    {
        // Run synchronously — SimHash is fast enough for typical site sizes.
        $this->scan_site($site_id);

        \NexoraPulse\Services\Logger::info(
            'originality',
            'Duplicate scan completed',
            'Content similarity analysis finished.'
        );

        return ['status' => 'done'];
    }

    public static function run_background_scan(): void
    {
        $site_id  = get_current_blog_id();
        $instance = new self();
        $instance->scan_site($site_id);
    }

    private function scan_site(int $site_id): void
    {
        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_similarity';

        $posts = get_posts([
            'post_type'      => ['post', 'page'],
            'post_status'    => 'publish',
            'posts_per_page' => self::BATCH_SIZE,
            'fields'         => 'ids',
        ]);

        if (count($posts) < 2) {
            return;
        }

        // Build SimHash map.
        $hashes = [];
        foreach ($posts as $post_id) {
            $post = get_post($post_id);
            if (!$post) {
                continue;
            }
            $text            = wp_strip_all_tags($post->post_content . ' ' . get_the_title($post));
            $hashes[$post_id] = $this->simhash($text);
        }

        $post_ids = array_keys($hashes);
        $count    = count($post_ids);

        // Clear previous results.
        $wpdb->query($wpdb->prepare("DELETE FROM {$table} WHERE site_id = %d", $site_id));

        for ($i = 0; $i < $count - 1; $i++) {
            for ($j = $i + 1; $j < $count; $j++) {
                $id_a   = $post_ids[$i];
                $id_b   = $post_ids[$j];
                $hash_a = $hashes[$id_a];
                $hash_b = $hashes[$id_b];

                $similarity = $this->hash_similarity($hash_a, $hash_b);

                if ($similarity >= 60.0) {
                    $wpdb->replace($table, [
                        'site_id'    => $site_id,
                        'post_id_a'  => $id_a,
                        'post_id_b'  => $id_b,
                        'similarity' => $similarity,
                        'simhash_a'  => $hash_a,
                        'simhash_b'  => $hash_b,
                    ]);
                }
            }
        }

        delete_transient("nexora_pulse_summary_{$site_id}");
    }

    private function simhash(string $text): string
    {
        $tokens   = $this->tokenize($text);
        $shingles = $this->shingle($tokens, self::SHINGLE_SIZE);

        if (empty($shingles)) {
            return str_repeat('0', 16);
        }

        $vector = array_fill(0, 64, 0);

        foreach ($shingles as $shingle) {
            $hash = $this->hash64($shingle);
            for ($i = 0; $i < 64; $i++) {
                $bit       = ($hash >> $i) & 1;
                $vector[$i] += $bit ? 1 : -1;
            }
        }

        // Build the 64-bit fingerprint one nibble (4 bits) at a time so we never
        // rely on a signed 64-bit int (the top bit would otherwise be lost and
        // every fingerprint would share it, inflating similarity).
        $hex = '';
        for ($nibble = 15; $nibble >= 0; $nibble--) {
            $value = 0;
            for ($b = 0; $b < 4; $b++) {
                $i = $nibble * 4 + $b;
                if ($vector[$i] > 0) {
                    $value |= (1 << $b);
                }
            }
            $hex .= dechex($value);
        }

        return $hex; // exactly 16 hex chars = 64 bits
    }

    private function hash_similarity(string $hash_a, string $hash_b): float
    {
        // Pad/normalise to 16 hex chars so both are exactly 64 bits.
        $hash_a = str_pad(substr($hash_a, 0, 16), 16, '0', STR_PAD_LEFT);
        $hash_b = str_pad(substr($hash_b, 0, 16), 16, '0', STR_PAD_LEFT);

        // Hamming distance, computed one hex digit at a time so we never exceed
        // PHP's integer precision (the old version XOR'd floats and lost bits).
        static $popcount = null;
        if ($popcount === null) {
            $popcount = [];
            for ($n = 0; $n < 16; $n++) {
                $popcount[$n] = substr_count(decbin($n), '1');
            }
        }

        $diffbits = 0;
        for ($i = 0; $i < 16; $i++) {
            $xor       = hexdec($hash_a[$i]) ^ hexdec($hash_b[$i]); // 0–15, safe
            $diffbits += $popcount[$xor];
        }

        return round((1 - ($diffbits / 64)) * 100, 2);
    }

    private function tokenize(string $text): array
    {
        $text   = strtolower($text);
        $text   = preg_replace('/[^a-z0-9\s]+/', ' ', $text);
        $tokens = preg_split('/\s+/', trim($text));
        return array_filter($tokens, fn($t) => strlen($t) > 2);
    }

    private function shingle(array $tokens, int $size): array
    {
        $tokens   = array_values($tokens);
        $shingles = [];
        $count    = count($tokens);
        for ($i = 0; $i <= $count - $size; $i++) {
            $shingles[] = implode(' ', array_slice($tokens, $i, $size));
        }
        return array_unique($shingles);
    }

    private function hash64(string $str): int
    {
        return unpack('J', hash('xxh3', $str, true))[1] ?? crc32($str);
    }
}
