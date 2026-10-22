import { useState, useEffect } from 'react';

export const useDarkMode = () => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Verificar si el usuario ya tenía preferencia guardada
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kanban_theme');
      if (saved) return saved === 'dark';
      // Fallback a la preferencia del sistema operativo
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('kanban_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('kanban_theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  return { isDarkMode, toggleDarkMode };
};