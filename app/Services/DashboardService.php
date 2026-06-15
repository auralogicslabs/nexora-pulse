<?php
declare(strict_types=1);

namespace NexoraPulse\Services;

defined('ABSPATH') || exit;

final class DashboardService
{
    public function get_summary(int $site_id): array
    {
        $cache_key = "nexora_pulse_summary_{$site_id}";
        $cached    = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        global $wpdb;

        $issues_table = $wpdb->prefix . 'nexora_pulse_issues';
        $links_table  = $wpdb->prefix . 'nexora_pulse_links';
        $gsc_table    = $wpdb->prefix . 'nexora_pulse_gsc_data';
        $sim_table    = $wpdb->prefix . 'nexora_pulse_similarity';

        // Issues by severity.
        $issue_counts = $wpdb->get_results($wpdb->prepare(
            "SELECT severity, COUNT(*) as count FROM {$issues_table} WHERE site_id = %d AND status = 'open' GROUP BY severity",
            $site_id
        ), OBJECT_K);

        // Orphan pages.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.NoCaching
        $all_posts = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_status = 'publish' AND post_type IN ('post','page')"
        );
        $linked_posts = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(DISTINCT target_id) FROM {$links_table} WHERE site_id = %d AND target_id > 0",
            $site_id
        ));

        // Broken links.
        $broken_links = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$links_table} WHERE site_id = %d AND is_broken = 1",
            $site_id
        ));

        // GSC summary (last 28 days).
        $since = gmdate('Y-m-d', strtotime('-28 days'));
        $gsc   = $wpdb->get_row($wpdb->prepare(
            "SELECT SUM(clicks) as clicks, SUM(impressions) as impressions, AVG(ctr) as avg_ctr, AVG(position) as avg_position FROM {$gsc_table} WHERE site_id = %d AND data_date >= %s",
            $site_id, $since
        ));

        // Duplicate pairs above 70% — only count pairs where BOTH posts are
        // still published. Stale pairs referencing drafted/deleted posts must
        // not inflate the count (that misleads the user about real duplicates).
        $duplicates = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$sim_table} s
             INNER JOIN {$wpdb->posts} pa ON pa.ID = s.post_id_a AND pa.post_status = 'publish'
             INNER JOIN {$wpdb->posts} pb ON pb.ID = s.post_id_b AND pb.post_status = 'publish'
             WHERE s.site_id = %d AND s.similarity >= 70",
            $site_id
        ));

        $summary = [
            'total_posts'    => $all_posts,
            'orphan_pages'   => max(0, $all_posts - $linked_posts),
            'broken_links'   => $broken_links,
            'duplicate_pairs'=> $duplicates,
            'issues'         => [
                'critical' => (int) ($issue_counts['critical']->count ?? 0),
                'high'     => (int) ($issue_counts['high']->count ?? 0),
                'medium'   => (int) ($issue_counts['medium']->count ?? 0),
                'low'      => (int) ($issue_counts['low']->count ?? 0),
            ],
            'gsc' => [
                'clicks'       => (int) ($gsc->clicks ?? 0),
                'impressions'  => (int) ($gsc->impressions ?? 0),
                'avg_ctr'      => round((float) ($gsc->avg_ctr ?? 0) * 100, 2),
                'avg_position' => round((float) ($gsc->avg_position ?? 0), 1),
                'connected'    => !empty((new SettingsService())->get('gsc_connected')),
            ],
        ];

        set_transient($cache_key, $summary, 5 * MINUTE_IN_SECONDS);
        return $summary;
    }

    public function get_oxygen_score(int $site_id): array
    {
        $cache_key = "nexora_pulse_oxygen_{$site_id}";
        $cached    = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        $summary = $this->get_summary($site_id);
        $total   = max(1, $summary['total_posts']);

        // Component scores (0-100 each).
        $technical = $this->score_technical($summary, $total);
        $indexing  = $this->score_indexing($summary, $total);
        $authority = $this->score_authority($summary, $total);
        $content   = $this->score_content($summary, $total);

        $composite = (int) round(
            ($technical * 0.30) +
            ($indexing  * 0.25) +
            ($authority * 0.25) +
            ($content   * 0.20)
        );

        $result = [
            'score'      => $composite,
            'grade'      => $this->score_to_grade($composite),
            'components' => [
                'technical' => $technical,
                'indexing'  => $indexing,
                'authority' => $authority,
                'content'   => $content,
            ],
        ];

        set_transient($cache_key, $result, 10 * MINUTE_IN_SECONDS);
        return $result;
    }

    public function get_recent_logs(int $site_id, int $limit): array
    {
        global $wpdb;
        $table = $wpdb->prefix . 'nexora_pulse_logs';
        return (array) $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} WHERE site_id = %d ORDER BY created_at DESC LIMIT %d",
            $site_id, $limit
        ));
    }

    private function score_technical(array $s, int $total): int
    {
        $critical = $s['issues']['critical'];
        $high     = $s['issues']['high'];
        $penalty  = min(100, ($critical * 10 + $high * 5));
        return max(0, 100 - $penalty);
    }

    private function score_indexing(array $s, int $total): int
    {
        $orphan_ratio = $total > 0 ? ($s['orphan_pages'] / $total) : 0;
        return (int) round(max(0, 100 - ($orphan_ratio * 100)));
    }

    private function score_authority(array $s, int $total): int
    {
        $broken_ratio = $total > 0 ? ($s['broken_links'] / max(1, $total)) : 0;
        return (int) round(max(0, 100 - ($broken_ratio * 200)));
    }

    private function score_content(array $s, int $total): int
    {
        $dup_ratio = $total > 0 ? ($s['duplicate_pairs'] / $total) : 0;
        return (int) round(max(0, 100 - ($dup_ratio * 150)));
    }

    public function get_opportunities(int $site_id): array
    {
        $cache_key = "nexora_pulse_opportunities_{$site_id}";
        $cached    = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }

        global $wpdb;
        $issues_table = $wpdb->prefix . 'nexora_pulse_issues';
        $links_table  = $wpdb->prefix . 'nexora_pulse_links';
        $gsc_table    = $wpdb->prefix . 'nexora_pulse_gsc_data';
        $sim_table    = $wpdb->prefix . 'nexora_pulse_similarity';

        $opportunities = [];

        // Opportunity 1: Critical issues that need immediate attention.
        $critical_count = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$issues_table} WHERE site_id = %d AND severity = 'critical' AND status = 'open'",
            $site_id
        ));
        if ($critical_count > 0) {
            $top_critical = $wpdb->get_results($wpdb->prepare(
                "SELECT title, url FROM {$issues_table} WHERE site_id = %d AND severity = 'critical' AND status = 'open' LIMIT 3",
                $site_id
            ));
            $opportunities[] = [
                'id'          => 'critical_issues',
                'priority'    => 1,
                'type'        => 'critical',
                'icon'        => 'alert-triangle',
                'title'       => "{$critical_count} critical SEO issue" . ($critical_count !== 1 ? 's' : '') . " need fixing",
                'description' => 'Critical issues are blocking search engines from properly indexing your content.',
                'action'      => 'Fix Issues',
                'action_url'  => '#/analyzer',
                'impact'      => 'high',
                'examples'    => array_map(fn($r) => $r->title, $top_critical),
            ];
        }

        // Opportunity 2: Orphan pages with no internal links.
        $orphan_count = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p
             LEFT JOIN {$links_table} l ON l.target_id = p.ID AND l.site_id = %d
             WHERE p.post_status = 'publish' AND p.post_type IN ('post','page') AND l.id IS NULL",
            $site_id
        ));
        if ($orphan_count > 0) {
            $opportunities[] = [
                'id'          => 'orphan_pages',
                'priority'    => 2,
                'type'        => 'warning',
                'icon'        => 'unlink',
                'title'       => "{$orphan_count} orphan page" . ($orphan_count !== 1 ? 's' : '') . " with no internal links",
                'description' => 'Pages with no internal links are hard for search engines and visitors to discover.',
                'action'      => 'View Orphans',
                'action_url'  => '#/neural-links',
                'impact'      => 'medium',
                'examples'    => [],
            ];
        }

        // Opportunity 3: Broken internal links to fix.
        $broken_count = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$links_table} WHERE site_id = %d AND is_broken = 1",
            $site_id
        ));
        if ($broken_count > 0) {
            $opportunities[] = [
                'id'          => 'broken_links',
                'priority'    => 3,
                'type'        => 'warning',
                'icon'        => 'link',
                'title'       => "{$broken_count} broken link" . ($broken_count !== 1 ? 's' : '') . " hurting user experience",
                'description' => 'Broken links signal poor site maintenance to search engines and frustrate visitors.',
                'action'      => 'Fix Links',
                'action_url'  => '#/neural-links',
                'impact'      => 'medium',
                'examples'    => [],
            ];
        }

        // Opportunity 4: High-volume GSC queries below position 10 (easy wins).
        $since = gmdate('Y-m-d', strtotime('-28 days'));
        $quick_wins = $wpdb->get_results($wpdb->prepare(
            "SELECT url, SUM(impressions) as total_impressions, AVG(position) as avg_pos
             FROM {$gsc_table}
             WHERE site_id = %d AND data_date >= %s AND position BETWEEN 4 AND 20
             GROUP BY url
             HAVING total_impressions > 100
             ORDER BY total_impressions DESC
             LIMIT 3",
            $site_id, $since
        ));
        if (!empty($quick_wins)) {
            $opportunities[] = [
                'id'          => 'ranking_quick_wins',
                'priority'    => 4,
                'type'        => 'opportunity',
                'icon'        => 'trending-up',
                'title'       => count($quick_wins) . " page" . (count($quick_wins) !== 1 ? 's' : '') . " almost on page 1 — boost them now",
                'description' => 'These pages have high impressions and rank just outside the top 3. Small improvements can move them up.',
                'action'      => 'View in Search Console',
                'action_url'  => '#/search-console',
                'impact'      => 'high',
                'examples'    => array_map(fn($r) => basename(rtrim($r->url, '/')), $quick_wins),
            ];
        }

        // Opportunity 5: Duplicate content reducing authority. Only count pairs
        // where both posts are still published (ignore drafted/deleted).
        $dup_count = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$sim_table} s
             INNER JOIN {$wpdb->posts} pa ON pa.ID = s.post_id_a AND pa.post_status = 'publish'
             INNER JOIN {$wpdb->posts} pb ON pb.ID = s.post_id_b AND pb.post_status = 'publish'
             WHERE s.site_id = %d AND s.similarity >= 70",
            $site_id
        ));
        if ($dup_count > 0) {
            $opportunities[] = [
                'id'          => 'duplicate_content',
                'priority'    => 5,
                'type'        => 'info',
                'icon'        => 'copy',
                'title'       => "{$dup_count} duplicate content pair" . ($dup_count !== 1 ? 's' : '') . " diluting authority",
                'description' => 'Similar content splits your keyword authority. Consolidate or canonicalize these pages.',
                'action'      => 'Review Duplicates',
                'action_url'  => '#/originality',
                'impact'      => 'medium',
                'examples'    => [],
            ];
        }

        // If nothing found, return a "you're clean" card.
        if (empty($opportunities)) {
            $opportunities[] = [
                'id'          => 'all_good',
                'priority'    => 1,
                'type'        => 'success',
                'icon'        => 'check-circle',
                'title'       => "Your site looks healthy — no quick wins needed",
                'description' => 'Run a full scan to discover any hidden SEO opportunities.',
                'action'      => 'Run Full Scan',
                'action_url'  => '#/analyzer',
                'impact'      => 'low',
                'examples'    => [],
            ];
        }

        usort($opportunities, fn($a, $b) => $a['priority'] <=> $b['priority']);

        $result = array_slice($opportunities, 0, 5);
        set_transient($cache_key, $result, 5 * MINUTE_IN_SECONDS);
        return $result;
    }

    private function score_to_grade(int $score): string
    {
        return match (true) {
            $score >= 90 => 'A',
            $score >= 80 => 'B',
            $score >= 70 => 'C',
            $score >= 60 => 'D',
            default      => 'F',
        };
    }
}
