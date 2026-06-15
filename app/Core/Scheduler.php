<?php
declare(strict_types=1);

namespace NexoraPulse\Core;

defined('ABSPATH') || exit;

final class Scheduler
{
    private const HOOKS = [
        'nexora_pulse_daily_scan'      => 'daily',
        'nexora_pulse_gsc_sync'        => 'twicedaily',
        'nexora_pulse_link_scan'       => 'daily',
        'nexora_pulse_similarity_scan' => 'weekly',
    ];

    public static function register(): void
    {
        add_filter('cron_schedules', [self::class, 'add_schedules']);

        foreach (self::HOOKS as $hook => $recurrence) {
            if (!wp_next_scheduled($hook)) {
                wp_schedule_event(time() + 300, $recurrence, $hook);
            }
        }
    }

    public static function deregister(): void
    {
        foreach (array_keys(self::HOOKS) as $hook) {
            wp_clear_scheduled_hook($hook);
        }
    }

    public static function add_schedules(array $schedules): array
    {
        if (empty($schedules['weekly'])) {
            $schedules['weekly'] = [
                'interval' => WEEK_IN_SECONDS,
                'display'  => __('Once Weekly', 'nexora-pulse'),
            ];
        }
        return $schedules;
    }
}
