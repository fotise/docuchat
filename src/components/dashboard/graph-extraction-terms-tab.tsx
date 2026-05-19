import { useMemo, useState } from "react"
import { RotateCcw, Save, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DEFAULT_GRAPH_EXTRACTION_TERMS } from "@/lib/file-processing/graph-extraction"
import type { UploadedDocument, WorkspaceGraphExtractionTerms, GraphExtractionTermKey } from "@/types/dashboard"

interface GraphExtractionTermsTabProps {
  documents: UploadedDocument[]
  terms?: Partial<WorkspaceGraphExtractionTerms>
  updatedAt?: number
  onQueueAllDocumentsForReprocessing?: () => Promise<number> | number
  onSave: (terms: Partial<WorkspaceGraphExtractionTerms>) => Promise<void> | void
}

interface TermGroupConfig {
  description: string
  key: GraphExtractionTermKey
  label: string
  tone: string
}

const TERM_GROUPS: TermGroupConfig[] = [
  {
    key: "genericEntityTerms",
    label: "Generic entity terms",
    description: "Single words and short generic labels that should not become ontology entities.",
    tone: "text-sky-100",
  },
  {
    key: "layoutStartTerms",
    label: "Layout start terms",
    description: "Table/header words that identify short layout fragments when they appear at the beginning.",
    tone: "text-cyan-100",
  },
  {
    key: "layoutEndTerms",
    label: "Layout end terms",
    description: "Table/header words that identify short layout fragments when they appear at the end.",
    tone: "text-blue-100",
  },
  {
    key: "rasciActionTerms",
    label: "RASCI action terms",
    description: "Action verbs used to detect RASCI/process-diagram fragments such as L5 Approve.",
    tone: "text-amber-100",
  },
  {
    key: "processStateTerms",
    label: "Process state terms",
    description: "State/action words used to filter fragments such as OR Unknown, Recorded IT, or Template NA Fix.",
    tone: "text-orange-100",
  },
  {
    key: "toolEntityTerms",
    label: "Tool entity terms",
    description: "Tool names that can identify broken tool/action fragments while preserving full concepts like Alfabet Reference.",
    tone: "text-violet-100",
  },
  {
    key: "domainTopicPatterns",
    label: "Domain topic patterns",
    description: "Regular expressions for concepts that should be preserved as meaningful ontology topics.",
    tone: "text-emerald-100",
  },
  {
    key: "repeatedFooterPhrases",
    label: "Repeated footer phrases",
    description: "Repeated headers, footers, or boilerplate phrases to suppress during graph extraction.",
    tone: "text-rose-100",
  },
]

function mergeTerms(terms?: Partial<WorkspaceGraphExtractionTerms>): WorkspaceGraphExtractionTerms {
  return TERM_GROUPS.reduce((merged, group) => ({
    ...merged,
    [group.key]: terms?.[group.key] ?? DEFAULT_GRAPH_EXTRACTION_TERMS[group.key],
  }), {} as WorkspaceGraphExtractionTerms)
}

function serializeTerms(terms: WorkspaceGraphExtractionTerms) {
  return TERM_GROUPS.reduce((values, group) => ({
    ...values,
    [group.key]: terms[group.key].join("\n"),
  }), {} as Record<GraphExtractionTermKey, string>)
}

function parseTermList(value: string) {
  return Array.from(new Set(
    value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
  ))
}

function getRegexErrors(patterns: string[]) {
  return patterns.flatMap((pattern) => {
    try {
      new RegExp(pattern, "gi")
      return []
    } catch (error) {
      return [`${pattern}: ${error instanceof Error ? error.message : "Invalid regular expression"}`]
    }
  })
}

function formatUpdatedAt(updatedAt?: number) {
  return updatedAt ? new Date(updatedAt).toLocaleString() : "Default terms"
}

export function GraphExtractionTermsTab({
  documents,
  terms,
  updatedAt,
  onQueueAllDocumentsForReprocessing,
  onSave,
}: GraphExtractionTermsTabProps) {
  const [activeGroupKey, setActiveGroupKey] = useState<GraphExtractionTermKey>("genericEntityTerms")
  const [draftValues, setDraftValues] = useState(() => serializeTerms(mergeTerms(terms)))
  const [statusMessage, setStatusMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isQueueing, setIsQueueing] = useState(false)

  const draftTerms = useMemo(
    () => TERM_GROUPS.reduce((values, group) => ({
      ...values,
      [group.key]: parseTermList(draftValues[group.key] ?? ""),
    }), {} as WorkspaceGraphExtractionTerms),
    [draftValues]
  )
  const regexErrors = useMemo(
    () => getRegexErrors(draftTerms.domainTopicPatterns),
    [draftTerms.domainTopicPatterns]
  )
  const activeGroup = TERM_GROUPS.find((group) => group.key === activeGroupKey) ?? TERM_GROUPS[0]
  const processedDocuments = documents.filter((document) => document.processingStatus === "processed" || (!document.toBeProcessed && !document.processingStatus))
  const canQueueReprocessing = documents.length > 0 && Boolean(onQueueAllDocumentsForReprocessing)

  async function handleSave() {
    if (regexErrors.length > 0) {
      setStatusMessage("Fix invalid domain topic regular expressions before saving.")
      return
    }

    setIsSaving(true)
    try {
      await onSave(draftTerms)
      setStatusMessage("Graph extraction terms saved. Reprocess files to rebuild existing ontology data with these rules.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleResetDefaults() {
    setDraftValues(serializeTerms(DEFAULT_GRAPH_EXTRACTION_TERMS))
    setStatusMessage("Draft reset to application defaults. Save to apply this workspace override.")
  }

  async function handleSaveAndQueueAll() {
    if (!onQueueAllDocumentsForReprocessing) {
      return
    }

    if (regexErrors.length > 0) {
      setStatusMessage("Fix invalid domain topic regular expressions before reprocessing.")
      return
    }

    const confirmed = window.confirm(
      "Save these terms and queue all non-processing files for reprocessing? Existing chunks and extracted graph data for those files will be regenerated."
    )

    if (!confirmed) {
      return
    }

    setIsQueueing(true)
    try {
      await onSave(draftTerms)
      const queuedCount = await onQueueAllDocumentsForReprocessing()
      setStatusMessage(
        queuedCount > 0
          ? `Saved terms and queued ${queuedCount.toLocaleString()} files for reprocessing.`
          : "Saved terms. No eligible files were queued for reprocessing."
      )
    } finally {
      setIsQueueing(false)
    }
  }

  return (
    <div className="app-scrollbar h-full overflow-y-auto p-5">
      <div className="mb-4 rounded-2xl border border-sky-300/15 bg-sky-500/10 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-sky-100">Graph extraction terms</h3>
            <p className="mt-1 max-w-3xl text-xs leading-6 text-slate-300">
              Review and manage the workspace-specific terms used by ontology extraction. These rules are used when a file is processed; changing them does not automatically mutate existing graph data.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/25 px-3 py-2 text-xs text-slate-200">
            Updated: <span className="font-bold text-sky-100">{formatUpdatedAt(updatedAt)}</span>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-2 text-xs md:grid-cols-4" aria-label="Graph extraction terms summary">
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
          <span className="block text-[10px] uppercase tracking-[0.1em] text-sky-200/60">Term groups</span>
          <strong className="mt-1 block text-sm text-slate-50">{TERM_GROUPS.length}</strong>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
          <span className="block text-[10px] uppercase tracking-[0.1em] text-sky-200/60">Total entries</span>
          <strong className="mt-1 block text-sm text-slate-50">{TERM_GROUPS.reduce((total, group) => total + draftTerms[group.key].length, 0).toLocaleString()}</strong>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
          <span className="block text-[10px] uppercase tracking-[0.1em] text-sky-200/60">Processed files</span>
          <strong className="mt-1 block text-sm text-slate-50">{processedDocuments.length.toLocaleString()}</strong>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
          <span className="block text-[10px] uppercase tracking-[0.1em] text-sky-200/60">Regex errors</span>
          <strong className={regexErrors.length > 0 ? "mt-1 block text-sm text-rose-100" : "mt-1 block text-sm text-slate-50"}>{regexErrors.length}</strong>
        </div>
      </div>

      <div className="grid min-h-[440px] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="space-y-2" role="tablist" aria-label="Graph extraction term groups">
            {TERM_GROUPS.map((group) => (
              <button
                key={group.key}
                type="button"
                role="tab"
                aria-selected={activeGroupKey === group.key}
                onClick={() => setActiveGroupKey(group.key)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${activeGroupKey === group.key ? "border-sky-300/30 bg-sky-500/15" : "border-white/10 bg-slate-950/20 hover:bg-white/10"}`}
              >
                <span className={`block text-xs font-extrabold ${group.tone}`}>{group.label}</span>
                <span className="mt-1 block text-[11px] text-slate-400">{draftTerms[group.key].length.toLocaleString()} entries</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-2xl border border-sky-300/15 bg-slate-950/20 p-4" aria-label={`${activeGroup.label} editor`}>
          <div className="mb-3">
            <h3 className={`text-sm font-extrabold ${activeGroup.tone}`}>{activeGroup.label}</h3>
            <p className="mt-1 text-xs leading-6 text-slate-400">{activeGroup.description}</p>
          </div>

          <label className="block text-xs font-semibold text-slate-200">
            One entry per line or comma-separated
            <textarea
              value={draftValues[activeGroup.key] ?? ""}
              onChange={(event) => setDraftValues((current) => ({
                ...current,
                [activeGroup.key]: event.target.value,
              }))}
              aria-label={`${activeGroup.label} values`}
              spellCheck={false}
              className="app-scrollbar mt-2 min-h-[320px] w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 font-mono text-xs leading-6 text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/20"
            />
          </label>

          {activeGroup.key === "domainTopicPatterns" ? (
            <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-500/10 p-3 text-xs leading-6 text-emerald-50/90">
              <p className="font-bold">Regular expression mode</p>
              <p className="text-emerald-50/75">Patterns are compiled with global and case-insensitive flags during file processing.</p>
              {regexErrors.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-rose-100">
                  {regexErrors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-500/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-amber-100">Reprocessing policy</h3>
            <p className="mt-1 max-w-3xl text-xs leading-6 text-amber-50/80">
              Automatic term updates during file processing are possible, but this app keeps them as reviewable workspace settings. A file process should only create suggestions or use saved terms; it should not automatically requeue files. Existing files must be reprocessed to rebuild chunks, entities, and relations with changed extraction terms.
            </p>
            <p className="mt-2 text-xs leading-6 text-amber-50/70">
              To avoid infinite loops, the bulk action below only queues current non-processing files once after an explicit confirmation. Finished reprocessing does not trigger another term update or another bulk queue.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            <Button type="button" variant="secondary" onClick={() => void handleResetDefaults()} className="rounded-xl border border-white/10 bg-white/10 text-xs text-slate-100 hover:bg-white/15">
              <RotateCcw className="h-4 w-4" />
              Reset draft defaults
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving || isQueueing} className="rounded-xl bg-sky-500 text-xs text-white hover:bg-sky-400 disabled:opacity-50">
              <Save className="h-4 w-4" />
              {isSaving ? "Saving…" : "Save terms"}
            </Button>
            <Button type="button" onClick={() => void handleSaveAndQueueAll()} disabled={!canQueueReprocessing || isSaving || isQueueing} className="rounded-xl bg-amber-500 text-xs text-slate-950 hover:bg-amber-400 disabled:opacity-50">
              <Sparkles className="h-4 w-4" />
              {isQueueing ? "Queueing…" : "Save & reprocess files"}
            </Button>
          </div>
        </div>
      </div>

      {statusMessage ? (
        <p className="mt-3 rounded-xl border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-100" role="status">{statusMessage}</p>
      ) : null}
    </div>
  )
}
