import { useMemo, useState, type FormEvent, type ReactNode } from "react"
import { ChevronDown, Heart } from "lucide-react"
import ForceGraph2D, { type NodeObject } from "react-force-graph-2d"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { dashboardConfig } from "@/config/dashboard"
import { copyTextToClipboard, createRagDebugTraceJson, createRagDebugTraceMarkdown } from "@/lib/chat/debug-trace"
import { generateRagRetrievalContext, type RagRetrievalContext } from "@/lib/chat/rag-chat"
import { DEFAULT_MIN_SEMANTIC_SIMILARITY } from "@/lib/file-processing/semantic-search"
import { useLlmClient } from "@/lib/llm/context"
import type { RagDebugTrace, RetrievedContextChunk } from "@/lib/llm/types"
import { useDashboardStore } from "@/store/dashboard-store"
import { useWorkspaceStore } from "@/store/workspace-store"
import type { WorkspaceRouteConfig, WorkspaceSearchRetrievalMode } from "@/types/dashboard"
import { AppIcon } from "./icon"
import { IconPeaker } from "./icon-peaker"
import { MobileMenu } from "./mobile-menu"

interface HeaderProps {
  workspace: WorkspaceRouteConfig
}

interface HeaderChipProps {
  icon: ReactNode
  label: ReactNode
}

interface GraphViewNode {
  id: string
  selected: boolean
}

interface GraphViewLink {
  selected: boolean
  source: string
  target: string
  type: string
}

function HeaderChip({ icon, label }: HeaderChipProps) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,.45)]">
      {icon}
      <span>{label}</span>
    </div>
  )
}

export function Header({ workspace }: HeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [captureDebugTrace, setCaptureDebugTrace] = useState(false)
  const [includeDebugTraceExcerpts, setIncludeDebugTraceExcerpts] = useState(false)
  const [lastDebugTrace, setLastDebugTrace] = useState<RagDebugTrace | null>(null)
  const [searchResults, setSearchResults] = useState<RetrievedContextChunk[]>([])
  const [ragDebugContext, setRagDebugContext] = useState<RagRetrievalContext | null>(null)
  const [selectedGraphNode, setSelectedGraphNode] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const llmClient = useLlmClient()
  const activeTab = useDashboardStore(
    (state) => state.activeTabByWorkspace[workspace.id] ?? workspace.tabs[0]?.id ?? ""
  )
  const storedMessages = useDashboardStore(
    (state) => state.messagesByWorkspaceTab[workspace.id]?.[activeTab]
  )
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace)
  const updateWorkspaceIcon = useWorkspaceStore((state) => state.updateWorkspaceIcon)
  const updateWorkspaceSearchCriteria = useWorkspaceStore((state) => state.updateWorkspaceSearchCriteria)
  const { header } = dashboardConfig
  const currentView = workspace.views.find((view) => view.tabId === activeTab) ?? workspace.views[0]
  const activeTabLabel = workspace.tabs.find((tab) => tab.id === activeTab)?.label ?? workspace.tabs[0]?.label ?? ""
  const currentMessages = storedMessages ?? currentView?.initialMessages ?? []
  const semanticSearchThreshold = workspace.semanticSearchThreshold ?? DEFAULT_MIN_SEMANTIC_SIMILARITY
  const childMatchLimit = workspace.ragSearchChildMatchLimit ?? 40
  const graphSearchDepth = workspace.graphSearchDepth ?? 1
  const parentChunkLimit = workspace.ragSearchParentChunkLimit ?? 10
  const additionalQueries = workspace.additionalQueries ?? []
  const debugRetrievalMode = workspace.searchRetrievalMode ?? "semantic"
  const graphEntityQueries = workspace.graphEntityQueries ?? []
  const searchQuery = workspace.searchCriteriaQuery ?? ""
  const targetDocumentNames = workspace.targetDocumentNames ?? []
  const graphView = useMemo(() => {
    const nodes = Array.from(
      new Set(searchResults.flatMap((chunk) => chunk.graphEntityNames ?? []))
    ).slice(0, 12)
    const edges = searchResults.flatMap((chunk) => {
      const names = chunk.graphEntityNames ?? []
      const edgeType = chunk.graphEdgeTypes?.[0] ?? "related_to"

      if (names.length < 2) {
        return []
      }

      return names.slice(1).map((target) => ({
        source: names[0],
        target,
        type: edgeType,
      }))
    })

    return { edges, nodes }
  }, [searchResults])
  const forceGraphData = useMemo(() => ({
    nodes: graphView.nodes.map((node) => ({
      id: node,
      selected: selectedGraphNode === node,
    })),
    links: graphView.edges.slice(0, 18).map((edge) => ({
      source: edge.source,
      target: edge.target,
      type: edge.type,
      selected: selectedGraphNode === edge.source || selectedGraphNode === edge.target,
    })),
  }), [graphView, selectedGraphNode])

  function handleExploreClick() {
    setStatusMessage("Workspace explorer controls are not connected yet.")
  }

  function formatPageNumbers(pageNumbers: number[]) {
    return pageNumbers.length > 0 ? pageNumbers.join(", ") : "—"
  }

  function formatScore(score: number) {
    return `${Math.max(0, score * 100).toFixed(1)}%`
  }

  function formatSimilarity(similarity: number) {
    return similarity.toFixed(3)
  }

  function formatTextPreview(text: string) {
    return text.length > 120 ? `${text.slice(0, 120)}…` : text
  }

  function parseList(value: string) {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  async function handleRagDebugSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!searchQuery.trim()) {
      setSearchResults([])
      setRagDebugContext(null)
      return
    }

    setIsSearching(true)

    try {
      const context = await generateRagRetrievalContext({
        workspace,
        tabLabel: activeTabLabel,
        prompt: searchQuery,
        messages: currentMessages,
        llmClient,
        additionalQueries,
        childMatchLimit,
        debugTraceEnabled: captureDebugTrace,
        graphDepth: graphSearchDepth,
        graphEntityQueries,
        includeDebugTraceExcerpts,
        onDebugTrace: setLastDebugTrace,
        parentChunkLimit,
        retrievalModeOverride: debugRetrievalMode === "auto" ? undefined : debugRetrievalMode,
        targetDocumentNames,
      })

      setRagDebugContext(context)
      setLastDebugTrace(context.debugTrace ?? null)
      setSearchResults(context.retrievedChunks)
      setSelectedGraphNode("")
      setStatusMessage(context.retrievalError ?? "RAG simulation completed.")
    } catch (error) {
      setRagDebugContext(null)
      setSearchResults([])
      setStatusMessage(error instanceof Error ? error.message : "RAG simulation failed.")
    } finally {
      setIsSearching(false)
    }
  }

  async function handleCopyTrace(format: "json" | "markdown") {
    if (!lastDebugTrace) {
      setStatusMessage("No debug trace captured yet.")
      return
    }

    try {
      await copyTextToClipboard(
        format === "json"
          ? createRagDebugTraceJson(lastDebugTrace)
          : createRagDebugTraceMarkdown(lastDebugTrace)
      )
      setStatusMessage(`Debug trace copied as ${format.toUpperCase()}.`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not copy debug trace.")
    }
  }

  function handleThresholdChange(value: string) {
    const parsedValue = Number.parseFloat(value)

    if (!Number.isFinite(parsedValue)) {
      return
    }

    void updateWorkspaceSearchCriteria(workspace.id, {
      semanticSearchThreshold: parsedValue,
    })
  }

  function handleChildLimitChange(value: string) {
    const parsedValue = Number.parseInt(value, 10)

    if (!Number.isFinite(parsedValue)) {
      return
    }

    void updateWorkspaceSearchCriteria(workspace.id, {
      ragSearchChildMatchLimit: parsedValue,
    })
  }

  function handleParentLimitChange(value: string) {
    const parsedValue = Number.parseInt(value, 10)

    if (!Number.isFinite(parsedValue)) {
      return
    }

    void updateWorkspaceSearchCriteria(workspace.id, {
      ragSearchParentChunkLimit: parsedValue,
    })
  }

  function handleGraphDepthChange(value: string) {
    const parsedValue = Number.parseInt(value, 10)

    if (!Number.isFinite(parsedValue)) {
      return
    }

    void updateWorkspaceSearchCriteria(workspace.id, {
      graphSearchDepth: parsedValue,
    })
  }

  function handleRetrievalModeChange(value: string) {
    void updateWorkspaceSearchCriteria(workspace.id, {
      searchRetrievalMode: value as WorkspaceSearchRetrievalMode,
    })
  }

  function handleSearchQueryChange(value: string) {
    void updateWorkspaceSearchCriteria(workspace.id, {
      searchCriteriaQuery: value,
    })
  }

  function handleTargetDocumentNamesChange(value: string) {
    void updateWorkspaceSearchCriteria(workspace.id, {
      targetDocumentNames: parseList(value),
    })
  }

  function handleAdditionalQueriesChange(value: string) {
    void updateWorkspaceSearchCriteria(workspace.id, {
      additionalQueries: parseList(value),
    })
  }

  function handleGraphEntityQueriesChange(value: string) {
    void updateWorkspaceSearchCriteria(workspace.id, {
      graphEntityQueries: parseList(value),
    })
  }

  async function commitRename() {
    const trimmedTitle = draftTitle.trim()

    if (!trimmedTitle) {
      setIsRenaming(false)
      return
    }

    await renameWorkspace(workspace.id, trimmedTitle)
    setIsRenaming(false)
    setStatusMessage(`Workspace renamed to ${trimmedTitle}.`)
  }

  function cancelRename() {
    setIsRenaming(false)
  }

  function startRename() {
    setDraftTitle(workspace.title)
    setIsRenaming(true)
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-b border-white/10 bg-[linear-gradient(180deg,rgba(17,28,81,.95),rgba(10,18,52,.92))] px-4 md:px-5">
      <div className="flex min-w-0 items-center gap-3 py-3">
        <div className="md:hidden">
          <MobileMenu />
        </div>

        <IconPeaker
          value={workspace.navIcon}
          workspaceTitle={workspace.title}
          onChange={(icon) => void updateWorkspaceIcon(workspace.id, icon)}
        />

        <div className="min-w-0">
          {isRenaming ? (
            <input
              aria-label="Workspace name"
              autoFocus
              value={draftTitle}
              onBlur={() => void commitRename()}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void commitRename()
                }

                if (event.key === "Escape") {
                  cancelRename()
                }
              }}
              className="h-8 max-w-full rounded-lg border border-sky-400/30 bg-white/10 px-2 text-lg font-extrabold text-white outline-none ring-2 ring-sky-400/20 md:text-xl"
            />
          ) : (
            <button
              type="button"
              aria-label={`Rename workspace ${workspace.title}`}
              title="Double-click to rename workspace"
              onDoubleClick={startRename}
              className="max-w-full truncate text-left text-lg font-extrabold text-white outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-sky-400 md:text-xl"
            >
              {workspace.title}
              {workspace.isFavorite ? (
                <Heart className="ml-1 inline h-3.5 w-3.5 fill-sky-400 text-sky-400" />
              ) : null}
            </button>
          )}

          <div className="truncate text-sm text-slate-400">
            {workspace.documentCount} {workspace.documentLabel}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 py-3">
        <button
          type="button"
          aria-label="Open search criteria"
          title="Open search criteria"
          onClick={() => setIsSearchOpen(true)}
          className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,.45)] transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
        >
          <AppIcon name="search" className="h-4 w-4" />
          <span>{header.speedLabel}</span>
        </button>

        <HeaderChip
          icon={<AppIcon name="shield" className="h-4 w-4" />}
          label={
            <span className="flex items-center gap-1">
              {header.engineLabel}
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          }
        />

        <button
          type="button"
          aria-label="Open workspace explorer"
          title="Open workspace explorer"
          onClick={handleExploreClick}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,.45)]"
        >
          <AppIcon name="compass" className="h-4 w-4" />
        </button>

        <span className="sr-only" role="status">
          {statusMessage}
        </span>
      </div>

      {isSearchOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Search criteria"
        >
          <div className="app-scrollbar flex h-[80vh] max-h-[80vh] w-full max-w-7xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-[#111b4b] text-white shadow-[0_24px_70px_rgba(0,0,0,.55)]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/70">
                Search criteria
              </p>
              <h2 className="mt-2 text-lg font-extrabold leading-tight">
                Configure and simulate retrieval across {workspace.title}
              </h2>
              <form
                className="mt-4 grid gap-3"
                onSubmit={(event) => void handleRagDebugSearch(event)}
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
                  <Input
                    type="search"
                    aria-label="Search criteria query"
                    placeholder="Ask the same question you would ask in chat..."
                    value={searchQuery}
                    onChange={(event) => handleSearchQueryChange(event.target.value)}
                    className="h-10 rounded-xl border-white/10 bg-slate-950/30 text-sm text-slate-100 placeholder:text-slate-400 focus-visible:border-sky-300/60 focus-visible:ring-sky-300/20"
                  />
                  <Button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="h-10 rounded-xl bg-gradient-to-b from-blue-400 to-blue-700 text-white hover:from-blue-400 hover:to-blue-600 disabled:opacity-50"
                  >
                    {isSearching ? "Simulating..." : "Simulate RAG"}
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-6">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-200/70">
                      Retrieval mode
                    </span>
                    <select
                      aria-label="RAG retrieval mode"
                      value={debugRetrievalMode}
                      onChange={(event) => handleRetrievalModeChange(event.target.value)}
                      className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 text-sm text-slate-100 outline-none focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/20"
                    >
                      <option value="auto">Auto</option>
                      <option value="semantic">Semantic</option>
                      <option value="graph">Graph</option>
                      <option value="hybrid_graph">Hybrid Graph</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-200/70">
                      Similarity threshold
                    </span>
                    <Input
                      type="number"
                      aria-label="Semantic search threshold"
                      min={0}
                      max={0.95}
                      step={0.05}
                      value={semanticSearchThreshold}
                      onChange={(event) => handleThresholdChange(event.target.value)}
                      className="h-10 rounded-xl border-white/10 bg-slate-950/30 text-sm text-slate-100 focus-visible:border-sky-300/60 focus-visible:ring-sky-300/20"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-200/70">
                      Child matches
                    </span>
                    <Input
                      type="number"
                      aria-label="RAG child match limit"
                      min={5}
                      max={100}
                      step={5}
                      value={childMatchLimit}
                      onChange={(event) => handleChildLimitChange(event.target.value)}
                      className="h-10 rounded-xl border-white/10 bg-slate-950/30 text-sm text-slate-100 focus-visible:border-sky-300/60 focus-visible:ring-sky-300/20"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-200/70">
                      Parent chunks
                    </span>
                    <Input
                      type="number"
                      aria-label="RAG parent chunk limit"
                      min={1}
                      max={20}
                      step={1}
                      value={parentChunkLimit}
                      onChange={(event) => handleParentLimitChange(event.target.value)}
                      className="h-10 rounded-xl border-white/10 bg-slate-950/30 text-sm text-slate-100 focus-visible:border-sky-300/60 focus-visible:ring-sky-300/20"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-200/70">
                      Graph depth
                    </span>
                    <Input
                      type="number"
                      aria-label="Graph search depth"
                      min={1}
                      max={3}
                      step={1}
                      value={graphSearchDepth}
                      onChange={(event) => handleGraphDepthChange(event.target.value)}
                      className="h-10 rounded-xl border-white/10 bg-slate-950/30 text-sm text-slate-100 focus-visible:border-sky-300/60 focus-visible:ring-sky-300/20"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-200/70">
                      Target files
                    </span>
                    <Input
                      aria-label="RAG target document names"
                      placeholder="file.pdf, notes.docx"
                      value={targetDocumentNames.join(", ")}
                      onChange={(event) => handleTargetDocumentNamesChange(event.target.value)}
                      className="h-10 rounded-xl border-white/10 bg-slate-950/30 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-sky-300/60 focus-visible:ring-sky-300/20"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-200/70">
                      Extra queries
                    </span>
                    <Input
                      aria-label="RAG additional queries"
                      placeholder="query 1, query 2"
                      value={additionalQueries.join(", ")}
                      onChange={(event) => handleAdditionalQueriesChange(event.target.value)}
                      className="h-10 rounded-xl border-white/10 bg-slate-950/30 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-sky-300/60 focus-visible:ring-sky-300/20"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-200/70">
                      Graph entities
                    </span>
                    <Input
                      aria-label="Graph entity queries"
                      placeholder="Customer retention, Competitor A"
                      value={graphEntityQueries.join(", ")}
                      onChange={(event) => handleGraphEntityQueriesChange(event.target.value)}
                      className="h-10 rounded-xl border-white/10 bg-slate-950/30 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-sky-300/60 focus-visible:ring-sky-300/20"
                    />
                  </label>
                  <label className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/30 px-3 text-sm text-slate-100 md:col-span-2">
                    <input
                      type="checkbox"
                      checked={captureDebugTrace}
                      onChange={(event) => setCaptureDebugTrace(event.target.checked)}
                      className="h-4 w-4 accent-sky-400"
                    />
                    <span>Capture debug trace</span>
                  </label>
                  <label className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/30 px-3 text-sm text-slate-100 md:col-span-2">
                    <input
                      type="checkbox"
                      checked={includeDebugTraceExcerpts}
                      disabled={!captureDebugTrace}
                      onChange={(event) => setIncludeDebugTraceExcerpts(event.target.checked)}
                      className="h-4 w-4 accent-sky-400 disabled:opacity-50"
                    />
                    <span>Include retrieved excerpts</span>
                  </label>
                </div>
              </form>
              {ragDebugContext ? (
                <div className="mt-4 grid gap-2 rounded-2xl border border-sky-300/15 bg-slate-950/20 p-3 text-xs text-slate-200 md:grid-cols-4">
                  <div>
                    <span className="block text-sky-200/70">Mode</span>
                    <strong>{ragDebugContext.retrievalMode}</strong>
                  </div>
                  <div>
                    <span className="block text-sky-200/70">Confidence</span>
                    <strong>{ragDebugContext.retrievalConfidence}</strong>
                  </div>
                  <div>
                    <span className="block text-sky-200/70">Queries</span>
                    <strong>{ragDebugContext.searchQueries.length}</strong>
                  </div>
                  <div>
                    <span className="block text-sky-200/70">Targets</span>
                    <strong>{ragDebugContext.targetDocumentNames.join(", ") || "All files"}</strong>
                  </div>
                  <div>
                    <span className="block text-sky-200/70">Graph depth</span>
                    <strong>{ragDebugContext.retrievalQueryResult.graphDepth ?? graphSearchDepth}</strong>
                  </div>
                  <div>
                    <span className="block text-sky-200/70">Semantic chunks</span>
                    <strong>{ragDebugContext.retrievalDiagnostics.semanticChunkCount}</strong>
                  </div>
                  <div>
                    <span className="block text-sky-200/70">Graph chunks</span>
                    <strong>{ragDebugContext.retrievalDiagnostics.graphChunkCount}</strong>
                  </div>
                  <div className="md:col-span-2">
                    <span className="block text-sky-200/70">Generated query</span>
                    <span className="line-clamp-2 break-words">{ragDebugContext.retrievalQuery}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="block text-sky-200/70">Intent</span>
                    <span className="line-clamp-2 break-words">{ragDebugContext.retrievalQueryResult.intent}</span>
                  </div>
                  {ragDebugContext.retrievalDiagnostics.semanticError ? (
                    <div className="md:col-span-2">
                      <span className="block text-sky-200/70">Semantic error</span>
                      <span className="line-clamp-2 break-words text-amber-100">{ragDebugContext.retrievalDiagnostics.semanticError}</span>
                    </div>
                  ) : null}
                  {ragDebugContext.retrievalDiagnostics.graphError ? (
                    <div className="md:col-span-2">
                      <span className="block text-sky-200/70">Graph error</span>
                      <span className="line-clamp-2 break-words text-amber-100">{ragDebugContext.retrievalDiagnostics.graphError}</span>
                    </div>
                  ) : null}
                  <div className="md:col-span-2">
                    <span className="block text-sky-200/70">Debug trace</span>
                    <span className="line-clamp-2 break-words">
                      {lastDebugTrace
                        ? `Trace ${lastDebugTrace.id} captured${lastDebugTrace.model?.finalPrompt ? " with final prompt" : " without final prompt"}.`
                        : captureDebugTrace ? "Run a simulation to capture a trace." : "Enable capture to create a shareable trace."}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-end gap-2 md:col-span-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!lastDebugTrace}
                      onClick={() => void handleCopyTrace("json")}
                      className="h-8 rounded-xl border border-white/10 bg-white/10 px-3 text-xs text-slate-100 hover:bg-white/15 disabled:opacity-40"
                    >
                      Copy trace JSON
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!lastDebugTrace}
                      onClick={() => void handleCopyTrace("markdown")}
                      className="h-8 rounded-xl border border-white/10 bg-white/10 px-3 text-xs text-slate-100 hover:bg-white/15 disabled:opacity-40"
                    >
                      Copy trace Markdown
                    </Button>
                  </div>
                </div>
              ) : null}
              {ragDebugContext?.retrievalError ? (
                <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs text-amber-100" role="alert">
                  Retrieval warning: {ragDebugContext.retrievalError}
                </div>
              ) : null}
              <div className="mt-4 rounded-2xl border border-violet-300/15 bg-slate-950/20 p-3 text-xs text-slate-200">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-violet-100">Interactive graph view</p>
                    <p className="text-slate-400">
                      {graphView.nodes.length > 0
                        ? "Click a node to highlight graph-derived evidence in the results."
                        : "Run a Graph or Hybrid Graph RAG simulation to populate nodes and relationships."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={graphView.nodes.length === 0}
                    onClick={() => setSelectedGraphNode("")}
                    className="h-8 rounded-xl border border-white/10 bg-white/10 px-3 text-xs text-slate-100 hover:bg-white/15 disabled:opacity-40"
                  >
                    Clear
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-[280px_1fr]">
                  <div className="flex min-h-20 flex-wrap gap-2 rounded-xl border border-white/10 bg-slate-950/20 p-3">
                    {graphView.nodes.length > 0 ? (
                      graphView.nodes.map((node) => (
                          <button
                            key={node}
                            type="button"
                            aria-pressed={selectedGraphNode === node}
                            onClick={() => setSelectedGraphNode(node)}
                            className={`rounded-full border px-3 py-1 text-left transition ${
                              selectedGraphNode === node
                                ? "border-violet-200 bg-violet-400/30 text-white"
                                : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                            }`}
                          >
                            {node}
                          </button>
                      ))
                    ) : (
                      <span className="self-center text-slate-400">
                        No graph nodes yet.
                      </span>
                    )}
                  </div>
                  <div
                    className="h-48 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-950/30"
                    role="img"
                    aria-label="Graph RAG relationship visualization"
                  >
                    {graphView.nodes.length === 0 ? (
                      <div
                        className="flex h-full items-center justify-center text-sm text-slate-400"
                      >
                        No graph relationships to display yet
                      </div>
                    ) : (
                      <ForceGraph2D<GraphViewNode, GraphViewLink>
                        graphData={forceGraphData}
                        width={860}
                        height={190}
                        backgroundColor="rgba(15, 23, 42, 0.3)"
                        cooldownTicks={80}
                        nodeRelSize={5}
                        nodeLabel="id"
                        nodeColor={(node) => node.selected ? "#a78bfa" : "#38bdf8"}
                        linkColor={(link) => link.selected ? "#ddd6fe" : "rgba(56, 189, 248, 0.45)"}
                        linkLabel={(link) => link.type}
                        linkDirectionalParticles={(link) => link.selected ? 2 : 0}
                        linkDirectionalParticleWidth={2}
                        linkWidth={(link) => link.selected ? 2.4 : 1.2}
                        onNodeClick={(node) => {
                          if (typeof node.id === "string") {
                            setSelectedGraphNode(node.id)
                          }
                        }}
                        nodeCanvasObject={(node, canvasContext, globalScale) => {
                          const graphNode = node as NodeObject<GraphViewNode>
                          const label = String(graphNode.id ?? "")
                          const fontSize = Math.max(9, 12 / globalScale)
                          const radius = graphNode.selected ? 7 : 5

                          canvasContext.beginPath()
                          canvasContext.arc(graphNode.x ?? 0, graphNode.y ?? 0, radius, 0, 2 * Math.PI)
                          canvasContext.fillStyle = graphNode.selected ? "#8b5cf6" : "#0f172a"
                          canvasContext.fill()
                          canvasContext.strokeStyle = graphNode.selected ? "#ddd6fe" : "#38bdf8"
                          canvasContext.lineWidth = graphNode.selected ? 2.4 : 1.4
                          canvasContext.stroke()
                          canvasContext.font = `${fontSize}px Inter, system-ui, sans-serif`
                          canvasContext.fillStyle = "#e0f2fe"
                          canvasContext.textAlign = "center"
                          canvasContext.textBaseline = "top"
                          canvasContext.fillText(
                            label.length > 24 ? `${label.slice(0, 24)}…` : label,
                            graphNode.x ?? 0,
                            (graphNode.y ?? 0) + radius + 4
                          )
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 p-5">
              <div className="app-scrollbar overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/20">
                <table
                  className="min-w-[1560px] table-fixed text-left text-xs"
                  aria-label="Search criteria results table"
                >
                  <thead className="bg-white/5 text-[11px] uppercase tracking-[0.12em] text-sky-200/70">
                    <tr>
                      <th className="w-20 px-3 py-3 font-bold">Score</th>
                      <th className="w-24 px-3 py-3 font-bold">Source</th>
                      <th className="w-24 px-3 py-3 font-bold">Similarity</th>
                      <th className="w-24 px-3 py-3 font-bold">Keyword</th>
                      <th className="w-44 px-3 py-3 font-bold">File</th>
                      <th className="w-24 px-3 py-3 font-bold">Pages</th>
                      <th className="w-56 px-3 py-3 font-bold">Parent ID</th>
                      <th className="w-56 px-3 py-3 font-bold">Graph entities</th>
                      <th className="w-40 px-3 py-3 font-bold">Graph edges</th>
                      <th className="w-72 px-3 py-3 font-bold">Matched queries</th>
                      <th className="w-72 px-3 py-3 font-bold">Child matches</th>
                      <th className="w-96 px-3 py-3 font-bold">RAG excerpt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {isSearching ? (
                      <tr>
                        <td className="px-3 py-5 text-center text-slate-300" colSpan={12}>
                          Simulating chat RAG retrieval…
                        </td>
                      </tr>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((chunk) => (
                        <tr
                          key={chunk.parentChunkId}
                          className={`align-top text-slate-200 ${
                            selectedGraphNode && chunk.graphEntityNames?.includes(selectedGraphNode)
                              ? "bg-violet-400/10"
                              : ""
                          }`}
                        >
                          <td className="px-3 py-3 font-semibold text-emerald-100">
                            {formatScore(chunk.score)}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            {chunk.retrievalSource ?? "semantic"}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            {formatSimilarity(chunk.similarity)}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            {chunk.keywordScore !== undefined ? formatScore(chunk.keywordScore) : "—"}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            <span className="line-clamp-2 break-all" title={chunk.documentName ?? chunk.documentId}>
                              {chunk.documentName ?? chunk.documentId}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {formatPageNumbers(chunk.pageNumbers)}
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px] text-slate-400">
                            <span className="line-clamp-2 break-all" title={chunk.parentChunkId}>
                              {chunk.parentChunkId}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-300" title={chunk.graphEntityNames?.join("\n") ?? ""}>
                            {chunk.graphEntityNames?.join(", ") ?? "—"}
                          </td>
                          <td className="px-3 py-3 text-slate-300" title={chunk.graphEdgeTypes?.join("\n") ?? ""}>
                            {chunk.graphEdgeTypes?.join(", ") ?? "—"}
                          </td>
                          <td className="px-3 py-3 text-slate-300" title={chunk.matchedQueries?.join("\n") ?? ""}>
                            {chunk.matchedQueries?.join(" | ") ?? "—"}
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px] text-sky-100/90" title={chunk.matchedChildChunkIds.join("\n")}>
                            {chunk.matchedChildChunkIds.join(", ")}
                          </td>
                          <td className="px-3 py-3 text-slate-300" title={chunk.excerpt ?? chunk.text}>
                            {formatTextPreview(chunk.excerpt ?? chunk.text)}
                          </td>
                        </tr>
                      ))
                    ) : searchQuery.trim() ? (
                      <tr>
                        <td className="px-3 py-5 text-center text-slate-300" colSpan={12}>
                          No RAG parent chunks found for this plan.
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td className="px-3 py-5 text-center text-slate-300" colSpan={12}>
                          Enter a chat question to simulate retrieval, inspect generated queries, and tune RAG parameters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 mt-auto grid shrink-0 grid-cols-1 gap-3 border-t border-white/10 bg-[#111b4b]/95 p-4 backdrop-blur sm:grid-cols-[1fr_160px]">
              <p className="self-center text-xs text-slate-300" role="status">
                {searchResults.length > 0
                  ? `${searchResults.length.toLocaleString()} parent chunks · mode ${ragDebugContext?.retrievalMode ?? "—"} · confidence ${ragDebugContext?.retrievalConfidence ?? "—"}`
                  : `RAG simulation uses query rewriting, hybrid child search, parent chunk retrieval, and threshold ${semanticSearchThreshold.toFixed(2)}.`}
              </p>
              <Button
                type="button"
                variant="secondary"
                aria-label="Close search criteria"
                onClick={() => setIsSearchOpen(false)}
                className="rounded-xl border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}