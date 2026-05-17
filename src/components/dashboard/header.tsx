import { useState, type FormEvent, type ReactNode } from "react"
import { ChevronDown, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { dashboardConfig } from "@/config/dashboard"
import {
  DEFAULT_MIN_SEMANTIC_SIMILARITY,
  semanticSearchWorkspace,
  type SemanticSearchResult,
} from "@/lib/file-processing/semantic-search"
import { useWorkspaceStore } from "@/store/workspace-store"
import type { WorkspaceRouteConfig } from "@/types/dashboard"
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
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SemanticSearchResult[]>([])
  const [statusMessage, setStatusMessage] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace)
  const updateWorkspaceIcon = useWorkspaceStore((state) => state.updateWorkspaceIcon)
  const updateWorkspaceSemanticSearchThreshold = useWorkspaceStore(
    (state) => state.updateWorkspaceSemanticSearchThreshold
  )
  const { header } = dashboardConfig
  const semanticSearchThreshold = workspace.semanticSearchThreshold ?? DEFAULT_MIN_SEMANTIC_SIMILARITY

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

  async function handleSemanticSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    setIsSearching(true)

    try {
      setSearchResults(
        await semanticSearchWorkspace(workspace.id, searchQuery, {
          minSimilarity: semanticSearchThreshold,
        })
      )
    } finally {
      setIsSearching(false)
    }
  }

  function handleThresholdChange(value: string) {
    const parsedValue = Number.parseFloat(value)

    if (!Number.isFinite(parsedValue)) {
      return
    }

    void updateWorkspaceSemanticSearchThreshold(workspace.id, parsedValue)
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
          aria-label="Open semantic search"
          title="Open semantic search"
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
          aria-label="Semantic search"
        >
          <div className="flex h-[80vh] max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111b4b] text-white shadow-[0_24px_70px_rgba(0,0,0,.55)]">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/70">
                Semantic search
              </p>
              <h2 className="mt-2 text-lg font-extrabold leading-tight">
                Search across {workspace.title}
              </h2>
              <form
                className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_140px]"
                onSubmit={(event) => void handleSemanticSearch(event)}
              >
                <Input
                  type="search"
                  aria-label="Semantic search query"
                  placeholder="Ask for concepts, topics, or facts in your files..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-10 rounded-xl border-white/10 bg-slate-950/30 text-sm text-slate-100 placeholder:text-slate-400 focus-visible:border-sky-300/60 focus-visible:ring-sky-300/20"
                />
                <label className="block">
                  <span className="sr-only">
                    Semantic search threshold
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
                <Button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="h-10 rounded-xl bg-gradient-to-b from-blue-400 to-blue-700 text-white hover:from-blue-400 hover:to-blue-600 disabled:opacity-50"
                >
                  {isSearching ? "Searching..." : "Search"}
                </Button>
              </form>
            </div>

            <div className="app-scrollbar min-h-0 flex-1 overflow-auto p-5">
              <div className="app-scrollbar overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/20">
                <table
                  className="min-w-[1060px] table-fixed text-left text-xs"
                  aria-label="Semantic search results table"
                >
                  <thead className="bg-white/5 text-[11px] uppercase tracking-[0.12em] text-sky-200/70">
                    <tr>
                      <th className="w-20 px-3 py-3 font-bold">Score</th>
                      <th className="w-24 px-3 py-3 font-bold">Similarity</th>
                      <th className="w-44 px-3 py-3 font-bold">File</th>
                      <th className="w-24 px-3 py-3 font-bold">Pages</th>
                      <th className="w-56 px-3 py-3 font-bold">Chunk ID</th>
                      <th className="w-56 px-3 py-3 font-bold">Parent ID</th>
                      <th className="w-80 px-3 py-3 font-bold">Text preview</th>
                      <th className="w-24 px-3 py-3 font-bold">Dims</th>
                      <th className="w-48 px-3 py-3 font-bold">Model</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {isSearching ? (
                      <tr>
                        <td className="px-3 py-5 text-center text-slate-300" colSpan={9}>
                          Running semantic search…
                        </td>
                      </tr>
                    ) : searchResults.length > 0 ? (
                      searchResults.map(({ chunk, document, score, similarity }) => (
                        <tr key={chunk.id} className="align-top text-slate-200">
                          <td className="px-3 py-3 font-semibold text-emerald-100">
                            {formatScore(score)}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            {formatSimilarity(similarity)}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            <span className="line-clamp-2 break-all" title={document?.name ?? chunk.documentId}>
                              {document?.name ?? chunk.documentId}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {formatPageNumbers(chunk.pageNumbers)}
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px] text-sky-100/90">
                            <span className="line-clamp-2 break-all" title={chunk.chunkId}>
                              {chunk.chunkId}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px] text-slate-400">
                            <span className="line-clamp-2 break-all" title={chunk.parentChunkId ?? "No parent"}>
                              {chunk.parentChunkId ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-300" title={chunk.text}>
                            {formatTextPreview(chunk.text)}
                          </td>
                          <td className="px-3 py-3">{chunk.embeddingDimensions ?? "—"}</td>
                          <td className="px-3 py-3 text-slate-300">
                            <span className="line-clamp-2 break-all" title={chunk.embeddingModel ?? "No embedding model"}>
                              {chunk.embeddingModel ?? "—"}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : searchQuery.trim() ? (
                      <tr>
                        <td className="px-3 py-5 text-center text-slate-300" colSpan={9}>
                          No semantic matches found.
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td className="px-3 py-5 text-center text-slate-300" colSpan={9}>
                          Enter a query to search embedded chunks in this workspace.
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
                  ? `${searchResults.length.toLocaleString()} semantic results`
                  : `Search uses stored child chunk embeddings. Threshold: ${semanticSearchThreshold.toFixed(2)}.`}
              </p>
              <Button
                type="button"
                variant="secondary"
                aria-label="Close semantic search"
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