import React from 'react';
import {
  AlertTriangle,
  Link,
  Link2Off,
  TrendingUp,
  Copy,
  CheckCircle2,
  ArrowRight,
  Zap,
} from 'lucide-react';

type ImpactLevel = 'high' | 'medium' | 'low';
type OpportunityType = 'critical' | 'warning' | 'opportunity' | 'info' | 'success';

interface Opportunity {
  id: string;
  priority: number;
  type: OpportunityType;
  icon: string;
  title: string;
  description: string;
  action: string;
  action_url: string;
  impact: ImpactLevel;
  examples: string[];
}

const ICON_MAP: Record<string, React.FC<any>> = {
  'alert-triangle': AlertTriangle,
  'link':           Link,
  'unlink':         Link2Off,
  'trending-up':    TrendingUp,
  'copy':           Copy,
  'check-circle':   CheckCircle2,
};

const TYPE_STYLES: Record<OpportunityType, { border: string; iconBg: string; iconColor: string; badge: string; badgeText: string }> = {
  critical:    { border: 'border-red-200 dark:border-red-800',    iconBg: 'bg-red-50 dark:bg-red-900/20',    iconColor: 'text-red-500',    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',    badgeText: 'Critical' },
  warning:     { border: 'border-orange-200 dark:border-orange-800', iconBg: 'bg-orange-50 dark:bg-orange-900/20', iconColor: 'text-orange-500', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', badgeText: 'Action Needed' },
  opportunity: { border: 'border-blue-200 dark:border-blue-800',  iconBg: 'bg-blue-50 dark:bg-blue-900/20',  iconColor: 'text-blue-500',  badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',  badgeText: 'Quick Win' },
  info:        { border: 'border-yellow-200 dark:border-yellow-800', iconBg: 'bg-yellow-50 dark:bg-yellow-900/20', iconColor: 'text-yellow-500', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', badgeText: 'Review' },
  success:     { border: 'border-green-200 dark:border-green-800', iconBg: 'bg-green-50 dark:bg-green-900/20', iconColor: 'text-green-500', badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', badgeText: 'Healthy' },
};

const IMPACT_LABEL: Record<ImpactLevel, string> = {
  high:   'High Impact',
  medium: 'Med Impact',
  low:    'Low Impact',
};

function OpportunityCard({ opp }: { opp: Opportunity }) {
  const styles = TYPE_STYLES[opp.type];
  const Icon   = ICON_MAP[opp.icon] ?? AlertTriangle;

  return (
    <div className={`np-card p-4 border ${styles.border} flex items-start gap-4 group hover:shadow-md transition-shadow`}>
      <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center ${styles.iconBg}`}>
        <Icon className={`w-4.5 h-4.5 ${styles.iconColor}`} style={{ width: 18, height: 18 }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles.badge}`}>
            {styles.badgeText}
          </span>
          <span className="text-xs text-gray-600">{IMPACT_LABEL[opp.impact]}</span>
        </div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{opp.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{opp.description}</p>
        {opp.examples.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {opp.examples.map((ex, i) => (
              <span key={i} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-md font-mono truncate max-w-[160px]">
                {ex}
              </span>
            ))}
          </div>
        )}
      </div>

      <a
        href={opp.action_url}
        className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-pulse-600 dark:text-pulse-400
                   hover:text-pulse-700 dark:hover:text-pulse-300 transition-colors group-hover:gap-2 whitespace-nowrap"
      >
        {opp.action}
        <ArrowRight className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

interface Props {
  opportunities: Opportunity[] | undefined;
  isLoading: boolean;
}

export default function OpportunityCenter({ opportunities, isLoading }: Props) {
  return (
    <div className="np-card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-pulse-50 dark:bg-pulse-900/20 flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 text-pulse-600 dark:text-pulse-400" />
        </div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex-1">SEO Opportunities</h2>
        <span className="text-xs text-gray-600">Top actions to improve your ranking</span>
      </div>

      <div className="p-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="np-skeleton h-20 rounded-xl" />
          ))
        ) : !opportunities || opportunities.length === 0 ? (
          <div className="flex items-center gap-3 py-4 px-2">
            <CheckCircle2 className="w-8 h-8 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">No outstanding opportunities</p>
              <p className="text-xs text-gray-600">Run a scan to surface actionable SEO improvements.</p>
            </div>
          </div>
        ) : (
          opportunities.map((opp) => <OpportunityCard key={opp.id} opp={opp} />)
        )}
      </div>
    </div>
  );
}
