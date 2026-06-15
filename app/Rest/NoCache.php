<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

defined('ABSPATH') || exit;

/**
 * Stops page/proxy/browser caches from storing Nexora Pulse REST responses.
 *
 * Why this exists: our admin SPA reads live connection state (GSC connected?
 * PageSpeed key set? scan progress?) over the REST API. Aggressive caches —
 * LiteSpeed Cache, Cloudflare, WP Super Cache, W3 Total Cache, nginx fastcgi —
 * will happily serve a STALE copy of e.g. /gsc/status from before the user
 * connected, so the UI shows "Not connected" until the cache is purged.
 *
 * The user blames the plugin, not the cache. So we defensively mark every one
 * of our namespaced REST responses as uncacheable at every layer we can reach.
 * This is the correct, permanent fix — connection state must never be cached.
 */
final class NoCache
{
    /** Our REST namespace path fragment, e.g. "/wp-json/nexora-pulse/v1/". */
    private const ROUTE_FRAGMENT = '/' . Router::NAMESPACE;

    public static function register(): void
    {
        // rest_pre_serve_request fires right before the JSON is sent, after the
        // route is known — the right moment to stamp headers on our responses
        // only (not the whole site).
        add_filter('rest_pre_serve_request', [self::class, 'maybe_send_headers'], 10, 4);
    }

    /**
     * @param bool              $served  Whether the request has already been served.
     * @param \WP_HTTP_Response $result  The response object.
     * @param \WP_REST_Request  $request The request object.
     * @param \WP_REST_Server   $server  The server instance.
     */
    public static function maybe_send_headers($served, $result, $request, $server)
    {
        // Only touch our own endpoints — never interfere with other plugins'
        // or core REST routes (some of which are legitimately cacheable).
        $route = is_object($request) && method_exists($request, 'get_route')
            ? (string) $request->get_route()
            : '';

        if ($route === '' || strpos($route, self::ROUTE_FRAGMENT) === false) {
            return $served;
        }

        self::send_nocache_headers();
        return $served;
    }

    /**
     * Emit no-cache signals for browsers, proxies, and the common WP page caches.
     * Safe to call once per request; guards against output already started.
     */
    public static function send_nocache_headers(): void
    {
        if (headers_sent()) {
            return;
        }

        // Standard HTTP — covers browsers, Cloudflare, nginx, Varnish, CDNs.
        // `no-store` is the strongest: never write to any cache at all.
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0', true);
        header('Pragma: no-cache', true);
        header('Expires: Wed, 11 Jan 1984 05:00:00 GMT', true);

        // LiteSpeed Cache — both the header it honours and its programmatic hook.
        header('X-LiteSpeed-Cache-Control: no-cache', true);
        if (function_exists('do_action')) {
            // Official LiteSpeed API: force this request to bypass the cache.
            do_action('litespeed_control_set_nocache', 'nexora pulse rest response');
        }

        // Cloudflare/CDN edge cache directive (ignored if not present).
        header('CDN-Cache-Control: no-store', true);

        // Most WP page-cache plugins (WP Super Cache, W3TC, WP Rocket, Cache
        // Enabler, Comet Cache) skip caching when these constants are defined.
        if (!defined('DONOTCACHEPAGE'))   { define('DONOTCACHEPAGE', true); }
        if (!defined('DONOTCACHEOBJECT')) { define('DONOTCACHEOBJECT', true); }
        if (!defined('DONOTCACHEDB'))     { define('DONOTCACHEDB', true); }
    }
}
