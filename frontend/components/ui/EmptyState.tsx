import React from 'react';
import { Search } from 'lucide-react';

interface Props {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center np-animate-fade-in">
      <div className="mb-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 text-gray-400 dark:text-gray-500">
        {icon ?? <Search className="w-10 h-10" />}
      </div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
