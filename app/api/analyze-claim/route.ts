import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';

// ── Supabase admin client (service role) ──────────────────────────────────────

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_DEFAULT_KEY!;
  return createClient(url, key);
}

// ── Classifiers ───────────────────────────────────────────────────────────────

function classifyCategory(text: string): string {
  const lower = text.toLowerCase();
  const map: Record<string, string[]> = {
    health: ['health', 'medical', 'disease', 'drug', 'treatment', 'vaccine', 'diet', 'supplement', 'creatine', 'cancer', 'covid'],
    science: ['science', 'research', 'study', 'experiment', 'theory', 'discovery'],
    environment: ['climate', 'environment', 'pollution', 'emissions', 'electric vehicle', 'ev', 'renewable', 'carbon'],
    technology: ['ai', 'artificial intelligence', 'technology', 'tech', 'software', 'algorithm', 'robot', 'automation'],
    politics: ['government', 'politics', 'election', 'policy', 'law', 'congress', 'president', 'senator', 'sanctions'],
    economics: ['economy', 'economic', 'market', 'stock', 'inflation', 'gdp', 'recession', 'employment', 'jobs'],
    product: ['product', 'buy', 'purchase', 'guarantee', 'money back', 'tested', 'proven'],
  };
  for (const [cat, terms] of Object.entries(map)) {
    if (terms.some((t) => lower.includes(t))) return cat;
  }
  return 'general';
}

function classifySourceType(url: string): string {
  const l = url.toLowerCase();
  if (l.includes('.gov')) return 'Government data';
  if (l.includes('.edu') || l.includes('nature.com') || l.includes('science.org')) return 'Peer-reviewed research';
  if (l.includes('who.int') || l.includes('worldbank.org') || l.includes('un.org')) return 'International institution';
  if (l.includes('reuters.com') || l.includes('apnews.com')) return 'Wire service';
  return 'Investigative journalism';
}

function credibilityScore(url: string): number {
  const l = url.toLowerCase();
  if (l.includes('.gov') || l.includes('.edu')) return 0.95;
  if (l.includes('nature.com') || l.includes('science.org')) return 0.95;
  if (l.includes('who.int') || l.includes('cdc.gov')) return 0.95;
  if (l.includes('reuters.com') || l.includes('apnews.com')) return 0.9;
  if (l.includes('bbc.com') || l.includes('theguardian.com')) return 0.85;
  return 0.7;
}

function extractPublisher(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'Unknown';
  }
}

// ── Tavily search ─────────────────────────────────────────────────────────────

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

async function searchTavily(query: string): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY ?? '';
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: 'advanced', max_results: 8, include_answer: false }),
  });
  if (!res.ok) throw new Error(`Tavily error ${res.status}`);
  const data = await res.json();
  return data.results ?? [];
}

// ── Source record type ────────────────────────────────────────────────────────

interface SourceRecord {
  id: string;
  publisher: string;
  snippet_text: string | null;
  credibility_score: number;
  source_type: string;
  title: string;
}

// ── Consensus & disputes ──────────────────────────────────────────────────────

function findConsensusAndDisputes(sources: SourceRecord[], claimText: string) {
  const claimWords = new Set(claimText.toLowerCase().split(/\s+/).filter((w) => w.length > 4));

  const sourceAnalysis = sources
    .filter((s) => s.snippet_text && s.snippet_text.length > 30)
    .map((s) => {
      const snippet = s.snippet_text!.toLowerCase();
      const supportSignals = ['confirmed','supports','evidence shows','research shows','study found','data shows','according to','consistent with','demonstrates','indicates','suggests that','found that'].filter((sig) => snippet.includes(sig)).length;
      const disputeSignals = ['however','disputed','controversial','debated','conflicting','disagree','challenge','question','unclear','mixed results','no evidence','insufficient','contradicts','misleading','overstate','exaggerate','nuanced','complex'].filter((sig) => snippet.includes(sig)).length;
      return { source: s, supportSignals, disputeSignals, leanSupport: supportSignals > disputeSignals, leanDispute: disputeSignals > supportSignals };
    });

  const supportingSources = sourceAnalysis.filter((a) => a.leanSupport);
  const disputingSources = sourceAnalysis.filter((a) => a.leanDispute);
  const neutralSources = sourceAnalysis.filter((a) => !a.leanSupport && !a.leanDispute);

  const consensus: Array<{ text: string; sourceIds: string[] }> = [];
  const disputes: Array<{ text: string; sourceIds: string[] }> = [];

  if (supportingSources.length >= 2) {
    consensus.push({ text: `${supportingSources.slice(0,3).map((a) => a.source.publisher).join(', ')} provide corroborating evidence on key aspects of this claim`, sourceIds: supportingSources.map((a) => a.source.id) });
  }

  const typeGroups: Record<string, typeof sourceAnalysis> = {};
  for (const a of sourceAnalysis) {
    if (!typeGroups[a.source.source_type]) typeGroups[a.source.source_type] = [];
    typeGroups[a.source.source_type].push(a);
  }
  for (const [type, group] of Object.entries(typeGroups)) {
    if (group.length >= 2) {
      consensus.push({ text: `Multiple ${type.toLowerCase()} sources address this topic, providing consistent coverage`, sourceIds: group.map((a) => a.source.id) });
      break;
    }
  }

  const highCred = sourceAnalysis.filter((a) => a.source.credibility_score >= 0.85);
  if (highCred.length >= 2 && consensus.length < 3) {
    consensus.push({ text: 'High-credibility sources agree on the factual basis underlying this topic', sourceIds: highCred.map((a) => a.source.id) });
  }

  if (neutralSources.length > 0 && consensus.length < 4) {
    consensus.push({ text: 'The broader context and background facts are well-documented across sources', sourceIds: neutralSources.map((a) => a.source.id) });
  }

  if (disputingSources.length >= 1) {
    disputes.push({ text: `${disputingSources.slice(0,2).map((a) => a.source.publisher).join(' and ')} ${disputingSources.length === 1 ? 'raises' : 'raise'} questions about specific aspects or interpretations`, sourceIds: disputingSources.map((a) => a.source.id) });
  }

  if (supportingSources.length > 0 && disputingSources.length > 0) {
    disputes.push({ text: 'Sources differ on the scope and magnitude of claims made, suggesting the reality is more nuanced', sourceIds: [...supportingSources.slice(0,1).map((a) => a.source.id), ...disputingSources.slice(0,1).map((a) => a.source.id)] });
  }

  const methodTypes = new Set(sourceAnalysis.map((a) => a.source.source_type));
  if (methodTypes.size >= 3 && disputes.length < 3) {
    disputes.push({ text: `Different source types (${[...methodTypes].slice(0,3).join(', ').toLowerCase()}) approach this topic from different angles, leading to varying emphasis`, sourceIds: sourceAnalysis.slice(0,3).map((a) => a.source.id) });
  }

  if (consensus.length === 0) consensus.push({ text: 'Available sources address this topic but with limited overlap in their specific findings', sourceIds: sourceAnalysis.slice(0,2).map((a) => a.source.id) });
  if (disputes.length === 0 && sourceAnalysis.length > 1) disputes.push({ text: 'While sources cover this topic, the specific conclusions and emphasis vary between them', sourceIds: sourceAnalysis.slice(0,2).map((a) => a.source.id) });

  return { consensus: consensus.slice(0,4), disputes: disputes.slice(0,4) };
}

// ── Arguments ─────────────────────────────────────────────────────────────────

interface ArgumentRecord {
  side: 'supporting' | 'opposing';
  argument_text: string;
  evidence_text: string | null;
  source_ids: string[];
  strength: 'strong' | 'moderate' | 'weak';
}

function buildArguments(sources: SourceRecord[], claimText: string, category: string): ArgumentRecord[] {
  const claimWords = new Set(claimText.toLowerCase().split(/\s+/).filter((w) => w.length > 4));

  const analyzed = sources
    .filter((s) => s.snippet_text && s.snippet_text.length > 30)
    .map((s) => {
      const snippet = s.snippet_text!.toLowerCase();
      const supportSignals = ['confirmed','supports','evidence shows','research shows','study found','data shows','consistent with','demonstrates','indicates','suggests that','found that','according to','proven','established','validates','corroborates'].filter((sig) => snippet.includes(sig)).length;
      const againstSignals = ['however','disputed','controversial','debated','conflicting','disagree','challenge','question','unclear','mixed results','no evidence','insufficient','contradicts','misleading','overstate','exaggerate','nuanced','complex','limited','caveat','exception','but','although','despite','fails to','does not','unlikely','refutes'].filter((sig) => snippet.includes(sig)).length;
      const relevance = [...claimWords].filter((w) => snippet.includes(w)).length / Math.max(claimWords.size, 1);
      return { source: s, supportSignals, againstSignals, relevance, side: supportSignals > againstSignals ? 'supporting' as const : againstSignals > supportSignals ? 'opposing' as const : 'neutral' as const };
    });

  const forSources = analyzed.filter((a) => a.side === 'supporting').sort((a, b) => b.relevance - a.relevance);
  const againstSources = analyzed.filter((a) => a.side === 'opposing').sort((a, b) => b.relevance - a.relevance);
  const neutralSources = analyzed.filter((a) => a.side === 'neutral');

  const args: ArgumentRecord[] = [];

  if (forSources.length > 0) {
    const primary = forSources[0];
    const strength: 'strong' | 'moderate' | 'weak' = primary.source.credibility_score >= 0.85 ? 'strong' : primary.source.credibility_score >= 0.7 ? 'moderate' : 'weak';
    const evidenceSentence = primary.source.snippet_text!.split(/[.!?]+/).map((s) => s.trim()).find((s) => s.length > 20) || null;
    args.push({ side: 'supporting', argument_text: forSources.length > 1 ? `${forSources.length} sources provide evidence supporting this claim, including ${primary.source.source_type.toLowerCase()} from ${primary.source.publisher}` : `${primary.source.publisher} (${primary.source.source_type.toLowerCase()}) provides evidence that supports this claim`, evidence_text: evidenceSentence, source_ids: forSources.slice(0,4).map((a) => a.source.id), strength });
  }

  const forByType: Record<string, typeof forSources> = {};
  for (const a of forSources) {
    if (!forByType[a.source.source_type]) forByType[a.source.source_type] = [];
    forByType[a.source.source_type].push(a);
  }
  for (const [type, group] of Object.entries(forByType)) {
    if (group.length >= 2) {
      args.push({ side: 'supporting', argument_text: `Multiple ${type.toLowerCase()} sources independently corroborate key aspects of this claim`, evidence_text: `${group.map((a) => a.source.publisher).join(', ')} each present supporting findings`, source_ids: group.map((a) => a.source.id), strength: group.some((a) => a.source.credibility_score >= 0.85) ? 'strong' : 'moderate' });
      break;
    }
  }

  const highCredFor = forSources.filter((a) => a.source.credibility_score >= 0.85);
  if (highCredFor.length > 0 && args.filter((a) => a.side === 'supporting').length < 3) {
    args.push({ side: 'supporting', argument_text: `Highly credible sources (${highCredFor.slice(0,2).map((a) => a.source.publisher).join(', ')}) support this position`, evidence_text: highCredFor[0].source.snippet_text?.split(/[.!?]+/)[0]?.trim() || null, source_ids: highCredFor.slice(0,3).map((a) => a.source.id), strength: 'strong' });
  }

  if (againstSources.length > 0) {
    const primary = againstSources[0];
    const strength: 'strong' | 'moderate' | 'weak' = primary.source.credibility_score >= 0.85 ? 'strong' : primary.source.credibility_score >= 0.7 ? 'moderate' : 'weak';
    const evidenceSentence = primary.source.snippet_text!.split(/[.!?]+/).map((s) => s.trim()).find((s) => s.length > 20) || null;
    args.push({ side: 'opposing', argument_text: againstSources.length > 1 ? `${againstSources.length} sources raise concerns or contradictions, including ${primary.source.source_type.toLowerCase()} from ${primary.source.publisher}` : `${primary.source.publisher} (${primary.source.source_type.toLowerCase()}) presents evidence that challenges this claim`, evidence_text: evidenceSentence, source_ids: againstSources.slice(0,4).map((a) => a.source.id), strength });
  }

  if (againstSources.length > 0) {
    const snippets = againstSources.map((a) => a.source.snippet_text!.toLowerCase());
    const hasMethodConcern = snippets.some((s) => ['limited sample','methodology','small study','correlation','confounding','bias','not peer-reviewed','anecdotal'].some((term) => s.includes(term)));
    const hasScopeConcern = snippets.some((s) => ['overstate','exaggerate','more nuanced','context','specific conditions','not generalizable','exceptions'].some((term) => s.includes(term)));
    if (hasMethodConcern) {
      args.push({ side: 'opposing', argument_text: 'Sources raise methodological concerns about the evidence supporting this claim', evidence_text: 'Questions include study design limitations, sample size issues, or potential confounding variables', source_ids: againstSources.slice(0,2).map((a) => a.source.id), strength: 'moderate' });
    } else if (hasScopeConcern) {
      args.push({ side: 'opposing', argument_text: 'Sources suggest the claim overstates or oversimplifies the evidence', evidence_text: 'The reality appears more nuanced than the claim presents, with important caveats and context', source_ids: againstSources.slice(0,2).map((a) => a.source.id), strength: 'moderate' });
    }
  }

  if (args.filter((a) => a.side === 'opposing').length === 0 && neutralSources.length > 0) {
    args.push({ side: 'opposing', argument_text: 'While not directly contradicted, sources suggest the topic is more complex than the claim implies', evidence_text: 'Multiple sources provide context that complicates a simple verdict', source_ids: neutralSources.slice(0,2).map((a) => a.source.id), strength: 'weak' });
  }

  if (args.filter((a) => a.side === 'supporting').length === 0 && sources.length > 0) {
    args.push({ side: 'supporting', argument_text: 'Some sources address this topic in a way that lends partial support to the claim', evidence_text: null, source_ids: sources.slice(0,2).map((s) => s.id), strength: 'weak' });
  }

  const categoryContextFor: Record<string, string> = {
    health: 'Clinical studies or institutional health guidance provides support for some aspects of this claim',
    science: 'Published research findings align with core elements of this claim',
    environment: 'Environmental monitoring data or scientific assessments support key parts of this claim',
    technology: 'Industry data and technical analyses support the general direction of this claim',
    politics: 'Official records, policy documents, or nonpartisan analyses support elements of this claim',
    economics: 'Economic data and institutional analyses support the trend described in this claim',
  };

  const categoryContextAgainst: Record<string, string> = {
    health: 'Health claims are complex — individual variation, study limitations, and evolving research mean certainty is hard to achieve',
    science: 'Scientific understanding evolves, and current evidence may be preliminary, contested, or limited in scope',
    environment: 'Environmental systems are complex, and claims often oversimplify interactions between variables',
    technology: 'Technology predictions frequently overestimate speed of adoption and underestimate barriers',
    politics: 'Political claims often involve selective framing, and the full picture is usually more nuanced',
    economics: 'Economic claims are sensitive to timeframes, methodology choices, and which variables are included',
  };

  if (categoryContextFor[category] && args.filter((a) => a.side === 'supporting').length < 3) {
    args.push({ side: 'supporting', argument_text: categoryContextFor[category], evidence_text: null, source_ids: forSources.slice(0,2).map((a) => a.source.id), strength: 'moderate' });
  }

  if (categoryContextAgainst[category] && args.filter((a) => a.side === 'opposing').length < 3) {
    args.push({ side: 'opposing', argument_text: categoryContextAgainst[category], evidence_text: null, source_ids: againstSources.slice(0,2).map((a) => a.source.id), strength: 'moderate' });
  }

  const strengthOrder = { strong: 0, moderate: 1, weak: 2 };
  const forArgs = args.filter((a) => a.side === 'supporting').sort((a, b) => strengthOrder[a.strength] - strengthOrder[b.strength]).slice(0,4);
  const againstArgs = args.filter((a) => a.side === 'opposing').sort((a, b) => strengthOrder[a.strength] - strengthOrder[b.strength]).slice(0,4);
  return [...forArgs, ...againstArgs];
}

// ── Analysis builder ──────────────────────────────────────────────────────────

function buildAnalysis(claimText: string, sources: SourceRecord[], category: string) {
  const highCred = sources.filter((s) => s.credibility_score >= 0.85);
  const count = highCred.length;

  let status = 'Under Debate';
  let evidenceQuality = 'Moderate';
  let summaryText: string;

  if (count === 0) {
    status = 'Insufficient Evidence';
    evidenceQuality = 'Limited';
    summaryText = 'Limited credible evidence is available to evaluate this claim comprehensively.';
  } else if (count >= 5) {
    evidenceQuality = 'High';
    summaryText = `Based on ${count} high-quality sources, this claim has been thoroughly evaluated. Multiple credible institutions and research bodies have examined this topic.`;
  } else {
    summaryText = `Based on ${count} credible source${count > 1 ? 's' : ''}, preliminary evidence is available. Further research may provide additional clarity.`;
  }

  const patterns: Record<string, string> = {
    health: 'Health claims often involve cherry-picking studies, confusing correlation with causation, or extrapolating from limited research. Individual variation and context matter significantly.',
    science: 'Scientific claims can be misleading when preliminary findings are presented as conclusive, when statistical significance is confused with practical significance, or when complex systems are oversimplified.',
    environment: 'Environmental claims frequently involve selective timeframes, geographic cherry-picking, or failure to account for systemic complexity and feedback loops.',
    technology: 'Technology predictions often extrapolate current trends linearly without accounting for regulatory, economic, or social friction. Capability does not equal adoption.',
    politics: 'Political claims are often misleading through selective statistics, false comparisons, or attributing complex multicausal outcomes to single factors.',
    economics: 'Economic claims can mislead through cherry-picked timeframes, failure to adjust for confounding variables, or presenting nominal rather than real values.',
    product: 'Product claims frequently involve exaggerated benefits, cherry-picked testimonials, or conflating association with causation.',
  };

  const takes = sources.slice(0,4).map((s) => `According to ${s.publisher}, ${s.snippet_text || 'evidence suggests nuanced interpretation of this claim.'}`);
  const { consensus, disputes } = findConsensusAndDisputes(sources, claimText);
  const arguments_ = buildArguments(sources, claimText, category);

  return {
    claimUpdate: {
      current_status: status,
      evidence_quality: evidenceQuality,
      summary_text: summaryText,
      misinformation_pattern_text: patterns[category] || 'Claims in this area often involve oversimplification of complex topics, selective evidence presentation, or confusion between correlation and causation.',
      updated_at: new Date().toISOString(),
    },
    takes,
    consensus,
    disputes,
    arguments: arguments_,
  };
}

// ── Background analysis ───────────────────────────────────────────────────────

async function runAnalysis(claimId: string, claimText: string, category: string) {
  const supabase = getSupabaseAdmin();

  const { data: claimRunData } = await supabase
    .from('claim_runs')
    .insert({ claim_id: claimId, run_status: 'pending' })
    .select()
    .single();

  if (!claimRunData) return;

  let tavilyResults: TavilyResult[] = [];
  try {
    tavilyResults = await searchTavily(claimText);
  } catch (err) {
    console.error('Tavily search failed:', err);
  }

  if (tavilyResults.length === 0) {
    await supabase.from('claims').update({ current_status: 'Insufficient Evidence', evidence_quality: 'Limited', summary_text: 'Not enough credible sources were found to evaluate this claim.', misinformation_pattern_text: 'Unable to verify due to lack of credible sources.' }).eq('id', claimId);
    await supabase.from('claim_runs').update({ run_status: 'completed', completed_at: new Date().toISOString() }).eq('id', claimRunData.id);
    return;
  }

  const insertedSources: SourceRecord[] = [];
  for (const r of tavilyResults) {
    const { data } = await supabase.from('sources').insert({
      claim_id: claimId,
      claim_run_id: claimRunData.id,
      url: r.url,
      title: r.title,
      publisher: extractPublisher(r.url),
      source_type: classifySourceType(r.url),
      region: null,
      publish_date: r.published_date ?? null,
      snippet_text: r.content?.substring(0, 500) || null,
      credibility_score: credibilityScore(r.url),
      retrieval_method: 'tavily_search',
    }).select('id, publisher, snippet_text, credibility_score, source_type, title').single();
    if (data) insertedSources.push(data);
  }

  const analysis = buildAnalysis(claimText, insertedSources, category);

  await supabase.from('claims').update(analysis.claimUpdate).eq('id', claimId);

  if (analysis.takes.length > 0) {
    await supabase.from('claim_takes').insert(analysis.takes.map((t, i) => ({ claim_id: claimId, claim_run_id: claimRunData.id, take_text: t, display_order: i })));
  }

  if (analysis.consensus.length > 0) {
    await supabase.from('claim_consensus_points').insert(analysis.consensus.map((p, i) => ({ claim_id: claimId, claim_run_id: claimRunData.id, point_text: p.text, source_ids: p.sourceIds, display_order: i })));
  }

  if (analysis.disputes.length > 0) {
    await supabase.from('claim_disputes').insert(analysis.disputes.map((p, i) => ({ claim_id: claimId, claim_run_id: claimRunData.id, point_text: p.text, source_ids: p.sourceIds, display_order: i })));
  }

  if (analysis.arguments.length > 0) {
    await supabase.from('claim_arguments').insert(analysis.arguments.map((a, i) => ({ claim_id: claimId, claim_run_id: claimRunData.id, side: a.side, argument_text: a.argument_text, evidence_text: a.evidence_text, source_ids: a.source_ids, strength: a.strength, display_order: i })));
  }

  await supabase.from('claim_runs').update({ run_status: 'completed', completed_at: new Date().toISOString() }).eq('id', claimRunData.id);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { claimText } = await req.json();

    if (!claimText || typeof claimText !== 'string') {
      return NextResponse.json({ error: 'Claim text is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const normalizedText = claimText.toLowerCase().trim();

    const { data: existingClaim } = await supabase
      .from('claims')
      .select('id')
      .eq('normalized_text', normalizedText)
      .maybeSingle();

    if (existingClaim) {
      return NextResponse.json({ claimId: existingClaim.id, existing: true });
    }

    const category = classifyCategory(claimText);

    const { data: claimRow, error: insertError } = await supabase
      .from('claims')
      .insert({ original_text: claimText, normalized_text: normalizedText, category, current_status: 'Under Analysis', evidence_quality: 'Pending', summary_text: 'Analysis in progress...' })
      .select()
      .single();

    if (insertError) throw insertError;

    waitUntil(runAnalysis(claimRow.id, claimText, category).catch((err) => console.error('Background analysis error:', err)));

    return NextResponse.json({ claimId: claimRow.id, existing: false });
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 500 });
  }
}
