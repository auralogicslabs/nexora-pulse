<?php
declare(strict_types=1);

defined('ABSPATH') || exit;

/**
 * Simple PSR-4 autoloader used when Composer is not available.
 */
spl_autoload_register(static function (string $class): void {
    $prefix = 'NexoraPulse\\';
    $base   = __DIR__ . DIRECTORY_SEPARATOR;

    if (strncmp($prefix, $class, strlen($prefix)) !== 0) {
        return;
    }

    $relative = substr($class, strlen($prefix));
    $file     = $base . str_replace('\\', DIRECTORY_SEPARATOR, $relative) . '.php';

    if (is_file($file)) {
        require_once $file;
    }
});
