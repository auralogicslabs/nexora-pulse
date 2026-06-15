<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class PostsController extends BaseController
{
    protected $rest_base = 'posts'; // phpcs:ignore

    public function register_routes(): void
    {
        // Social meta per-post
        register_rest_route($this->namespace, '/posts/(?P<id>[\d]+)/social-meta', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_social_meta'],
                'permission_callback' => [$this, 'get_item_permissions_check'],
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'save_social_meta'],
                'permission_callback' => [$this, 'update_item_permissions_check'],
            ],
        ]);

        // Schema per-post
        register_rest_route($this->namespace, '/posts/(?P<id>[\d]+)/schema', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_schema'],
                'permission_callback' => [$this, 'get_item_permissions_check'],
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'save_schema'],
                'permission_callback' => [$this, 'update_item_permissions_check'],
            ],
        ]);

        // SEO meta per-post (native Nexora SEO title + description)
        register_rest_route($this->namespace, '/posts/(?P<id>[\d]+)/seo-meta', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_seo_meta'],
                'permission_callback' => [$this, 'get_item_permissions_check'],
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'save_seo_meta'],
                'permission_callback' => [$this, 'update_item_permissions_check'],
                'args'                => [
                    'meta_title' => ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field'],
                    'meta_desc'  => ['type' => 'string', 'sanitize_callback' => 'sanitize_textarea_field'],
                    'focus_kw'   => ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field'],
                    'noindex'    => ['type' => 'boolean'],
                ],
            ],
        ]);

        // Search posts for AI / social meta lookups
        register_rest_route($this->namespace, '/posts/search', [
            'methods'             => 'GET',
            'callback'            => [$this, 'search_posts'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'q'        => ['type' => 'string', 'default' => ''],
                'per_page' => ['type' => 'integer', 'default' => 10, 'maximum' => 50],
            ],
        ]);

        // Sitemap preview / regenerate
        register_rest_route($this->namespace, '/sitemap', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_sitemap'],
                'permission_callback' => [$this, 'get_items_permissions_check'],
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'regenerate_sitemap'],
                'permission_callback' => [$this, 'create_item_permissions_check'],
            ],
        ]);

        // OG image upload — receives a base64-encoded PNG from the canvas generator,
        // saves it to the media library, and links it to the given post as og_image.
        register_rest_route($this->namespace, '/posts/(?P<id>[\d]+)/og-image', [
            'methods'             => 'POST',
            'callback'            => [$this, 'save_og_image'],
            'permission_callback' => [$this, 'update_item_permissions_check'],
            'args'                => [
                'image_data' => ['type' => 'string', 'required' => true],
            ],
        ]);
    }

    public function save_og_image(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id    = (int) $request->get_param('id');
        $image_data = (string) $request->get_param('image_data');

        $post = get_post($post_id);
        if (!$post) {
            return $this->error(__('Post not found.', 'nexora-pulse'), 404);
        }

        // Expect "data:image/png;base64,XXX..." — verify the prefix to refuse anything else.
        if (!preg_match('#^data:image/png;base64,(.+)$#i', $image_data, $m)) {
            return $this->error(__('Invalid image data — expected PNG data URI.', 'nexora-pulse'), 422);
        }

        $decoded = base64_decode($m[1], true);
        if ($decoded === false || strlen($decoded) < 100) {
            return $this->error(__('Could not decode image data.', 'nexora-pulse'), 422);
        }

        // 5 MB cap — OG images should be well under this.
        if (strlen($decoded) > 5 * 1024 * 1024) {
            return $this->error(__('Image exceeds the 5 MB size limit.', 'nexora-pulse'), 422);
        }

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $upload_dir = wp_upload_dir();
        if (!empty($upload_dir['error'])) {
            return $this->error((string) $upload_dir['error'], 500);
        }

        $filename = 'og-' . $post_id . '-' . wp_generate_password(6, false, false) . '.png';
        $filepath = trailingslashit($upload_dir['path']) . $filename;

        if (file_put_contents($filepath, $decoded) === false) {
            return $this->error(__('Could not write image to uploads directory.', 'nexora-pulse'), 500);
        }

        $attachment = [
            'post_mime_type' => 'image/png',
            'post_title'     => sprintf(__('OG Image for %s', 'nexora-pulse'), get_the_title($post)),
            'post_content'   => '',
            'post_status'    => 'inherit',
            'post_parent'    => $post_id,
        ];

        $att_id = wp_insert_attachment($attachment, $filepath, $post_id);
        if (is_wp_error($att_id) || $att_id === 0) {
            @unlink($filepath);
            return $this->error(__('Could not create media attachment.', 'nexora-pulse'), 500);
        }

        $meta = wp_generate_attachment_metadata($att_id, $filepath);
        wp_update_attachment_metadata($att_id, $meta);
        update_post_meta($att_id, '_wp_attachment_image_alt', sprintf(__('Open Graph image for %s', 'nexora-pulse'), get_the_title($post)));

        $url = (string) wp_get_attachment_url($att_id);

        // Link as OG image in both Pulse and Nexora Engine meta keys.
        update_post_meta($post_id, '_nexora_og_image', $url);
        $ncx = (array) (get_post_meta($post_id, '_ncx_seo_data', true) ?: []);
        $ncx['og_image'] = $url;
        update_post_meta($post_id, '_ncx_seo_data', $ncx);

        return $this->success([
            'attachment_id' => $att_id,
            'url'           => $url,
        ]);
    }

    public function get_social_meta(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id = (int) $request->get_param('id');
        if (!get_post($post_id)) {
            return $this->error('Post not found.', 404);
        }
        return $this->success(\NexoraPulse\Modules\SocialPreview::get_post_social_meta($post_id));
    }

    public function save_social_meta(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id = (int) $request->get_param('id');
        $data    = $request->get_json_params() ?: $request->get_body_params();

        if (!\NexoraPulse\Modules\SocialPreview::save_post_social_meta($post_id, $data)) {
            return $this->error('Post not found.', 404);
        }

        \NexoraPulse\Services\Logger::info('social', 'Social meta updated', "Post #{$post_id} OG tags saved.");
        return $this->success(['saved' => true]);
    }

    public function get_schema(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id = (int) $request->get_param('id');
        $post    = get_post($post_id);
        if (!$post) {
            return $this->error('Post not found.', 404);
        }

        $custom = (string) get_post_meta($post_id, '_nexora_schema_custom', true);
        return $this->success([
            'post_id'    => $post_id,
            'post_title' => get_the_title($post_id),
            'custom'     => $custom,
            'has_custom' => !empty($custom),
        ]);
    }

    public function save_schema(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id = (int) $request->get_param('id');
        if (!get_post($post_id)) {
            return $this->error('Post not found.', 404);
        }

        $custom = (string) ($request->get_param('custom') ?? '');

        // Validate JSON if provided.
        if (!empty($custom)) {
            $decoded = json_decode($custom, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                return $this->error('Invalid JSON: ' . json_last_error_msg(), 422);
            }
        }

        update_post_meta($post_id, '_nexora_schema_custom', $custom);
        \NexoraPulse\Services\Logger::info('schema', 'Schema updated', "Post #{$post_id} custom schema saved.");
        return $this->success(['saved' => true]);
    }

    public function search_posts(WP_REST_Request $request): WP_REST_Response
    {
        $q        = sanitize_text_field($request->get_param('q'));
        $per_page = (int) $request->get_param('per_page');

        $posts = get_posts([
            'post_type'      => ['post', 'page'],
            'post_status'    => 'publish',
            'posts_per_page' => $per_page,
            's'              => $q,
        ]);

        return $this->success(array_map(function ($p) {
            return [
                'id'        => $p->ID,
                'title'     => get_the_title($p->ID),
                'url'       => get_permalink($p->ID),
                'post_type' => $p->post_type,
            ];
        }, $posts));
    }

    public function get_sitemap(WP_REST_Request $request): WP_REST_Response
    {
        $site_id = $this->get_site_id();
        $xml     = \NexoraPulse\Modules\SitemapEngine::get_xml($site_id);
        $url     = get_home_url() . '/nexora-sitemap.xml';

        // Count entries.
        $count   = substr_count($xml, '<url>');
        return $this->success([
            'url'     => $url,
            'entries' => $count,
            'preview' => substr($xml, 0, 3000),
        ]);
    }

    public function regenerate_sitemap(WP_REST_Request $request): WP_REST_Response
    {
        \NexoraPulse\Modules\SitemapEngine::bust_cache();
        $site_id = $this->get_site_id();
        $xml     = \NexoraPulse\Modules\SitemapEngine::get_xml($site_id);
        $count   = substr_count($xml, '<url>');

        \NexoraPulse\Services\Logger::info('sitemap', 'Sitemap regenerated', "{$count} URLs indexed.");
        return $this->success(['entries' => $count, 'message' => "Sitemap regenerated with {$count} URLs."]);
    }

    public function get_seo_meta(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id = (int) $request->get_param('id');
        $post    = get_post($post_id);
        if (!$post) {
            return $this->error('Post not found.', 404);
        }

        // Read from Nexora Engine (_ncx_seo_data) first, then our own keys, then Yoast/AIOSEO.
        $ncx = (array) (get_post_meta($post_id, '_ncx_seo_data', true) ?: []);

        $meta_title = (string) (
            get_post_meta($post_id, '_nexora_meta_title', true) ?:
            ($ncx['og_title'] ?? '') ?:
            get_post_meta($post_id, '_yoast_wpseo_title', true) ?:
            get_post_meta($post_id, '_aioseo_title', true) ?:
            ''
        );
        $meta_desc = (string) (
            get_post_meta($post_id, '_nexora_meta_desc', true) ?:
            ($ncx['og_desc'] ?? '') ?:
            get_post_meta($post_id, '_yoast_wpseo_metadesc', true) ?:
            get_post_meta($post_id, '_aioseo_description', true) ?:
            ''
        );

        // Whether the description above is an explicitly-saved meta value.
        $has_explicit_desc = $meta_desc !== '';

        // No saved meta description? Show what Google actually uses as a fallback
        // snippet: the post excerpt, else a trimmed slice of the content. This is
        // the "effective description" — the editor should reflect what's live, not
        // claim there's nothing when the page does show a description.
        $effective_desc = $meta_desc;
        if ($effective_desc === '') {
            $excerpt = has_excerpt($post_id)
                ? get_the_excerpt($post)
                : wp_trim_words(wp_strip_all_tags((string) $post->post_content), 30, '');
            $effective_desc = trim((string) $excerpt);
        }

        $focus_kw  = (string) get_post_meta($post_id, '_nexora_focus_kw', true);
        $noindex   = (bool) get_post_meta($post_id, '_nexora_noindex', true);

        return $this->success([
            'post_id'    => $post_id,
            'post_title' => get_the_title($post),
            'post_url'   => get_permalink($post_id),
            'meta_title' => $meta_title,
            // The editable field — only the explicitly-saved value.
            'meta_desc'  => $meta_desc,
            // What the live page actually shows (saved value, or excerpt/content).
            'effective_desc'    => $effective_desc,
            'has_explicit_desc' => $has_explicit_desc,
            'focus_kw'   => $focus_kw,
            'noindex'    => $noindex,
            'word_count' => str_word_count(wp_strip_all_tags($post->post_content)),
            'nexora_engine_active' => class_exists('NCX_SEO'),
        ]);
    }

    public function save_seo_meta(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id = (int) $request->get_param('id');
        if (!get_post($post_id)) {
            return $this->error('Post not found.', 404);
        }

        // Sanitize on input — update_post_meta() stores raw values, so we clean
        // here. Titles/descriptions are plain text; null means "field omitted".
        $meta_title = $request->get_param('meta_title');
        $meta_title = $meta_title !== null ? sanitize_text_field((string) $meta_title) : null;
        $meta_desc  = $request->get_param('meta_desc');
        $meta_desc  = $meta_desc !== null ? sanitize_textarea_field((string) $meta_desc) : null;
        $focus_kw   = $request->get_param('focus_kw');
        $focus_kw   = $focus_kw !== null ? sanitize_text_field((string) $focus_kw) : null;
        $noindex    = $request->get_param('noindex');

        // Always load _ncx_seo_data so we can sync any changed field in one write.
        $ncx = (array) (get_post_meta($post_id, '_ncx_seo_data', true) ?: []);
        $ncx_dirty = false;

        if ($meta_title !== null) {
            update_post_meta($post_id, '_nexora_meta_title', $meta_title);
            $ncx['og_title'] = $meta_title;
            $ncx_dirty = true;
            if (defined('WPSEO_VERSION')) {
                update_post_meta($post_id, '_yoast_wpseo_title', $meta_title);
            }
        }
        if ($meta_desc !== null) {
            update_post_meta($post_id, '_nexora_meta_desc', $meta_desc);
            $ncx['og_desc'] = $meta_desc;
            $ncx_dirty = true;
            if (defined('WPSEO_VERSION')) {
                update_post_meta($post_id, '_yoast_wpseo_metadesc', $meta_desc);
            }
        }
        if ($focus_kw !== null) {
            update_post_meta($post_id, '_nexora_focus_kw', $focus_kw);
            // Sync to Yoast focus keyword field if Yoast is active.
            if (defined('WPSEO_VERSION')) {
                update_post_meta($post_id, '_yoast_wpseo_focuskw', $focus_kw);
            }
        }
        if ($noindex !== null) {
            update_post_meta($post_id, '_nexora_noindex', (int) $noindex);
            $ncx['noindex'] = (int) $noindex;
            $ncx_dirty = true;
        }

        // Persist Engine sync in a single write.
        if ($ncx_dirty) {
            update_post_meta($post_id, '_ncx_seo_data', $ncx);
        }

        // Re-analyze this post to clear any now-resolved issues.
        $post = get_post($post_id);
        if ($post) {
            $analyzer = new \NexoraPulse\Modules\SeoAnalyzer();
            $analyzer->analyze_post($post, true);
        }

        \NexoraPulse\Services\Logger::info('seo', 'SEO meta updated', "Post #{$post_id} SEO meta saved via Nexora Pulse.");
        return $this->success(['saved' => true, 'post_id' => $post_id]);
    }
}
