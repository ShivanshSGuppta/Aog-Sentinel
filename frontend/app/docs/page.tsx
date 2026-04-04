"use client";

import { useState } from "react";
import { FileSearch, Search, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { SAMPLE_DOC_QUERIES } from "@/lib/constants";
import type { DocSearchResult } from "@/lib/types";

export default function DocsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function runSearch(nextQuery: string) {
    setQuery(nextQuery);
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const data = await api.searchDocuments(nextQuery);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to search maintenance documents.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Document Retrieval"
        title="Technical document assistant"
        description="Natural-language retrieval over maintenance excerpts, MEL notes, vendor bulletins, and reliability procedures."
      />

      <section className="panel grid gap-6 p-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask for autopilot, hydraulic, IFE, or fault isolation guidance" />
            <Button onClick={() => runSearch(query)} disabled={query.trim().length < 3 || loading}>
              <Search className="h-4 w-4" />
              Search
            </Button>
          </div>
          <p className="mt-3 text-sm text-slate-500">Retrieval only. Results surface relevant technical references but do not generate maintenance advice.</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Suggested Engineering Queries</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SAMPLE_DOC_QUERIES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => runSearch(item)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-left text-sm text-slate-600 transition hover:border-aqua hover:text-ink-900"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <LoadingState title="Searching manual excerpts" description="Building the most relevant document matches for the engineering query." />
      ) : error ? (
        <EmptyState title="Document search unavailable" description={error} />
      ) : !hasSearched ? (
        <EmptyState title="Run an engineering query" description="Start with one of the suggested prompts or enter a natural-language maintenance reference question." icon={FileSearch} />
      ) : results.length === 0 ? (
        <EmptyState title="No relevant excerpts found" description="Try a broader technical query with the system, symptom, or maintenance task phrasing." icon={Sparkles} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {results.map((result) => (
            <Card key={result.chunk_id} className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{result.source_doc}</p>
                    <CardTitle className="mt-2">{result.section_title}</CardTitle>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge value={result.search_mode} />
                    <span className="text-sm font-semibold text-ink-900">Score {result.score.toFixed(4)}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-sm leading-7 text-slate-600">{result.text}</CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
