<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class IssuesController extends BaseController
{
    protected $rest_base = 'issues'; // phpcs:ignore

    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/issues', [
            'methods'             => 'GET',
            'callback'            => [$this, 'list_issues'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'severity' => ['type' => 'string', 'enum' => ['low','medium','high','critical','all'], 'default' => 'all'],
                'module'   => ['type' => 'string', 'default' => ''],
                'status'   => ['type' => 'string', 'enum' => ['open','resolved','ignored','all'], 'default' => 'open'],
                'page'     => ['type' => 'integer', 'minimum' => 1, 'default' => 1],
                'per_page' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100, 'default' => 20],
            ],
        ]);

        register_rest_route($this->namespace, '/issues/(?P<id>[\d]+)', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_issue'],
                'permission_callback' => [$this, 'get_item_permissions_check'],
            ],
            [
                'methods'             => 'PATCH',
                'callback'            => [$this, 'update_issue'],
                'permission_callback' => [$this, 'update_item_permissions_check'],
                'args'                => [
                    'status' => ['type' => 'string', 'enum' => ['open','resolved','ignored'], 'required' => true],
                ],
            ],
        ]);

        register_rest_route($this->namespace, '/issues/bulk', [
            'methods'             => 'POST',
            'callback'            => [$this, 'bulk_update'],
            'permission_callback' => [$this, 'update_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/issues/(?P<id>[\d]+)/fix', [
            'methods'             => 'POST',
            'callback'            => [$this, 'fix_issue'],
            'permission_callback' => [$this, 'update_item_permissions_check'],
        ]);
    }

    public function list_issues(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $site_id  = $this->get_site_id();
        $severity = sanitize_text_field($request->get_param('severity'));
        $module   = sanitize_text_field($request->get_param('module'));
        $status   = sanitize_text_field($request->get_param('status'));
        $page     = (int) $request->get_param('page');
        $per_page = (int) $request->get_param('per_page');
        $offset   = ($page - 1) * $per_page;

        $where   = [$wpdb->prepare('site_id = %d', $site_id)];
        if ($severity !== 'all') {
            $where[] = $wpdb->prepare('severity = %s', $severity);
        }
        if ($module) {
            $where[] = $wpdb->prepare('module = %s', $module);
        }
        if ($status !== 'all') {
            $where[] = $wpdb->prepare('status = %s', $status);
        }

        $where_sql = 'WHERE ' . implode(' AND ', $where);
        $table     = $wpdb->prefix . 'nexora_pulse_issues';

        // phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $total = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table} {$where_sql}");
        $items = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} {$where_sql} ORDER BY severity DESC, detected_at DESC LIMIT %d OFFSET %d",
                $per_page,
                $offset
            )
        );
        // phpcs:enable

        return $this->success([
            'items'       => $items,
            'total'       => $total,
            'page'        => $page,
            'per_page'    => $per_page,
            'total_pages' => (int) ceil($total / $per_page),
        ]);
    }

    public function get_issue(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        global $wpdb;
        $id    = (int) $request->get_param('id');
        $table = $wpdb->prefix . 'nexora_pulse_issues';
        $item  = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id = %d AND site_id = %d", $id, $this->get_site_id()));

        if (!$item) {
            return $this->error('Issue not found.', 404);
        }
        return $this->success($item);
    }

    public function update_issue(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        global $wpdb;
        $id     = (int) $request->get_param('id');
        $status = sanitize_text_field($request->get_param('status'));
        $table  = $wpdb->prefix . 'nexora_pulse_issues';

        $data = ['status' => $status];
        if ($status === 'resolved') {
            $data['resolved_at'] = current_time('mysql');
        }

        $wpdb->update($table, $data, ['id' => $id, 'site_id' => $this->get_site_id()]);
        return $this->success(['updated' => true]);
    }

    public function fix_issue(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        global $wpdb;
        $id    = (int) $request->get_param('id');
        $table = $wpdb->prefix . 'nexora_pulse_issues';
        $item  = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE id = %d AND site_id = %d",
            $id, $this->get_site_id()
        ));

        if (!$item) {
            return $this->error('Issue not found.', 404);
        }

        $result = $this->apply_fix((object) $item);

        if (!$result['success']) {
            return $this->error($result['message'], 422);
        }

        // Mark as resolved.
        $wpdb->update($table, ['status' => 'resolved', 'resolved_at' => current_time('mysql')], ['id' => $id]);

        // Bust caches.
        $site_id = $this->get_site_id();
        delete_transient("nexora_pulse_summary_{$site_id}");
        delete_transient("nexora_pulse_oxygen_{$site_id}");
        delete_transient("nexora_pulse_opportunities_{$site_id}");

        return $this->success(['fixed' => true, 'message' => $result['message']]);
    }

    private function apply_fix(\stdClass $issue): array
    {
        $post_id   = (int) $issue->post_id;
        $issue_key = (string) $issue->issue_key;
        $post      = get_post($post_id);

        if (!$post) {
            return ['success' => false, 'message' => 'Post not found.'];
        }

        switch ($issue_key) {
            case 'missing_meta_desc':
            case 'auto_generated_desc':
                // Generate a clean description from excerpt → trimmed content.
                $excerpt = wp_strip_all_tags((string) get_the_excerpt($post));
                $text    = $excerpt
                    ?: wp_trim_words(wp_strip_all_tags($post->post_content), 35, '');

                if (empty($text)) {
                    return ['success' => false, 'message' => 'No content available to generate a description. Please add one manually via the SEO meta editor.'];
                }

                // Trim to 155 chars at a word boundary.
                $desc = substr($text, 0, 155);
                if (strlen($text) > 155) {
                    $desc = substr($desc, 0, strrpos($desc, ' ')) . '…';
                }
                $desc = trim($desc);

                // Write to Nexora Engine's _ncx_seo_data — this is what appears in <head>.
                $ncx_data = (array) (get_post_meta($post_id, '_ncx_seo_data', true) ?: []);
                $ncx_data['og_desc'] = $desc;
                update_post_meta($post_id, '_ncx_seo_data', $ncx_data);

                // Also write to our own key and Yoast for compatibility.
                update_post_meta($post_id, '_nexora_meta_desc', $desc);
                if (defined('WPSEO_VERSION')) {
                    update_post_meta($post_id, '_yoast_wpseo_metadesc', $desc);
                }

                // Re-analyse so resolved issues are cleared and the page can flip to "Passed".
                (new \NexoraPulse\Modules\SeoAnalyzer())->analyze_post($post, true);

                return ['success' => true, 'message' => "Meta description saved: \"{$desc}\""];

            case 'missing_h1':
                // Can't auto-inject HTML — guide the user.
                return ['success' => false, 'message' => 'H1 tags must be added manually in the editor. Open the post and add a Heading block as the first content block.'];

            case 'images_missing_alt':
                $fixed = 0;

                // 1. Classic / Gutenberg: scan post_content for <img wp-image-N> tags.
                preg_match_all('/<img[^>]+>/i', $post->post_content, $matches);
                foreach ($matches[0] as $img_tag) {
                    if (preg_match('/alt=["\'][^"\']+["\']/i', $img_tag)) {
                        continue;
                    }
                    if (preg_match('/wp-image-(\d+)/i', $img_tag, $id_match)) {
                        $att_id = (int) $id_match[1];
                        $alt    = get_the_title($att_id);
                        if ($alt) {
                            update_post_meta($att_id, '_wp_attachment_image_alt', $alt);
                            $fixed++;
                        }
                    }
                }

                // 2. Elementor: mutate _elementor_data JSON in place so the frontend
                //    renderer picks up the new alts (Elementor does not fall back
                //    to attachment alt on the frontend).
                $elementor_mode = get_post_meta($post_id, '_elementor_edit_mode', true);
                if ($elementor_mode === 'builder') {
                    $raw  = get_post_meta($post_id, '_elementor_data', true);
                    $data = is_string($raw) ? json_decode($raw, true) : $raw;
                    if (is_array($data) && json_last_error() === JSON_ERROR_NONE) {
                        $el_fixed = 0;
                        $data = $this->fix_elementor_alt_inplace($data, $el_fixed);
                        if ($el_fixed > 0) {
                            update_post_meta($post_id, '_elementor_data', wp_slash(wp_json_encode($data)));
                            // Clear Elementor's CSS cache for this post so the rendered HTML is rebuilt.
                            delete_post_meta($post_id, '_elementor_css');
                            delete_post_meta($post_id, '_elementor_inline_svg');
                            if (class_exists('\\Elementor\\Plugin')) {
                                try {
                                    \Elementor\Plugin::instance()->files_manager->clear_cache();
                                } catch (\Throwable $e) {
                                    // Cache clear is best-effort.
                                }
                            }
                            $fixed += $el_fixed;
                        }
                    }
                }

                if ($fixed === 0) {
                    return ['success' => false, 'message' => 'Could not auto-fix alt text. Images may have no attachment ID (external URLs), or their attachment has no title to use as alt. Open the page and add alt text manually.'];
                }

                // Re-analyse so the issue moves to resolved and the page can flip to "Passed".
                (new \NexoraPulse\Modules\SeoAnalyzer())->analyze_post($post, true);

                return ['success' => true, 'message' => "Auto-applied alt text to {$fixed} image(s). Refresh the page on the frontend to verify."];

            case 'noindex':
                // Can't auto-remove noindex — this is intentional in most cases.
                return ['success' => false, 'message' => 'Noindex is likely set intentionally. Remove it manually in your SEO plugin settings for this page if it should be indexed.'];

            case 'thin_content':
                return ['success' => false, 'message' => 'Thin content requires you to expand the post manually. Add more depth, examples, or sections to reach 600+ words.'];

            case 'meta_desc_too_long':
            case 'meta_desc_too_short':
                return ['success' => false, 'message' => 'Open the post and edit the meta description in your SEO plugin to the recommended 120–155 characters.'];

            case 'title_too_long':
                return ['success' => false, 'message' => 'Open the post and shorten the SEO title to under 60 characters in your SEO plugin settings.'];

            case 'multiple_h1':
                return ['success' => false, 'message' => 'Multiple H1 tags must be fixed manually in the editor. Keep only one H1 and convert others to H2/H3.'];

            default:
                return ['success' => false, 'message' => 'This issue type cannot be auto-fixed. Please follow the recommendation to resolve it manually.'];
        }
    }

    private function fix_elementor_alt_inplace(array $elements, int &$fixed): array
    {
        foreach ($elements as $idx => $el) {
            if (!is_array($el)) {
                continue;
            }
            $settings = $el['settings'] ?? [];
            $widget   = $el['widgetType'] ?? '';

            if (in_array($widget, ['image', 'image-box', 'media-carousel'], true)) {
                $att_id  = (int) ($settings['image']['id'] ?? 0);
                $current = trim((string) ($settings['image']['alt'] ?? ''));
                $widget_alt = trim((string) ($settings['image_alt'] ?? ''));
                if ($att_id > 0 && $current === '' && $widget_alt === '') {
                    $title = get_the_title($att_id);
                    if ($title) {
                        // Update WP attachment meta (covers Gutenberg/classic fallback).
                        update_post_meta($att_id, '_wp_attachment_image_alt', $title);
                        // Write the alt directly into Elementor's stored JSON so the
                        // frontend renderer emits alt="..." in the <img> tag.
                        $el['settings']['image']['alt'] = $title;
                        $el['settings']['image_alt']    = $title;
                        $elements[$idx] = $el;
                        $fixed++;
                    }
                }
            }

            if (!empty($el['elements']) && is_array($el['elements'])) {
                $elements[$idx]['elements'] = $this->fix_elementor_alt_inplace($el['elements'], $fixed);
            }
        }
        return $elements;
    }

    public function bulk_update(WP_REST_Request $request): WP_REST_Response
    {
        $ids    = array_map('absint', (array) $request->get_param('ids'));
        $status = sanitize_text_field((string) $request->get_param('status'));

        if (empty($ids) || !in_array($status, ['open', 'resolved', 'ignored'], true)) {
            return $this->error('Invalid request.', 422);
        }

        global $wpdb;
        $table       = $wpdb->prefix . 'nexora_pulse_issues';
        $placeholder = implode(',', array_fill(0, count($ids), '%d'));
        $values      = array_merge([$status], $ids, [$this->get_site_id()]);

        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $wpdb->query($wpdb->prepare("UPDATE {$table} SET status = %s WHERE id IN ({$placeholder}) AND site_id = %d", ...$values));

        return $this->success(['updated' => count($ids)]);
    }
}
