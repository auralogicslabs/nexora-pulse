<?php
declare(strict_types=1);

namespace NexoraPulse\Rest;

use WP_REST_Request;
use WP_REST_Response;

defined('ABSPATH') || exit;

class AnalyzerController extends BaseController
{
    protected $rest_base = 'analyzer'; // phpcs:ignore

    public function register_routes(): void
    {
        register_rest_route($this->namespace, '/analyzer/scan', [
            'methods'             => 'POST',
            'callback'            => [$this, 'start_scan'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/analyzer/scan/(?P<post_id>[\d]+)', [
            'methods'             => 'POST',
            'callback'            => [$this, 'scan_post'],
            'permission_callback' => [$this, 'create_item_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/analyzer/progress', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_progress'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/analyzer/results', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_results'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'page'     => ['type' => 'integer', 'default' => 1],
                'per_page' => ['type' => 'integer', 'default' => 20, 'maximum' => 100],
            ],
        ]);

        register_rest_route($this->namespace, '/analyzer/inventory', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_inventory'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'page'     => ['type' => 'integer', 'default' => 1],
                'per_page' => ['type' => 'integer', 'default' => 30, 'maximum' => 100],
                'filter'   => ['type' => 'string', 'enum' => ['all', 'issues', 'passed'], 'default' => 'all'],
            ],
        ]);

        register_rest_route($this->namespace, '/analyzer/export', [
            'methods'             => 'GET',
            'callback'            => [$this, 'export_csv'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'filter' => ['type' => 'string', 'enum' => ['all', 'issues', 'passed'], 'default' => 'all'],
            ],
        ]);

        register_rest_route($this->namespace, '/analyzer/readability/(?P<post_id>[\d]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_readability'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
        ]);

        register_rest_route($this->namespace, '/analyzer/keyword/(?P<post_id>[\d]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_keyword'],
            'permission_callback' => [$this, 'get_items_permissions_check'],
            'args'                => [
                'focus_kw' => ['type' => 'string', 'default' => ''],
            ],
        ]);
    }

    /**
     * Stream the full SEO report as an Excel-safe CSV.
     *
     * One row per open issue, each prefixed with that page's summary columns.
     * Scanned pages with no open issues appear as a single "No open issues" row
     * so the clean-pages picture is preserved. Pages never scanned are flagged
     * "Not scanned yet". This is NOT a JSON endpoint — it echoes the file and
     * exits, so we authenticate via the REST permission callback (admin only).
     */
    public function export_csv(WP_REST_Request $request)
    {
        global $wpdb;
        $site_id = $this->get_site_id();
        $filter  = sanitize_text_field((string) $request->get_param('filter'));
        $table   = $wpdb->prefix . 'nexora_pulse_issues';

        // All published posts/pages with aggregated open-issue counts + scan state.
        // phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $issue_sub = $wpdb->prepare(
            "SELECT post_id,
             COUNT(*) AS total_count,
             SUM(status='open') AS open_count,
             SUM(status='open' AND severity='critical') AS critical,
             SUM(status='open' AND severity='high')     AS high,
             SUM(status='open' AND severity='medium')   AS medium,
             SUM(status='open' AND severity='low')       AS low
             FROM {$table} WHERE site_id = %d GROUP BY post_id",
            $site_id
        );

        $filter_clause = match ($filter) {
            'issues' => 'HAVING open_count > 0',
            'passed' => 'HAVING total_count > 0 AND open_count = 0',
            default  => '',
        };

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT p.ID AS post_id, p.post_title, p.post_type, p.post_modified,
             COALESCE(i.open_count,0)  AS open_count,
             COALESCE(i.total_count,0) AS total_count,
             COALESCE(i.critical,0)    AS critical,
             COALESCE(i.high,0)        AS high,
             COALESCE(i.medium,0)      AS medium,
             COALESCE(i.low,0)         AS low
             FROM {$wpdb->posts} p
             LEFT JOIN ({$issue_sub}) i ON i.post_id = p.ID
             WHERE p.post_status = 'publish' AND p.post_type IN ('post','page')
             {$filter_clause}
             ORDER BY i.critical DESC, i.high DESC, i.medium DESC, i.low DESC, p.post_title ASC",
            $site_id
        ));
        // phpcs:enable

        // Fetch every open issue for the page set in one query, grouped per post.
        $issues_by_post = [];
        $post_ids = array_map(static fn ($r) => (int) $r->post_id, $rows);
        if (!empty($post_ids)) {
            $placeholders = implode(',', array_fill(0, count($post_ids), '%d'));
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            $all = $wpdb->get_results($wpdb->prepare(
                "SELECT post_id, module, title, severity, explanation, recommendation, detected_at
                 FROM {$table}
                 WHERE site_id = %d AND status = 'open' AND post_id IN ({$placeholders})
                 ORDER BY FIELD(severity,'critical','high','medium','low'), detected_at DESC",
                array_merge([$site_id], $post_ids)
            ));
            foreach ($all as $iss) {
                $issues_by_post[(int) $iss->post_id][] = $iss;
            }
        }

        // ── Stream the file ──────────────────────────────────────────
        $site_name = sanitize_title(get_bloginfo('name')) ?: 'site';
        $filename  = "nexora-seo-report-{$site_name}-" . gmdate('Y-m-d') . '.csv';

        // Discard any buffered output so the CSV is not corrupted.
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        nocache_headers();
        header('Content-Type: text/csv; charset=UTF-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');

        $out = fopen('php://output', 'w');

        // UTF-8 BOM so Excel renders accented characters / emoji correctly.
        fwrite($out, "\xEF\xBB\xBF");

        $headers = [
            'Page Title', 'URL', 'Type', 'Page Status',
            'Open Issues', 'Critical', 'High', 'Medium', 'Low',
            'Issue', 'Severity', 'Area', 'Why It Matters', 'How To Fix', 'Detected',
            'Last Modified',
        ];
        fputcsv($out, $headers);

        foreach ($rows as $row) {
            $pid  = (int) $row->post_id;
            $url  = (string) get_permalink($pid);
            $type = $row->post_type === 'page' ? 'Page' : 'Post';

            $scanned = (int) $row->total_count > 0;
            $open    = (int) $row->open_count;
            $status  = !$scanned ? 'Not scanned yet'
                     : ($open === 0 ? 'Passed — no open issues' : "{$open} open issue" . ($open === 1 ? '' : 's'));

            $summary = [
                (string) $row->post_title,
                $url,
                $type,
                $status,
                $scanned ? (string) $open : '',
                $scanned ? (string) (int) $row->critical : '',
                $scanned ? (string) (int) $row->high : '',
                $scanned ? (string) (int) $row->medium : '',
                $scanned ? (string) (int) $row->low : '',
            ];

            $issues = $issues_by_post[$pid] ?? [];

            if (empty($issues)) {
                // Clean / unscanned page → single summary row, issue columns blank.
                fputcsv($out, array_merge($summary, ['', '', '', '', '', '', (string) $row->post_modified]));
                continue;
            }

            foreach ($issues as $iss) {
                fputcsv($out, array_merge($summary, [
                    (string) $iss->title,
                    ucfirst((string) $iss->severity),
                    ucfirst((string) $iss->module),
                    (string) $iss->explanation,
                    (string) $iss->recommendation,
                    (string) $iss->detected_at,
                    (string) $row->post_modified,
                ]));
            }
        }

        fclose($out);
        exit;
    }

    public function get_keyword(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id  = (int) $request->get_param('post_id');
        $focus_kw = sanitize_text_field((string) $request->get_param('focus_kw'));
        $post     = get_post($post_id);

        if (!$post) {
            return $this->error(__('Post not found.', 'nexora-pulse'), 404);
        }

        $analyzer = new \NexoraPulse\Modules\KeywordAnalyzer();
        $result   = $analyzer->analyze($post, $focus_kw ?: null);
        $result['post_id'] = $post_id;

        return $this->success($result);
    }

    public function get_readability(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id = (int) $request->get_param('post_id');
        $post    = get_post($post_id);

        if (!$post) {
            return $this->error('Post not found.', 404);
        }

        $analyzer = new \NexoraPulse\Modules\ReadabilityAnalyzer();
        $result   = $analyzer->analyze($post);

        $result['post_id']    = $post_id;
        $result['post_title'] = get_the_title($post);

        return $this->success($result);
    }

    public function start_scan(WP_REST_Request $request): WP_REST_Response
    {
        $site_id  = $this->get_site_id();
        $analyzer = new \NexoraPulse\Modules\SeoAnalyzer();
        $result   = $analyzer->start_batch_scan($site_id);

        if (($result['status'] ?? '') !== 'already_running') {
            \NexoraPulse\Services\Logger::info(
                'analyzer',
                'SEO scan started',
                sprintf('Queued %d pages for analysis.', $result['total'] ?? 0)
            );
        }

        return $this->success($result);
    }

    public function scan_post(WP_REST_Request $request): WP_REST_Response|\WP_Error
    {
        $post_id = (int) $request->get_param('post_id');
        $post    = get_post($post_id);

        if (!$post) {
            return $this->error('Post not found.', 404);
        }

        $analyzer = new \NexoraPulse\Modules\SeoAnalyzer();
        $result   = $analyzer->analyze_post($post, true);
        return $this->success($result);
    }

    public function get_progress(WP_REST_Request $request): WP_REST_Response
    {
        $site_id = $this->get_site_id();
        $total   = (int) get_transient("nexora_pulse_scan_total_{$site_id}");
        $done    = (int) get_transient("nexora_pulse_scan_done_{$site_id}");
        $running = (bool) get_transient("nexora_pulse_scan_running_{$site_id}");

        return $this->success([
            'running'  => $running,
            'total'    => $total,
            'done'     => $done,
            'percent'  => $total > 0 ? (int) round($done / $total * 100) : 0,
        ]);
    }

    public function get_inventory(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $site_id  = $this->get_site_id();
        $page     = (int) $request->get_param('page');
        $per_page = (int) $request->get_param('per_page');
        $filter   = sanitize_text_field((string) $request->get_param('filter'));
        $offset   = ($page - 1) * $per_page;
        $table    = $wpdb->prefix . 'nexora_pulse_issues';

        // Get all published posts/pages with their scan status.
        // A page is "passed" ONLY if it has been scanned AND has 0 open issues.
        // Pages that have never been scanned are flagged separately so the UI can
        // show "scan required" instead of misleading the user into thinking
        // unscanned pages are healthy.
        $post_types = "'post','page'";

        // Subquery: total issue count (any status, for "ever scanned" detection) +
        // open issue counts per post.
        // phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $issue_sub = $wpdb->prepare(
            "SELECT post_id,
             COUNT(*) AS total_count,
             SUM(status='open') AS open_count,
             SUM(status='open' AND severity='critical') AS critical,
             SUM(status='open' AND severity='high') AS high,
             SUM(status='open' AND severity='medium') AS medium,
             SUM(status='open' AND severity='low') AS low
             FROM {$table}
             WHERE site_id = %d
             GROUP BY post_id",
            $site_id
        );

        // A page counts as "scanned" if it has issue rows OR a scan-timestamp
        // meta (clean pages write no issue rows, so the meta is what proves they
        // were analysed). `scanned_meta` (a SELECT alias) is 1 when either holds.
        $meta_join = "LEFT JOIN {$wpdb->postmeta} sm
            ON sm.post_id = p.ID AND sm.meta_key = '_nexora_pulse_scanned_at'";
        $scanned_select = '(COALESCE(i.total_count,0) > 0 OR sm.post_id IS NOT NULL)';

        // Filters:
        //   issues — open_count > 0
        //   passed — scanned AND open_count = 0
        //   all    — everything
        // HAVING must reference SELECT aliases (open_count, scanned_meta), not
        // the raw joined columns.
        $filter_clause = match ($filter) {
            'issues' => 'HAVING open_count > 0',
            'passed' => 'HAVING scanned_meta = 1 AND open_count = 0',
            default  => '',
        };

        $count_sql = "SELECT COUNT(*) FROM (
            SELECT p.ID,
                   COALESCE(i.open_count,0)  AS open_count,
                   COALESCE(i.total_count,0) AS total_count,
                   {$scanned_select} AS scanned_meta
            FROM {$wpdb->posts} p
            LEFT JOIN ({$issue_sub}) i ON i.post_id = p.ID
            {$meta_join}
            WHERE p.post_status = 'publish' AND p.post_type IN ({$post_types})
            GROUP BY p.ID
            {$filter_clause}
        ) AS sub";

        $rows_sql = $wpdb->prepare(
            "SELECT p.ID AS post_id, p.post_title, p.post_type, p.post_modified,
             COALESCE(i.open_count,0)  AS open_count,
             COALESCE(i.total_count,0) AS total_count,
             COALESCE(i.critical,0)    AS critical,
             COALESCE(i.high,0)        AS high,
             COALESCE(i.medium,0)      AS medium,
             COALESCE(i.low,0)         AS low,
             {$scanned_select}         AS scanned_meta
             FROM {$wpdb->posts} p
             LEFT JOIN ({$issue_sub}) i ON i.post_id = p.ID
             {$meta_join}
             WHERE p.post_status = 'publish' AND p.post_type IN ({$post_types})
             {$filter_clause}
             ORDER BY i.critical DESC, i.high DESC, i.medium DESC, i.low DESC, p.post_title ASC
             LIMIT %d OFFSET %d",
            $per_page,
            $offset
        );
        // phpcs:enable

        $total = (int) $wpdb->get_var($count_sql);
        $rows  = $wpdb->get_results($rows_sql);

        // Compute site-wide scan state: have we ever scanned anything? Check both
        // the issues table and the scan-timestamp meta, so an all-clean site
        // (zero issues anywhere) still registers as scanned.
        $any_scanned = ((int) $wpdb->get_var(
            $wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE site_id = %d", $site_id)
        ) > 0) || ((int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key = '_nexora_pulse_scanned_at' LIMIT 1"
        ) > 0);

        // Collect post IDs that have open issues so we can fetch them in one query.
        $post_ids_with_issues = array_map(
            fn ($r) => (int) $r->post_id,
            array_filter($rows, fn ($r) => (int) $r->open_count > 0)
        );

        // Fetch all open issues for the current page's posts in a single query.
        $issues_by_post = [];
        if (!empty($post_ids_with_issues)) {
            $placeholders = implode(',', array_fill(0, count($post_ids_with_issues), '%d'));
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            $all_issues = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT * FROM {$table}
                     WHERE site_id = %d AND status = 'open'
                     AND post_id IN ({$placeholders})
                     ORDER BY FIELD(severity,'critical','high','medium','low'), detected_at DESC",
                    array_merge([$site_id], $post_ids_with_issues)
                )
            );
            foreach ($all_issues as $issue) {
                $pid = (int) $issue->post_id;
                if (!isset($issues_by_post[$pid])) {
                    $issues_by_post[$pid] = [];
                }
                $issues_by_post[$pid][] = $issue;
            }
        }

        // Attach permalink, scanned/passed flags, and inline issues to each row.
        // `scanned_meta` (from the query) is true when the page has issue rows OR
        // a scan-timestamp meta — so a clean, scanned page is correctly counted
        // as scanned/passed rather than "Not scanned".
        foreach ($rows as $row) {
            $pid           = (int) $row->post_id;
            $row->url      = (string) get_permalink($pid);
            $row->scanned  = (int) $row->total_count > 0 || (int) $row->scanned_meta === 1;
            $row->passed   = $row->scanned && (int) $row->open_count === 0;
            $row->issues   = $issues_by_post[$pid] ?? [];
        }

        return $this->success([
            'items'       => $rows,
            'total'       => $total,
            'any_scanned' => $any_scanned,
            'page'        => $page,
            'per_page'    => $per_page,
            'total_pages' => (int) ceil($total / max(1, $per_page)),
        ]);
    }

    public function get_results(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;
        $site_id  = $this->get_site_id();
        $page     = (int) $request->get_param('page');
        $per_page = (int) $request->get_param('per_page');
        $offset   = ($page - 1) * $per_page;
        $table    = $wpdb->prefix . 'nexora_pulse_issues';

        $total = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(DISTINCT post_id) FROM {$table} WHERE site_id = %d AND status = 'open'", $site_id));

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT post_id, url, COUNT(*) as issue_count,
             SUM(severity='critical') as critical,
             SUM(severity='high') as high,
             SUM(severity='medium') as medium,
             SUM(severity='low') as low
             FROM {$table}
             WHERE site_id = %d AND status = 'open'
             GROUP BY post_id, url
             ORDER BY critical DESC, high DESC
             LIMIT %d OFFSET %d",
            $site_id, $per_page, $offset
        ));

        return $this->success([
            'items'       => $rows,
            'total'       => $total,
            'page'        => $page,
            'per_page'    => $per_page,
            'total_pages' => (int) ceil($total / $per_page),
        ]);
    }
}
