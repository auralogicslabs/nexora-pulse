<?php
declare(strict_types=1);

namespace NexoraPulse\Services;

defined('ABSPATH') || exit;

final class Logger
{
    public static function info(string $source, string $title, string $message = '', array $context = []): void
    {
        self::write('info', $source, $title, $message, $context);
    }

    public static function warning(string $source, string $title, string $message = '', array $context = []): void
    {
        self::write('warning', $source, $title, $message, $context);
    }

    public static function error(string $source, string $title, string $message = '', array $context = []): void
    {
        self::write('error', $source, $title, $message, $context);
    }

    private static function write(string $severity, string $source, string $title, string $message, array $context): void
    {
        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_logs';
        $wpdb->insert($table, [
            'site_id'      => get_current_blog_id(),
            'source'       => substr($source, 0, 60),
            'event_type'   => 'log',
            'severity'     => $severity,
            'title'        => substr($title, 0, 255),
            'message'      => $message,
            'context_json' => $context ? wp_json_encode($context) : null,
        ]);
    }
}
