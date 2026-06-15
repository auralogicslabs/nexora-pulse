<?php
declare(strict_types=1);

namespace NexoraPulse\Services;

use WP_Post;
use WP_Error;

defined('ABSPATH') || exit;

final class AiService
{
    private SettingsService $settings;

    public function __construct()
    {
        $this->settings = new SettingsService();
    }

    public static function get_providers(): array
    {
        return [
            ['id' => 'openai',    'name' => 'OpenAI',    'models' => ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']],
            ['id' => 'anthropic', 'name' => 'Anthropic', 'models' => ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001']],
            ['id' => 'gemini',    'name' => 'Gemini',    'models' => ['gemini-1.5-pro', 'gemini-1.5-flash']],
            ['id' => 'openrouter','name' => 'OpenRouter', 'models' => ['auto']],
        ];
    }

    public function generate(WP_Post $post, string $action_type, int $user_id, int $site_id): array|WP_Error
    {
        $api_key  = $this->settings->get_encrypted('ai_api_key');
        $provider = $this->settings->get('ai_provider', 'openai');
        $model    = $this->settings->get('ai_model', 'gpt-4o-mini');

        if (empty($api_key)) {
            return new WP_Error('no_api_key', __('No AI API key configured. Add one in Settings → Integrations.', 'nexora-pulse'));
        }

        $prompt   = $this->build_prompt($post, $action_type);
        $response = $this->call_provider($provider, $model, $api_key, $prompt);

        if (is_wp_error($response)) {
            return $response;
        }

        $history_id = $this->log_to_history($site_id, $user_id, $post->ID, $action_type, $provider, $prompt, $post, $response);

        return [
            'history_id'  => $history_id,
            'action_type' => $action_type,
            'generated'   => $response,
            'post_id'     => $post->ID,
            'status'      => 'pending',
        ];
    }

    public function approve(int $history_id, int $site_id): array|WP_Error
    {
        global $wpdb;
        $table  = $wpdb->prefix . 'nexora_pulse_ai_history';
        $record = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE id = %d AND site_id = %d AND status = 'pending'",
            $history_id, $site_id
        ));

        if (!$record) {
            return new WP_Error('not_found', __('AI history record not found or already processed.', 'nexora-pulse'));
        }

        $post = get_post((int) $record->post_id);
        if (!$post) {
            return new WP_Error('no_post', __('Post not found.', 'nexora-pulse'));
        }

        $this->apply_to_post($post, $record->action_type, $record->generated);
        $wpdb->update($table, ['status' => 'approved', 'applied_at' => current_time('mysql')], ['id' => $history_id]);

        return ['applied' => true, 'post_id' => $post->ID];
    }

    public function rollback(int $history_id, int $site_id): array|WP_Error
    {
        global $wpdb;
        $table  = $wpdb->prefix . 'nexora_pulse_ai_history';
        $record = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE id = %d AND site_id = %d AND status = 'approved'",
            $history_id, $site_id
        ));

        if (!$record) {
            return new WP_Error('not_found', __('No approved record to roll back.', 'nexora-pulse'));
        }

        $post = get_post((int) $record->post_id);
        if (!$post) {
            return new WP_Error('no_post', __('Post not found.', 'nexora-pulse'));
        }

        $this->apply_to_post($post, $record->action_type, $record->original);
        $wpdb->update($table, ['status' => 'rolled_back'], ['id' => $history_id]);

        return ['rolled_back' => true, 'post_id' => $post->ID];
    }

    private function build_prompt(WP_Post $post, string $action_type): string
    {
        $title   = get_the_title($post);
        $excerpt = wp_trim_words(wp_strip_all_tags($post->post_content), 80);

        return match ($action_type) {
            'meta_description' => "Write an SEO meta description (max 155 characters) for the following article. Output ONLY the description, no quotes or labels.\n\nTitle: {$title}\n\nContent excerpt: {$excerpt}",
            'seo_title'        => "Write an SEO-optimized page title (max 60 characters) for the following article. Output ONLY the title, no quotes or labels.\n\nCurrent title: {$title}\n\nContent excerpt: {$excerpt}",
            'schema'           => "Generate a valid JSON-LD schema markup (Article type) for the following page. Output ONLY valid JSON-LD starting with <script type=\"application/ld+json\">, no explanation.\n\nTitle: {$title}\n\nURL: " . get_permalink($post->ID),
            default            => "Provide an SEO recommendation for: {$title}",
        };
    }

    private function call_provider(string $provider, string $model, string $api_key, string $prompt): string|WP_Error
    {
        return match ($provider) {
            'anthropic'  => $this->call_anthropic($model, $api_key, $prompt),
            'gemini'     => $this->call_gemini($model, $api_key, $prompt),
            'openrouter' => $this->call_openrouter($model, $api_key, $prompt),
            default      => $this->call_openai($model, $api_key, $prompt),
        };
    }

    private function call_openai(string $model, string $api_key, string $prompt): string|WP_Error
    {
        $response = wp_remote_post('https://api.openai.com/v1/chat/completions', [
            'timeout' => 30,
            'headers' => [
                'Authorization' => "Bearer {$api_key}",
                'Content-Type'  => 'application/json',
            ],
            'body' => wp_json_encode([
                'model'    => $model,
                'messages' => [['role' => 'user', 'content' => $prompt]],
                'max_tokens' => 300,
            ]),
        ]);

        return $this->parse_openai_response($response);
    }

    private function call_anthropic(string $model, string $api_key, string $prompt): string|WP_Error
    {
        $response = wp_remote_post('https://api.anthropic.com/v1/messages', [
            'timeout' => 30,
            'headers' => [
                'x-api-key'         => $api_key,
                'anthropic-version' => '2023-06-01',
                'Content-Type'      => 'application/json',
            ],
            'body' => wp_json_encode([
                'model'      => $model,
                'max_tokens' => 300,
                'messages'   => [['role' => 'user', 'content' => $prompt]],
            ]),
        ]);

        if (is_wp_error($response)) {
            return $response;
        }
        $body = json_decode(wp_remote_retrieve_body($response), true);
        return $body['content'][0]['text'] ?? new WP_Error('ai_error', 'Empty Anthropic response.');
    }

    private function call_gemini(string $model, string $api_key, string $prompt): string|WP_Error
    {
        $url      = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$api_key}";
        $response = wp_remote_post($url, [
            'timeout' => 30,
            'headers' => ['Content-Type' => 'application/json'],
            'body'    => wp_json_encode(['contents' => [['parts' => [['text' => $prompt]]]]]),
        ]);

        if (is_wp_error($response)) {
            return $response;
        }
        $body = json_decode(wp_remote_retrieve_body($response), true);
        return $body['candidates'][0]['content']['parts'][0]['text'] ?? new WP_Error('ai_error', 'Empty Gemini response.');
    }

    private function call_openrouter(string $model, string $api_key, string $prompt): string|WP_Error
    {
        $response = wp_remote_post('https://openrouter.ai/api/v1/chat/completions', [
            'timeout' => 30,
            'headers' => [
                'Authorization' => "Bearer {$api_key}",
                'Content-Type'  => 'application/json',
            ],
            'body' => wp_json_encode([
                'model'    => $model === 'auto' ? 'openai/gpt-4o-mini' : $model,
                'messages' => [['role' => 'user', 'content' => $prompt]],
                'max_tokens' => 300,
            ]),
        ]);

        return $this->parse_openai_response($response);
    }

    private function parse_openai_response(mixed $response): string|WP_Error
    {
        if (is_wp_error($response)) {
            return $response;
        }
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!empty($body['error'])) {
            return new WP_Error('ai_error', $body['error']['message'] ?? 'AI API error.');
        }
        return trim($body['choices'][0]['message']['content'] ?? '');
    }

    private function log_to_history(int $site_id, int $user_id, int $post_id, string $action_type, string $provider, string $prompt, WP_Post $post, string $generated): int
    {
        global $wpdb;

        $original = match ($action_type) {
            'meta_description' => $this->read_seo_meta($post_id, 'description'),
            'seo_title'        => $this->read_seo_meta($post_id, 'title') ?: get_the_title($post),
            default            => '',
        };

        $wpdb->insert($wpdb->prefix . 'nexora_pulse_ai_history', [
            'site_id'     => $site_id,
            'user_id'     => $user_id,
            'post_id'     => $post_id,
            'action_type' => $action_type,
            'provider'    => $provider,
            'prompt'      => $prompt,
            'original'    => $original,
            'generated'   => $generated,
            'status'      => 'pending',
        ]);

        return (int) $wpdb->insert_id;
    }

    private function apply_to_post(WP_Post $post, string $action_type, string $content): void
    {
        switch ($action_type) {
            case 'meta_description':
                $this->write_seo_meta($post->ID, 'description', $content);
                break;
            case 'seo_title':
                $this->write_seo_meta($post->ID, 'title', $content);
                break;
            case 'schema':
                update_post_meta($post->ID, '_nexora_pulse_schema', $content);
                break;
        }
    }

    /**
     * Write an SEO title/description to every active SEO plugin's meta key.
     * Writing to each active plugin (not the first that "succeeds") keeps the
     * value correct regardless of which SEO plugin the site uses, and survives
     * a future migration between them. Falls back to Yoast keys if none are
     * detected, since that is the most widely-read convention.
     *
     * @param 'title'|'description' $field
     */
    private function write_seo_meta(int $post_id, string $field, string $content): void
    {
        $keys = [];

        if (defined('WPSEO_VERSION')) {
            $keys[] = $field === 'title' ? '_yoast_wpseo_title' : '_yoast_wpseo_metadesc';
        }
        if (defined('AIOSEO_VERSION')) {
            $keys[] = $field === 'title' ? '_aioseo_title' : '_aioseo_description';
        }
        if (defined('RANK_MATH_VERSION')) {
            $keys[] = $field === 'title' ? 'rank_math_title' : 'rank_math_description';
        }

        // No recognised SEO plugin → default to Yoast keys (most-read fallback).
        if (empty($keys)) {
            $keys[] = $field === 'title' ? '_yoast_wpseo_title' : '_yoast_wpseo_metadesc';
        }

        foreach ($keys as $key) {
            update_post_meta($post_id, $key, $content);
        }
    }

    /**
     * Read the current SEO title/description from the active SEO plugin so we
     * can capture it as the rollback baseline. Checks each known key in order.
     *
     * @param 'title'|'description' $field
     */
    private function read_seo_meta(int $post_id, string $field): string
    {
        $keys = $field === 'title'
            ? ['_yoast_wpseo_title', '_aioseo_title', 'rank_math_title']
            : ['_yoast_wpseo_metadesc', '_aioseo_description', 'rank_math_description'];

        foreach ($keys as $key) {
            $value = (string) get_post_meta($post_id, $key, true);
            if ($value !== '') {
                return $value;
            }
        }
        return '';
    }
}
