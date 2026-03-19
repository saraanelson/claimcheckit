'use client';

import { Header } from '../../components/Header';
import { ShieldCheck, Search, BarChart3, AlertTriangle, CheckCircle, HelpCircle, AlertOctagon, AlertCircle } from 'lucide-react';

const steps = [
  { title: 'Claim Classification', desc: 'We classify claims into categories (health, politics, science, environment, technology, economics, product) to target appropriate sources.' },
  { title: 'Source Retrieval', desc: 'We search for credible sources using advanced web search, prioritizing government data, peer-reviewed research, international institutions, and investigative journalism.' },
  { title: 'Credibility Ranking', desc: 'Sources are ranked by credibility based on institutional authority, peer review status, and journalistic standards.' },
  { title: 'Evidence Analysis', desc: 'We synthesize findings to provide a nuanced summary of what evidence shows, what\'s agreed upon, and what remains disputed.' },
];

const statuses = [
  { label: 'Well Supported', icon: <CheckCircle className="w-5 h-5" />, color: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800', textColor: 'text-emerald-800 dark:text-emerald-300', desc: 'Strongly backed by multiple high-quality sources with broad consensus.' },
  { label: 'Partially Supported', icon: <AlertTriangle className="w-5 h-5" />, color: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800', textColor: 'text-amber-800 dark:text-amber-300', desc: 'Some aspects supported, but important caveats or limitations exist.' },
  { label: 'Misleading', icon: <AlertOctagon className="w-5 h-5" />, color: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800', textColor: 'text-red-800 dark:text-red-300', desc: 'Misrepresents evidence, cherry-picks data, or contradicts credible sources.' },
  { label: 'Under Debate', icon: <HelpCircle className="w-5 h-5" />, color: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800', textColor: 'text-blue-800 dark:text-blue-300', desc: 'Credible sources provide conflicting interpretations or mixed evidence.' },
  { label: 'Insufficient Evidence', icon: <AlertCircle className="w-5 h-5" />, color: 'bg-stone-100 dark:bg-stone-800/50 border-stone-200 dark:border-stone-700', textColor: 'text-stone-700 dark:text-stone-300', desc: 'Not enough credible sources to properly evaluate the claim.' },
];

export default function MethodologyPage() {
  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-10 animate-fade-up">
          <h1 className="font-serif text-4xl sm:text-5xl text-stone-900 dark:text-stone-100 mb-3">Methodology</h1>
          <p className="text-lg text-stone-500 dark:text-stone-400">How ClaimCheck evaluates claims with evidence and transparency</p>
        </div>

        <div className="space-y-8">

          {/* What we do */}
          <section className="card p-8 animate-fade-up stagger-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-white" />
              </div>
              <h2 className="font-serif text-2xl text-stone-900 dark:text-stone-100">What ClaimCheck Does</h2>
            </div>
            <div className="text-stone-600 dark:text-stone-400 leading-relaxed space-y-3">
              <p>
                ClaimCheck is an evidence-based claim evaluation tool. When you submit a claim,
                we retrieve real sources from credible institutions, research bodies, and reputable
                journalism, then analyze what the evidence actually shows.
              </p>
              <p>
                We do not use mock data, invented sources, or predetermined verdicts. Every analysis
                is grounded in retrieved evidence from real sources.
              </p>
            </div>
          </section>

          {/* Process */}
          <section className="card p-8 animate-fade-up stagger-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                <Search className="w-4 h-4 text-white" />
              </div>
              <h2 className="font-serif text-2xl text-stone-900 dark:text-stone-100">Our Process</h2>
            </div>
            <div className="space-y-5">
              {steps.map((step, i) => (
                <div key={step.title} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    {i < steps.length - 1 && <div className="w-px flex-1 bg-stone-200 dark:bg-stone-700 mt-2" />}
                  </div>
                  <div className="pb-5">
                    <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-1">{step.title}</h3>
                    <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Statuses */}
          <section className="card p-8 animate-fade-up stagger-3">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-white" />
              </div>
              <h2 className="font-serif text-2xl text-stone-900 dark:text-stone-100">Claim Statuses</h2>
            </div>
            <div className="space-y-3">
              {statuses.map((s) => (
                <div key={s.label} className={`p-4 rounded-xl border ${s.color}`}>
                  <div className={`flex items-center gap-2 mb-1.5 font-semibold ${s.textColor}`}>
                    {s.icon}
                    <span>{s.label}</span>
                  </div>
                  <p className={`text-sm leading-relaxed ${s.textColor} opacity-80`}>{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* What we don't do */}
          <section className="card p-8 animate-fade-up stagger-4">
            <h2 className="font-serif text-2xl text-stone-900 dark:text-stone-100 mb-4">What We Don&apos;t Do</h2>
            <div className="space-y-2 text-stone-600 dark:text-stone-400 text-sm leading-relaxed">
              {[
                'We do not fabricate sources or evidence',
                'We do not use mock data or placeholder articles',
                'We do not provide simple "true" or "false" without nuance',
                'We do not inject opinions or political bias',
                'We do not hide sources or present analysis without transparency',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">✕</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Limitations */}
          <section className="card p-8 border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20 animate-fade-up stagger-5">
            <h2 className="font-serif text-xl text-stone-900 dark:text-stone-100 mb-3">Limitations</h2>
            <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed mb-3">
              No automated system is perfect. Please consider:
            </p>
            <div className="space-y-1.5 text-sm text-stone-500 dark:text-stone-400">
              {[
                'We rely on publicly available sources; proprietary research may not be accessible',
                'Very recent claims may lack sufficient source material',
                'Highly specialized claims may require expert human review',
                'Evidence evolves; analyses reflect sources available at the time',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <span className="text-stone-400 mt-0.5">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
