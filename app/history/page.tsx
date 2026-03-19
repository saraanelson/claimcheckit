'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '../../components/Header';
import { Search, Clock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Claim } from '../../lib/supabase';
import { format } from 'date-fns';

const VERDICT_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  'Well Supported':        { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'Partially Supported':   { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  'Misleading':            { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  'Under Debate':          { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
  'Insufficient Evidence': { bg: 'bg-stone-100 dark:bg-stone-800/40', text: 'text-stone-600 dark:text-stone-400', dot: 'bg-stone-400' },
};

const CATEGORY_STYLES: Record<string, string> = {
  health:      'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  politics:    'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  environment: 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800',
  technology:  'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
  economics:   'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  science:     'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
};

export default function HistoryPage() {
  const router = useRouter();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    loadClaims();
  }, []);

  const loadClaims = async () => {
    try {
      const { data } = await supabase
        .from('claims')
        .select('*')
        .neq('current_status', 'Under Analysis')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setClaims(data);
    } catch (error) {
      console.error('Error loading claims:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = claims.filter((c) => {
    const matchesSearch = !searchQuery || c.original_text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || c.current_status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const statuses = ['all', 'Well Supported', 'Partially Supported', 'Misleading', 'Under Debate', 'Insufficient Evidence'];

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8 animate-fade-up">
          <h1 className="font-serif text-3xl sm:text-4xl text-stone-900 dark:text-stone-100 mb-2">Analysis History</h1>
          <p className="text-stone-500 dark:text-stone-400">Browse all previously analyzed claims</p>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8 animate-fade-up stagger-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search claims…"
              className="w-full pl-10 pr-4 py-2.5 card border text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-600 focus:outline-none focus:border-teal-400 dark:focus:border-teal-600 transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all whitespace-nowrap ${
                  filterStatus === s
                    ? 'bg-teal-600 dark:bg-teal-500 text-white border-teal-600 dark:border-teal-500'
                    : 'bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:border-teal-300 dark:hover:border-teal-700'
                }`}
              >
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-teal-600 dark:text-teal-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-16 text-center animate-fade-up">
            <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-stone-400" />
            </div>
            <p className="text-stone-500 dark:text-stone-400 font-medium">
              {searchQuery ? 'No claims match your search' : 'No analyzed claims yet'}
            </p>
            <button onClick={() => router.push('/')} className="mt-4 text-sm text-teal-600 dark:text-teal-400 hover:underline font-medium">
              ← Analyze a claim
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((claim, i) => {
              const style = VERDICT_STYLES[claim.current_status];
              const catStyle = CATEGORY_STYLES[claim.category.toLowerCase()];
              return (
                <button
                  key={claim.id}
                  onClick={() => router.push(`/claim/${claim.id}`)}
                  className={`w-full group card-hover p-5 text-left animate-fade-up stagger-${Math.min(i + 1, 6)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-stone-800 dark:text-stone-200 font-medium leading-snug group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors line-clamp-2">
                        {claim.original_text}
                      </p>
                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        {style && (
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                            {claim.current_status}
                          </span>
                        )}
                        {catStyle && (
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border capitalize ${catStyle}`}>
                            {claim.category}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[11px] text-stone-400">
                          <Clock className="w-3 h-3" />
                          {format(new Date(claim.created_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-stone-300 dark:text-stone-600 group-hover:text-teal-500 dark:group-hover:text-teal-400 transition-colors flex-shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
