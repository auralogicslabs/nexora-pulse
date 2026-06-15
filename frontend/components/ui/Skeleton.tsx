import React from 'react';

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="np-card p-5 space-y-3 animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 bg-gray-200 dark:bg-gray-800 rounded" style={{ width: `${70 + (i % 3) * 10}%` }} />
      ))}
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="np-card p-5 animate-pulse space-y-2">
      <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
      <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg" />
      ))}
    </div>
  );
}
