import React from 'react';
import { Bot, Sparkles, FileText, Type, Code2, CheckCircle2, RotateCcw } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

/**
 * AI Assistant — on the roadmap.
 *
 * The generation/approval engine exists in the backend but the feature is not
 * enabled in this release. We show a clear roadmap screen so users know it's
 * coming, rather than a locked/upsell wall (there is no paid tier yet).
 */
const PLANNED = [
  { icon: FileText, title: 'Meta description generation', desc: 'Draft concise, on-brand descriptions from your content.' },
  { icon: Type, title: 'SEO title optimization', desc: 'Generate titles tuned for click-through and length.' },
  { icon: Code2, title: 'Schema markup builder', desc: 'Produce valid JSON-LD for your pages automatically.' },
  { icon: CheckCircle2, title: 'Review & approve workflow', desc: 'Preview every suggestion before it touches your site.' },
  { icon: RotateCcw, title: 'One-click rollback', desc: 'Revert any applied change back to the original.' },
];

export default function AiAssistant() {
  return (
    <div className="flex-1 overflow-y-auto np-scrollbar">
      <PageHeader
        eyebrow="Intelligence"
        title="AI Assistant"
        subtitle="Smart content & metadata assistance — coming in a future release"
      />

      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="np-card p-8 text-center np-animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center mx-auto mb-5 shadow-sm">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <span className="np-badge bg-amber-100 text-amber-700 ring-1 ring-amber-200 text-[11px] mb-3 inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> On the roadmap
          </span>
          <h2 className="text-xl font-bold text-gray-900 mb-2">AI-assisted SEO is on the way</h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
            We're building AI assistance that uses your own provider key to draft metadata and
            content — with a full review-and-approve workflow so you stay in control. It will arrive
            in an upcoming release.
          </p>
        </div>

        <div className="np-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">What's planned</h3>
            <p className="text-xs text-gray-600 mt-0.5">The capabilities we're working toward.</p>
          </div>
          <div className="divide-y divide-gray-50">
            {PLANNED.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3 px-5 py-3.5">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{title}</p>
                  <p className="text-xs text-gray-600 leading-snug mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-500">
          Meanwhile, everything else in Pulse — analysis, Index Doctor, Search Console &amp;
          performance data — is fully available on the free plan.
        </p>
      </div>
    </div>
  );
}
