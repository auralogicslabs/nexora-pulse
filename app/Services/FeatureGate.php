<?php
declare(strict_types=1);

namespace NexoraPulse\Services;

defined('ABSPATH') || exit;

final class FeatureGate
{
    private const PRO_FEATURES = [
        'ai_generate',
        'ai_bulk',
        'schema_generation',
        'bulk_metadata',
        'auto_redirects',
        'advanced_indexing',
        'topical_clusters',
        'cloud_analysis',
        'agency_dashboard',
    ];

    private string $tier;

    public function __construct()
    {
        $this->tier = (string) (new SettingsService())->get('license_tier', 'free');
    }

    public function is_allowed(string $feature): bool
    {
        if ($this->tier === 'pro') {
            return true;
        }
        return !in_array($feature, self::PRO_FEATURES, true);
    }

    public function get_tier(): string
    {
        return $this->tier;
    }

    public function is_pro(): bool
    {
        return $this->tier === 'pro';
    }

    public static function pro_features(): array
    {
        return self::PRO_FEATURES;
    }
}
