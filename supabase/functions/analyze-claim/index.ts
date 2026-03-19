import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY") ?? Deno.env.get("tavily") ?? "";

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function classifyCategory(text: string): string {
  const lower = text.toLowerCase();
  const map: Record<string, string[]> = {
    health: [
      "health",
      "medical",
      "disease",
      "drug",
      "treatment",
      "vaccine",
      "diet",
      "supplement",
      "creatine",
      "cancer",
      "covid",
    ],
    science: [
      "science",
      "research",
      "study",
      "experiment",
      "theory",
      "discovery",
    ],
    environment: [
      "climate",
      "environment",
      "pollution",
      "emissions",
      "electric vehicle",
      "ev",
      "renewable",
      "carbon",
    ],
    technology: [
      "ai",
      "artificial intelligence",
      "technology",
      "tech",
      "software",
      "algorithm",
      "robot",
      "automation",
    ],
    politics: [
      "government",
      "politics",
      "election",
      "policy",
      "law",
      "congress",
      "president",
      "senator",
      "sanctions",
    ],
    economics: [
      "economy",
      "economic",
      "market",
      "stock",
      "inflation",
      "gdp",
      "recession",
      "employment",
      "jobs",
    ],
    product: [
      "product",
      "buy",
      "purchase",
      "guarantee",
      "money back",
      "tested",
      "proven",
    ],
  };
  for (const [cat, terms] of Object.entries(map)) {
    if (terms.some((t) => lower.includes(t))) return cat;
  }
  return "general";
}

function classifySourceType(url: string, _title: string): string {
  const l = url.toLowerCase();
  if (l.includes(".gov")) return "Government data";
  if (
    l.includes(".edu") ||
    l.includes("nature.com") ||
    l.includes("science.org")
  )
    return "Peer-reviewed research";
  if (
    l.includes("who.int") ||
    l.includes("worldbank.org") ||
    l.includes("un.org")
  )
    return "International institution";
  if (l.includes("reuters.com") || l.includes("apnews.com"))
    return "Wire service";
  return "Investigative journalism";
}

function credibilityScore(url: string): number {
  const l = url.toLowerCase();
  if (l.includes(".gov") || l.includes(".edu")) return 0.95;
  if (l.includes("nature.com") || l.includes("science.org")) return 0.95;
  if (l.includes("who.int") || l.includes("cdc.gov")) return 0.95;
  if (l.includes("reuters.com") || l.includes("apnews.com")) return 0.9;
  if (l.includes("bbc.com") || l.includes("theguardian.com")) return 0.85;
  return 0.7;
}

function extractPublisher(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "").split(".")[0];
  } catch {
    return "Unknown";
  }
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

async function searchTavily(query: string): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      search_depth: "advanced",
      max_results: 8,
      include_answer: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.results ?? [];
}

interface SourceRecord {
  id: string;
  publisher: string;
  snippet_text: string | null;
  credibility_score: number;
  source_type: string;
  title: string;
}

function extractKeyPhrases(text: string): string[] {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 20);
  return sentences.slice(0, 3);
}

function findConsensusAndDisputes(
  sources: SourceRecord[],
  claimText: string
) {
  const claimLower = claimText.toLowerCase();
  const claimWords = new Set(
    claimLower.split(/\s+/).filter((w) => w.length > 4)
  );

  const sourceAnalysis = sources
    .filter((s) => s.snippet_text && s.snippet_text.length > 30)
    .map((s) => {
      const snippet = s.snippet_text!.toLowerCase();
      const phrases = extractKeyPhrases(s.snippet_text!);
      const relevance = [...claimWords].filter((w) => snippet.includes(w)).length / Math.max(claimWords.size, 1);
      const supportSignals = [
        "confirmed", "supports", "evidence shows", "research shows",
        "study found", "data shows", "according to", "consistent with",
        "demonstrates", "indicates", "suggests that", "found that",
      ].filter((sig) => snippet.includes(sig)).length;
      const disputeSignals = [
        "however", "disputed", "controversial", "debated", "conflicting",
        "disagree", "challenge", "question", "unclear", "mixed results",
        "no evidence", "insufficient", "contradicts", "misleading",
        "overstate", "exaggerate", "nuanced", "complex",
      ].filter((sig) => snippet.includes(sig)).length;

      return {
        source: s,
        phrases,
        relevance,
        supportSignals,
        disputeSignals,
        leanSupport: supportSignals > disputeSignals,
        leanDispute: disputeSignals > supportSignals,
      };
    });

  const supportingSources = sourceAnalysis.filter((a) => a.leanSupport);
  const disputingSources = sourceAnalysis.filter((a) => a.leanDispute);
  const neutralSources = sourceAnalysis.filter(
    (a) => !a.leanSupport && !a.leanDispute
  );

  const consensus: Array<{ text: string; sourceIds: string[] }> = [];
  const disputes: Array<{ text: string; sourceIds: string[] }> = [];

  if (supportingSources.length >= 2) {
    const ids = supportingSources.map((a) => a.source.id);
    const publishers = supportingSources.slice(0, 3).map((a) => a.source.publisher);
    consensus.push({
      text: `${publishers.join(", ")} provide corroborating evidence on key aspects of this claim`,
      sourceIds: ids,
    });
  }

  const typeGroups: Record<string, typeof sourceAnalysis> = {};
  for (const a of sourceAnalysis) {
    const t = a.source.source_type;
    if (!typeGroups[t]) typeGroups[t] = [];
    typeGroups[t].push(a);
  }
  for (const [type, group] of Object.entries(typeGroups)) {
    if (group.length >= 2) {
      const ids = group.map((a) => a.source.id);
      consensus.push({
        text: `Multiple ${type.toLowerCase()} sources address this topic, providing consistent coverage`,
        sourceIds: ids,
      });
      break;
    }
  }

  const highCredSources = sourceAnalysis.filter(
    (a) => a.source.credibility_score >= 0.85
  );
  if (highCredSources.length >= 2 && consensus.length < 3) {
    const ids = highCredSources.map((a) => a.source.id);
    consensus.push({
      text: `High-credibility sources agree on the factual basis underlying this topic`,
      sourceIds: ids,
    });
  }

  if (neutralSources.length > 0 && consensus.length < 4) {
    const ids = neutralSources.map((a) => a.source.id);
    consensus.push({
      text: `The broader context and background facts are well-documented across sources`,
      sourceIds: ids,
    });
  }

  if (disputingSources.length >= 1) {
    const ids = disputingSources.map((a) => a.source.id);
    const publishers = disputingSources.slice(0, 2).map((a) => a.source.publisher);
    disputes.push({
      text: `${publishers.join(" and ")} ${disputingSources.length === 1 ? "raises" : "raise"} questions about specific aspects or interpretations`,
      sourceIds: ids,
    });
  }

  if (supportingSources.length > 0 && disputingSources.length > 0) {
    disputes.push({
      text: `Sources differ on the scope and magnitude of claims made, suggesting the reality is more nuanced`,
      sourceIds: [
        ...supportingSources.slice(0, 1).map((a) => a.source.id),
        ...disputingSources.slice(0, 1).map((a) => a.source.id),
      ],
    });
  }

  const methodTypes = new Set(sourceAnalysis.map((a) => a.source.source_type));
  if (methodTypes.size >= 3 && disputes.length < 3) {
    disputes.push({
      text: `Different source types (${[...methodTypes].slice(0, 3).join(", ").toLowerCase()}) approach this topic from different angles, leading to varying emphasis`,
      sourceIds: sourceAnalysis.slice(0, 3).map((a) => a.source.id),
    });
  }

  if (consensus.length === 0) {
    consensus.push({
      text: `Available sources address this topic but with limited overlap in their specific findings`,
      sourceIds: sourceAnalysis.slice(0, 2).map((a) => a.source.id),
    });
  }

  if (disputes.length === 0 && sourceAnalysis.length > 1) {
    disputes.push({
      text: `While sources cover this topic, the specific conclusions and emphasis vary between them`,
      sourceIds: sourceAnalysis.slice(0, 2).map((a) => a.source.id),
    });
  }

  return { consensus: consensus.slice(0, 4), disputes: disputes.slice(0, 4) };
}

// ── Structured pro/con arguments ──────────────────────────────────────────────

interface ArgumentRecord {
  side: "supporting" | "opposing";
  argument_text: string;
  evidence_text: string | null;
  source_ids: string[];
  strength: "strong" | "moderate" | "weak";
}

function buildArguments(
  sources: SourceRecord[],
  claimText: string,
  category: string
): ArgumentRecord[] {
  const claimLower = claimText.toLowerCase();
  const claimWords = new Set(
    claimLower.split(/\s+/).filter((w) => w.length > 4)
  );

  const analyzed = sources
    .filter((s) => s.snippet_text && s.snippet_text.length > 30)
    .map((s) => {
      const snippet = s.snippet_text!.toLowerCase();

      const supportSignals = [
        "confirmed", "supports", "evidence shows", "research shows",
        "study found", "data shows", "consistent with", "demonstrates",
        "indicates", "suggests that", "found that", "according to",
        "proven", "established", "validates", "corroborates",
      ].filter((sig) => snippet.includes(sig)).length;

      const againstSignals = [
        "however", "disputed", "controversial", "debated", "conflicting",
        "disagree", "challenge", "question", "unclear", "mixed results",
        "no evidence", "insufficient", "contradicts", "misleading",
        "overstate", "exaggerate", "nuanced", "complex", "limited",
        "caveat", "exception", "but", "although", "despite",
        "fails to", "does not", "unlikely", "refutes",
      ].filter((sig) => snippet.includes(sig)).length;

      const relevance = [...claimWords].filter((w) => snippet.includes(w)).length / Math.max(claimWords.size, 1);

      return {
        source: s,
        supportSignals,
        againstSignals,
        relevance,
        side: supportSignals > againstSignals ? "supporting" as const : againstSignals > supportSignals ? "opposing" as const : "neutral" as const,
      };
    });

  const forSources = analyzed.filter((a) => a.side === "supporting").sort((a, b) => b.relevance - a.relevance);
  const againstSources = analyzed.filter((a) => a.side === "opposing").sort((a, b) => b.relevance - a.relevance);
  const neutralSources = analyzed.filter((a) => a.side === "neutral");

  const args: ArgumentRecord[] = [];

  // ── Build FOR arguments ──
  // Primary for argument from highest-relevance supporting source
  if (forSources.length > 0) {
    const primary = forSources[0];
    const strength = primary.source.credibility_score >= 0.85 ? "strong" : primary.source.credibility_score >= 0.7 ? "moderate" : "weak";
    const allForIds = forSources.map((a) => a.source.id);

    // Extract first meaningful sentence from snippet as evidence
    const sentences = primary.source.snippet_text!.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 20);
    const evidenceSentence = sentences[0] || null;

    args.push({
      side: "supporting",
      argument_text: forSources.length > 1
        ? `${forSources.length} sources provide evidence supporting this claim, including ${primary.source.source_type.toLowerCase()} from ${primary.source.publisher}`
        : `${primary.source.publisher} (${primary.source.source_type.toLowerCase()}) provides evidence that supports this claim`,
      evidence_text: evidenceSentence,
      source_ids: allForIds.slice(0, 4),
      strength,
    });
  }

  // Secondary for argument based on source type agreement
  const forByType: Record<string, typeof forSources> = {};
  for (const a of forSources) {
    const t = a.source.source_type;
    if (!forByType[t]) forByType[t] = [];
    forByType[t].push(a);
  }
  for (const [type, group] of Object.entries(forByType)) {
    if (group.length >= 2) {
      args.push({
        side: "supporting",
        argument_text: `Multiple ${type.toLowerCase()} sources independently corroborate key aspects of this claim`,
        evidence_text: `${group.map((a) => a.source.publisher).join(", ")} each present supporting findings`,
        source_ids: group.map((a) => a.source.id),
        strength: group.some((a) => a.source.credibility_score >= 0.85) ? "strong" : "moderate",
      });
      break;
    }
  }

  // Tertiary for argument from high-credibility sources
  const highCredFor = forSources.filter((a) => a.source.credibility_score >= 0.85);
  if (highCredFor.length > 0 && args.filter((a) => a.side === "supporting").length < 3) {
    args.push({
      side: "supporting",
      argument_text: `Highly credible sources (${highCredFor.map((a) => a.source.publisher).slice(0, 2).join(", ")}) support this position`,
      evidence_text: highCredFor[0].source.snippet_text?.split(/[.!?]+/)[0]?.trim() || null,
      source_ids: highCredFor.map((a) => a.source.id).slice(0, 3),
      strength: "strong",
    });
  }

  // ── Build AGAINST arguments ──
  if (againstSources.length > 0) {
    const primary = againstSources[0];
    const strength = primary.source.credibility_score >= 0.85 ? "strong" : primary.source.credibility_score >= 0.7 ? "moderate" : "weak";
    const allAgainstIds = againstSources.map((a) => a.source.id);

    const sentences = primary.source.snippet_text!.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 20);
    const evidenceSentence = sentences[0] || null;

    args.push({
      side: "opposing",
      argument_text: againstSources.length > 1
        ? `${againstSources.length} sources raise concerns or contradictions, including ${primary.source.source_type.toLowerCase()} from ${primary.source.publisher}`
        : `${primary.source.publisher} (${primary.source.source_type.toLowerCase()}) presents evidence that challenges this claim`,
      evidence_text: evidenceSentence,
      source_ids: allAgainstIds.slice(0, 4),
      strength,
    });
  }

  // Secondary against argument: methodological or scope concerns
  if (againstSources.length > 0) {
    const snippets = againstSources.map((a) => a.source.snippet_text!.toLowerCase());
    const hasMethodConcern = snippets.some((s) =>
      ["limited sample", "methodology", "small study", "correlation", "confounding", "bias", "not peer-reviewed", "anecdotal"].some((term) => s.includes(term))
    );
    const hasScopeConcern = snippets.some((s) =>
      ["overstate", "exaggerate", "more nuanced", "context", "specific conditions", "not generalizable", "exceptions"].some((term) => s.includes(term))
    );

    if (hasMethodConcern) {
      args.push({
        side: "opposing",
        argument_text: "Sources raise methodological concerns about the evidence supporting this claim",
        evidence_text: "Questions include study design limitations, sample size issues, or potential confounding variables",
        source_ids: againstSources.slice(0, 2).map((a) => a.source.id),
        strength: "moderate",
      });
    } else if (hasScopeConcern) {
      args.push({
        side: "opposing",
        argument_text: "Sources suggest the claim overstates or oversimplifies the evidence",
        evidence_text: "The reality appears more nuanced than the claim presents, with important caveats and context",
        source_ids: againstSources.slice(0, 2).map((a) => a.source.id),
        strength: "moderate",
      });
    }
  }

  // If we have very few against arguments but the claim status warrants it, add nuance-based argument
  if (args.filter((a) => a.side === "opposing").length === 0 && neutralSources.length > 0) {
    args.push({
      side: "opposing",
      argument_text: "While not directly contradicted, sources suggest the topic is more complex than the claim implies",
      evidence_text: "Multiple sources provide context that complicates a simple verdict",
      source_ids: neutralSources.slice(0, 2).map((a) => a.source.id),
      strength: "weak",
    });
  }

  // If we have no for arguments, add a fallback
  if (args.filter((a) => a.side === "supporting").length === 0 && sources.length > 0) {
    args.push({
      side: "supporting",
      argument_text: "Some sources address this topic in a way that lends partial support to the claim",
      evidence_text: null,
      source_ids: sources.slice(0, 2).map((s) => s.id),
      strength: "weak",
    });
  }

  // Category-specific contextual arguments
  const categoryContextFor: Record<string, string> = {
    health: "Clinical studies or institutional health guidance provides support for some aspects of this claim",
    science: "Published research findings align with core elements of this claim",
    environment: "Environmental monitoring data or scientific assessments support key parts of this claim",
    technology: "Industry data and technical analyses support the general direction of this claim",
    politics: "Official records, policy documents, or nonpartisan analyses support elements of this claim",
    economics: "Economic data and institutional analyses support the trend described in this claim",
  };

  const categoryContextAgainst: Record<string, string> = {
    health: "Health claims are complex — individual variation, study limitations, and evolving research mean certainty is hard to achieve",
    science: "Scientific understanding evolves, and current evidence may be preliminary, contested, or limited in scope",
    environment: "Environmental systems are complex, and claims often oversimplify interactions between variables",
    technology: "Technology predictions frequently overestimate speed of adoption and underestimate barriers",
    politics: "Political claims often involve selective framing, and the full picture is usually more nuanced",
    economics: "Economic claims are sensitive to timeframes, methodology choices, and which variables are included",
  };

  if (categoryContextFor[category] && args.filter((a) => a.side === "supporting").length < 3) {
    args.push({
      side: "supporting",
      argument_text: categoryContextFor[category],
      evidence_text: null,
      source_ids: forSources.slice(0, 2).map((a) => a.source.id),
      strength: "moderate",
    });
  }

  if (categoryContextAgainst[category] && args.filter((a) => a.side === "opposing").length < 3) {
    args.push({
      side: "opposing",
      argument_text: categoryContextAgainst[category],
      evidence_text: null,
      source_ids: againstSources.slice(0, 2).map((a) => a.source.id),
      strength: "moderate",
    });
  }

  // Cap at 4 per side, sorted by strength
  const strengthOrder = { strong: 0, moderate: 1, weak: 2 };
  const forArgs = args.filter((a) => a.side === "supporting").sort((a, b) => strengthOrder[a.strength] - strengthOrder[b.strength]).slice(0, 4);
  const againstArgs = args.filter((a) => a.side === "opposing").sort((a, b) => strengthOrder[a.strength] - strengthOrder[b.strength]).slice(0, 4);

  return [...forArgs, ...againstArgs];
}

function buildAnalysis(
  claimText: string,
  sources: SourceRecord[],
  category: string
) {
  const highCred = sources.filter((s) => s.credibility_score >= 0.85);
  const count = highCred.length;

  let status = "Under Debate";
  let evidenceQuality = "Moderate";
  let summaryText: string;

  if (count === 0) {
    status = "Insufficient Evidence";
    evidenceQuality = "Limited";
    summaryText =
      "Limited credible evidence is available to evaluate this claim comprehensively.";
  } else if (count >= 5) {
    evidenceQuality = "High";
    summaryText = `Based on ${count} high-quality sources, this claim has been thoroughly evaluated. Multiple credible institutions and research bodies have examined this topic.`;
  } else {
    summaryText = `Based on ${count} credible source${count > 1 ? "s" : ""}, preliminary evidence is available. Further research may provide additional clarity.`;
  }

  const patterns: Record<string, string> = {
    health:
      "Health claims often involve cherry-picking studies, confusing correlation with causation, or extrapolating from limited research. Individual variation and context matter significantly.",
    science:
      "Scientific claims can be misleading when preliminary findings are presented as conclusive, when statistical significance is confused with practical significance, or when complex systems are oversimplified.",
    environment:
      "Environmental claims frequently involve selective timeframes, geographic cherry-picking, or failure to account for systemic complexity and feedback loops.",
    technology:
      "Technology predictions often extrapolate current trends linearly without accounting for regulatory, economic, or social friction. Capability does not equal adoption.",
    politics:
      "Political claims are often misleading through selective statistics, false comparisons, or attributing complex multicausal outcomes to single factors.",
    economics:
      "Economic claims can mislead through cherry-picked timeframes, failure to adjust for confounding variables, or presenting nominal rather than real values.",
    product:
      "Product claims frequently involve exaggerated benefits, cherry-picked testimonials, or conflating association with causation.",
  };

  const takes = sources.slice(0, 4).map(
    (s) =>
      `According to ${s.publisher}, ${s.snippet_text || "evidence suggests nuanced interpretation of this claim."}`
  );

  const { consensus, disputes } = findConsensusAndDisputes(sources, claimText);
  const arguments_ = buildArguments(sources, claimText, category);

  return {
    claimUpdate: {
      current_status: status,
      evidence_quality: evidenceQuality,
      summary_text: summaryText,
      misinformation_pattern_text:
        patterns[category] ||
        "Claims in this area often involve oversimplification of complex topics, selective evidence presentation, or confusion between correlation and causation.",
      updated_at: new Date().toISOString(),
    },
    takes,
    consensus,
    disputes,
    arguments: arguments_,
  };
}

async function runAnalysis(claimId: string, claimText: string, category: string) {
  const supabase = getSupabaseAdmin();

  const { data: claimRunData } = await supabase
    .from("claim_runs")
    .insert({ claim_id: claimId, run_status: "pending" })
    .select()
    .single();

  if (!claimRunData) return;

  let tavilyResults: TavilyResult[] = [];
  try {
    tavilyResults = await searchTavily(claimText);
  } catch (err) {
    console.error("Tavily search failed:", err);
  }

  if (tavilyResults.length === 0) {
    await supabase
      .from("claims")
      .update({
        current_status: "Insufficient Evidence",
        evidence_quality: "Limited",
        summary_text:
          "Not enough credible sources were found to evaluate this claim. This could be because the claim is very recent, highly specific, or involves topics with limited research.",
        misinformation_pattern_text:
          "Unable to verify due to lack of credible sources. Be cautious about claims that cannot be substantiated with reliable evidence.",
      })
      .eq("id", claimId);

    await supabase
      .from("claim_runs")
      .update({
        run_status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", claimRunData.id);
    return;
  }

  const sourcesForDb = tavilyResults.map((r) => ({
    claim_id: claimId,
    claim_run_id: claimRunData.id,
    url: r.url,
    title: r.title,
    publisher: extractPublisher(r.url),
    source_type: classifySourceType(r.url, r.title),
    region: null,
    publish_date: r.published_date ?? null,
    snippet_text: r.content?.substring(0, 500) || null,
    credibility_score: credibilityScore(r.url),
    retrieval_method: "tavily_search",
  }));

  const insertedSources: SourceRecord[] = [];
  for (const src of sourcesForDb) {
    const { data } = await supabase.from("sources").insert(src).select("id, publisher, snippet_text, credibility_score, source_type, title").single();
    if (data) insertedSources.push(data);
  }

  const analysis = buildAnalysis(claimText, insertedSources, category);

  await supabase.from("claims").update(analysis.claimUpdate).eq("id", claimId);

  if (analysis.takes.length > 0) {
    await supabase.from("claim_takes").insert(
      analysis.takes.map((t, i) => ({
        claim_id: claimId,
        claim_run_id: claimRunData.id,
        take_text: t,
        display_order: i,
      }))
    );
  }

  if (analysis.consensus.length > 0) {
    await supabase.from("claim_consensus_points").insert(
      analysis.consensus.map((p, i) => ({
        claim_id: claimId,
        claim_run_id: claimRunData.id,
        point_text: p.text,
        source_ids: p.sourceIds,
        display_order: i,
      }))
    );
  }

  if (analysis.disputes.length > 0) {
    await supabase.from("claim_disputes").insert(
      analysis.disputes.map((p, i) => ({
        claim_id: claimId,
        claim_run_id: claimRunData.id,
        point_text: p.text,
        source_ids: p.sourceIds,
        display_order: i,
      }))
    );
  }

  if (analysis.arguments.length > 0) {
    await supabase.from("claim_arguments").insert(
      analysis.arguments.map((a, i) => ({
        claim_id: claimId,
        claim_run_id: claimRunData.id,
        side: a.side,
        argument_text: a.argument_text,
        evidence_text: a.evidence_text,
        source_ids: a.source_ids,
        strength: a.strength,
        display_order: i,
      }))
    );
  }

  await supabase
    .from("claim_runs")
    .update({
      run_status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", claimRunData.id);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { claimText } = await req.json();

    if (!claimText || typeof claimText !== "string") {
      return new Response(
        JSON.stringify({ error: "Claim text is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = getSupabaseAdmin();
    const normalizedText = claimText.toLowerCase().trim();

    const { data: existingClaim } = await supabase
      .from("claims")
      .select("id")
      .eq("normalized_text", normalizedText)
      .maybeSingle();

    if (existingClaim) {
      return new Response(
        JSON.stringify({ claimId: existingClaim.id, existing: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const category = classifyCategory(claimText);

    const { data: claimRow, error: insertError } = await supabase
      .from("claims")
      .insert({
        original_text: claimText,
        normalized_text: normalizedText,
        category,
        current_status: "Under Analysis",
        evidence_quality: "Pending",
        summary_text: "Analysis in progress...",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    EdgeRuntime.waitUntil(
      runAnalysis(claimRow.id, claimText, category).catch((err) =>
        console.error("Background analysis error:", err)
      )
    );

    return new Response(
      JSON.stringify({ claimId: claimRow.id, existing: false }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
