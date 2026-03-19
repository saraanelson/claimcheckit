'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShieldCheck, Moon, Sun, Menu, X } from 'lucide-react';

export function Header() {
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <header className="border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-950/80 backdrop-blur-xl sticky top-0 z-50 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-100 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                ClaimCheck
              </span>
              <span className="text-[10px] font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500 -mt-0.5">
                Evidence-Based
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center space-x-1">
            <Link
              href="/methodology"
              className="px-4 py-2 text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-all"
            >
              Methodology
            </Link>
            <Link
              href="/history"
              className="px-4 py-2 text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-all"
            >
              History
            </Link>
            <button
              onClick={toggleTheme}
              className="ml-2 p-2 rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 transition-all"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </nav>

          {/* Mobile */}
          <div className="flex sm:hidden items-center gap-1">
            <button onClick={toggleTheme} className="p-2 rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all" aria-label="Toggle theme">
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all" aria-label="Menu">
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="sm:hidden pb-4 animate-slide-down">
            <Link href="/methodology" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg">
              Methodology
            </Link>
            <Link href="/history" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg">
              History
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
