<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

defined('ABSPATH') || exit;

final class Router
{
    public const NAMESPACE = 'nexora-pulse/v1';

    public static function register(): void
    {
        $controllers = [
            new DashboardController(),
            new IssuesController(),
            new AnalyzerController(),
            new LinksController(),
            new OriginalityController(),
            new GscController(),
            new AiController(),
            new SettingsController(),
            new RedirectsController(),
            new ActionsController(),
            new PostsController(),
            new IndexHealthController(),
            new ImagesController(),
            new SetupController(),
        ];

        foreach ($controllers as $controller) {
            $controller->register_routes();
        }
    }
}
