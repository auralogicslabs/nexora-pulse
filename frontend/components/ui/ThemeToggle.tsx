import React from 'react';
import { useAppStore } from '../../lib/store';

export default function ThemeToggle() {
  const { theme, setTheme } = useAppStore();

  const cycle = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
  };

  const icon = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🖥️';

  return (
    <button
      onClick={cycle}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      title={`Theme: ${theme}`}
    >
      <span>{icon}</span>
    </button>
  );
}
