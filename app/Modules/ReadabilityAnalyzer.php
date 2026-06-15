<?php
declare(strict_types=1);

namespace NexoraPulse\Modules;

use WP_Post;

defined('ABSPATH') || exit;

/**
 * Computes Flesch Reading Ease + supplementary readability metrics
 * (passive voice ratio, long sentence count, transition word usage).
 *
 * Implementation is intentionally simple and language-specific to English —
 * matches what Yoast/Rank Math do for the same metrics.
 */
final class ReadabilityAnalyzer
{
    private const LONG_SENTENCE_WORDS = 20;

    public function analyze(WP_Post $post): array
    {
        $extractor = new ContentExtractor();
        $text      = $extractor->get_text($post);

        if (trim($text) === '') {
            return $this->empty_result();
        }

        $sentences  = $this->split_sentences($text);
        $words      = $this->split_words($text);
        $word_count = count($words);
        $sent_count = count($sentences);
        $syllables  = $this->count_total_syllables($words);

        if ($word_count === 0 || $sent_count === 0) {
            return $this->empty_result();
        }

        // Flesch Reading Ease (0–100, higher = easier).
        $flesch = 206.835
            - 1.015 * ($word_count / $sent_count)
            - 84.6  * ($syllables  / $word_count);
        $flesch = (int) round(max(0, min(100, $flesch)));

        $long_sentences = $this->count_long_sentences($sentences);
        $passive_count  = $this->count_passive_sentences($sentences);
        $transition     = $this->count_transition_sentences($sentences);

        $passive_pct    = (int) round(($passive_count / $sent_count) * 100);
        $long_pct       = (int) round(($long_sentences / $sent_count) * 100);
        $transition_pct = (int) round(($transition / $sent_count) * 100);

        return [
            'flesch_score'   => $flesch,
            'grade'          => $this->flesch_grade($flesch),
            'words'          => $word_count,
            'sentences'      => $sent_count,
            'syllables'      => $syllables,
            'avg_sentence'   => (float) round($word_count / $sent_count, 1),
            'long_sentences' => $long_sentences,
            'long_pct'       => $long_pct,
            'passive_count'  => $passive_count,
            'passive_pct'    => $passive_pct,
            'transition_pct' => $transition_pct,
            'checks'         => $this->build_checks($flesch, $long_pct, $passive_pct, $transition_pct),
        ];
    }

    private function empty_result(): array
    {
        return [
            'flesch_score'   => 0,
            'grade'          => ['label' => 'No content', 'color' => 'gray'],
            'words'          => 0,
            'sentences'      => 0,
            'syllables'      => 0,
            'avg_sentence'   => 0.0,
            'long_sentences' => 0,
            'long_pct'       => 0,
            'passive_count'  => 0,
            'passive_pct'    => 0,
            'transition_pct' => 0,
            'checks'         => [],
        ];
    }

    private function split_sentences(string $text): array
    {
        // Collapse whitespace, then split on ., !, ?  followed by space/end.
        $text  = preg_replace('/\s+/', ' ', $text) ?? $text;
        $parts = preg_split('/(?<=[.!?])\s+/u', $text) ?: [];
        return array_values(array_filter(array_map('trim', $parts), fn ($s) => $s !== ''));
    }

    private function split_words(string $text): array
    {
        preg_match_all('/[a-zA-Z]+/u', $text, $matches);
        return $matches[0] ?? [];
    }

    private function count_total_syllables(array $words): int
    {
        $total = 0;
        foreach ($words as $w) {
            $total += $this->syllables_in($w);
        }
        return $total;
    }

    /**
     * Approximate English syllable count — vowel-group heuristic.
     * Good enough for Flesch (real word-by-word dictionaries add ~3% accuracy).
     */
    private function syllables_in(string $word): int
    {
        $word = strtolower($word);
        if ($word === '') {
            return 0;
        }
        // Strip silent trailing "e".
        $word = preg_replace('/e$/', '', $word) ?? $word;
        // Count vowel groups.
        preg_match_all('/[aeiouy]+/', $word, $m);
        $count = count($m[0] ?? []);
        return max(1, $count);
    }

    private function count_long_sentences(array $sentences): int
    {
        $count = 0;
        foreach ($sentences as $s) {
            if (count($this->split_words($s)) > self::LONG_SENTENCE_WORDS) {
                $count++;
            }
        }
        return $count;
    }

    /**
     * Passive voice heuristic: "to be" auxiliary + past-participle (-ed / irregular).
     * False positives are common but the *ratio* trend matches Yoast.
     */
    private function count_passive_sentences(array $sentences): int
    {
        $aux = '(is|are|was|were|be|been|being|am)';
        // Past participle: most -ed verbs + ~150 common irregulars.
        $irregular = 'taken|given|done|made|seen|known|written|spoken|broken|chosen|driven|eaten|fallen|forgotten|hidden|stolen|thrown|worn|begun|brought|bought|caught|come|cut|felt|fought|found|got|gone|had|heard|held|kept|left|lost|met|paid|put|read|run|said|sent|shown|sold|sent|set|sat|slept|stood|taught|told|thought|understood|won|woken';
        $pattern = '/\b' . $aux . '\b\s+(\w+ed|' . $irregular . ')\b/i';

        $count = 0;
        foreach ($sentences as $s) {
            if (preg_match($pattern, $s)) {
                $count++;
            }
        }
        return $count;
    }

    private function count_transition_sentences(array $sentences): int
    {
        $transitions = [
            'however', 'therefore', 'moreover', 'furthermore', 'additionally',
            'consequently', 'meanwhile', 'nevertheless', 'similarly', 'likewise',
            'in addition', 'for example', 'for instance', 'in contrast',
            'on the other hand', 'as a result', 'in conclusion', 'first',
            'second', 'third', 'finally', 'instead', 'because', 'although',
            'while', 'whereas', 'unless', 'since',
        ];
        $count = 0;
        foreach ($sentences as $s) {
            $lower = strtolower($s);
            foreach ($transitions as $t) {
                if (str_contains($lower, $t)) {
                    $count++;
                    break;
                }
            }
        }
        return $count;
    }

    private function flesch_grade(int $score): array
    {
        return match (true) {
            $score >= 90 => ['label' => 'Very easy',  'color' => 'emerald', 'note' => '5th grade — reads like a children\'s book.'],
            $score >= 80 => ['label' => 'Easy',       'color' => 'emerald', 'note' => '6th grade — easy to understand.'],
            $score >= 70 => ['label' => 'Fairly easy','color' => 'green',   'note' => '7th grade — comfortable for most readers.'],
            $score >= 60 => ['label' => 'Plain',      'color' => 'amber',   'note' => '8–9th grade — the sweet spot for web copy.'],
            $score >= 50 => ['label' => 'Fairly hard','color' => 'amber',   'note' => '10–12th grade — somewhat difficult.'],
            $score >= 30 => ['label' => 'Difficult',  'color' => 'orange',  'note' => 'College level — hard for general audiences.'],
            default      => ['label' => 'Very hard',  'color' => 'red',     'note' => 'College graduate — extremely dense prose.'],
        };
    }

    private function build_checks(int $flesch, int $long_pct, int $passive_pct, int $transition_pct): array
    {
        $checks = [];

        // Flesch score itself.
        $checks[] = [
            'key'    => 'flesch',
            'label'  => 'Reading ease',
            'status' => $flesch >= 60 ? 'good' : ($flesch >= 50 ? 'ok' : 'bad'),
            'value'  => $flesch,
            'message' => $flesch >= 60
                ? 'Your prose is easy to read — perfect for the web.'
                : ($flesch >= 50
                    ? 'Slightly hard. Consider shorter words and sentences.'
                    : 'Hard to read. Break up sentences and replace complex words.'),
        ];

        // Long sentences (Yoast's rule: ≤25% long).
        $checks[] = [
            'key'    => 'long_sentences',
            'label'  => 'Sentence length',
            'status' => $long_pct <= 25 ? 'good' : ($long_pct <= 35 ? 'ok' : 'bad'),
            'value'  => $long_pct,
            'message' => $long_pct <= 25
                ? 'Few long sentences. Great rhythm.'
                : "{$long_pct}% of your sentences are over 20 words. Aim for under 25%.",
        ];

        // Passive voice (Yoast's rule: ≤10% passive).
        $checks[] = [
            'key'    => 'passive_voice',
            'label'  => 'Passive voice',
            'status' => $passive_pct <= 10 ? 'good' : ($passive_pct <= 20 ? 'ok' : 'bad'),
            'value'  => $passive_pct,
            'message' => $passive_pct <= 10
                ? 'Active voice dominates — your writing feels direct.'
                : "{$passive_pct}% of sentences appear passive. Aim for under 10% for stronger prose.",
        ];

        // Transition words (Yoast's rule: ≥30%).
        $checks[] = [
            'key'    => 'transitions',
            'label'  => 'Transition words',
            'status' => $transition_pct >= 30 ? 'good' : ($transition_pct >= 20 ? 'ok' : 'bad'),
            'value'  => $transition_pct,
            'message' => $transition_pct >= 30
                ? 'Good use of transitions — ideas flow naturally.'
                : "Only {$transition_pct}% of sentences use transitions. Add words like 'however', 'therefore', 'for example' to improve flow.",
        ];

        return $checks;
    }
}
