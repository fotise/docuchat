import { useMemo, useState } from "react"
import { Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  createManualGraphEdgeId,
  createManualGraphEntityId,
  deleteGraphEdge,
  deleteGraphEntity,
  type GraphEdgeType,
  type GraphEntityType,
  type StoredGraphEdge,
  type StoredGraphEntity,
  upsertGraphEdge,
  upsertGraphEntity,
} from "@/lib/chat-history/indexed-db"

const GRAPH_ENTITY_TYPES: GraphEntityType[] = [
  "topic",
  "organization",
  "person",
  "product",
  "location",
  "date",
  "metric",
  "unknown",
]

const GRAPH_EDGE_TYPES: GraphEdgeType[] = [
  "related_to",
  "co_occurs_with",
  "mentioned_in",
  "causes",
  "compares_to",
  "contradicts",
  "depends_on",
  "part_of",
  "unknown",
]

interface OntologyEditorTabProps {
  workspaceId: string
  entities: StoredGraphEntity[]
  edges: StoredGraphEdge[]
  documentNameById: Map<string, string>
  isLoading?: boolean
  onRefresh: () => Promise<void> | void
}

function formatAliases(aliases: string[]) {
  return aliases.length > 0 ? aliases.join(", ") : "No aliases"
}

function parseAliases(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((alias) => alias.trim())
        .filter(Boolean)
    )
  )
}

function getEntitySource(entity: StoredGraphEntity) {
  return entity.manualOverride || entity.source === "manual" ? "manual" : "extracted"
}

function getEdgeSource(edge: StoredGraphEdge) {
  return edge.manualOverride || edge.source === "manual" ? "manual" : "extracted"
}

function formatDocumentScope(documentIds: string[], documentNameById: Map<string, string>) {
  if (documentIds.length === 0) {
    return "Workspace-level"
  }

  return documentIds.map((documentId) => documentNameById.get(documentId) ?? documentId).join(", ")
}

export function OntologyEditorTab({
  workspaceId,
  entities,
  edges,
  documentNameById,
  isLoading = false,
  onRefresh,
}: OntologyEditorTabProps) {
  const [query, setQuery] = useState("")
  const [selectedEntityId, setSelectedEntityId] = useState("")
  const [entityName, setEntityName] = useState("")
  const [entityType, setEntityType] = useState<GraphEntityType>("topic")
  const [entityAliases, setEntityAliases] = useState("")
  const [sourceEntityId, setSourceEntityId] = useState("")
  const [targetEntityId, setTargetEntityId] = useState("")
  const [edgeType, setEdgeType] = useState<GraphEdgeType>("related_to")
  const [statusMessage, setStatusMessage] = useState("")

  const entityById = useMemo(
    () => new Map(entities.map((entity) => [entity.id, entity])),
    [entities]
  )
  const normalizedQuery = query.trim().toLowerCase()
  const filteredEntities = useMemo(
    () => entities
      .filter((entity) => {
        if (!normalizedQuery) {
          return true
        }

        const documentName = entity.documentId ? documentNameById.get(entity.documentId) ?? "" : ""
        const haystack = [entity.name, entity.type, documentName, ...entity.aliases].join(" ").toLowerCase()

        return haystack.includes(normalizedQuery)
      })
      .sort((left, right) => left.name.localeCompare(right.name)),
    [documentNameById, entities, normalizedQuery]
  )
  const manualEntityCount = entities.filter((entity) => getEntitySource(entity) === "manual").length
  const manualEdgeCount = edges.filter((edge) => getEdgeSource(edge) === "manual").length
  const selectedEntity = selectedEntityId ? entityById.get(selectedEntityId) : undefined

  function resetEntityForm() {
    setSelectedEntityId("")
    setEntityName("")
    setEntityType("topic")
    setEntityAliases("")
  }

  function handleSelectEntity(entity: StoredGraphEntity) {
    setSelectedEntityId(entity.id)
    setEntityName(entity.name)
    setEntityType(entity.type)
    setEntityAliases(entity.aliases.join(", "))
    setStatusMessage("")
  }

  async function handleSaveEntity() {
    const trimmedName = entityName.trim()

    if (!trimmedName) {
      setStatusMessage("Entity name is required.")
      return
    }

    const now = Date.now()
    const existing = selectedEntityId ? entityById.get(selectedEntityId) : undefined

    await upsertGraphEntity({
      id: existing?.id ?? createManualGraphEntityId(workspaceId, trimmedName),
      workspaceId,
      documentId: existing?.documentId,
      name: trimmedName,
      normalizedName: trimmedName,
      type: entityType,
      aliases: parseAliases(entityAliases),
      mentions: existing?.mentions ?? [],
      confidence: existing?.confidence ?? 1,
      embedding: existing?.embedding,
      embeddingDimensions: existing?.embeddingDimensions,
      embeddingModel: existing?.embeddingModel,
      manualOverride: true,
      source: "manual",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })

    await onRefresh()
    setStatusMessage(existing ? `Updated entity ${trimmedName}.` : `Added entity ${trimmedName}.`)
    resetEntityForm()
  }

  async function handleDeleteEntity(entity: StoredGraphEntity) {
    const relatedEdges = edges.filter(
      (edge) => edge.sourceEntityId === entity.id || edge.targetEntityId === entity.id
    )
    const shouldDelete = relatedEdges.length === 0 || window.confirm(
      `Delete ${entity.name} and ${relatedEdges.length} related ${relatedEdges.length === 1 ? "relation" : "relations"}?`
    )

    if (!shouldDelete) {
      return
    }

    await deleteGraphEntity(workspaceId, entity.id)
    await onRefresh()
    if (selectedEntityId === entity.id) {
      resetEntityForm()
    }
    setStatusMessage(`Deleted entity ${entity.name}.`)
  }

  async function handleAddEdge() {
    if (!sourceEntityId || !targetEntityId) {
      setStatusMessage("Select both source and target entities for the relation.")
      return
    }

    if (sourceEntityId === targetEntityId) {
      setStatusMessage("Source and target entities must be different.")
      return
    }

    const now = Date.now()

    await upsertGraphEdge({
      id: createManualGraphEdgeId(workspaceId, sourceEntityId, targetEntityId, edgeType),
      workspaceId,
      sourceEntityId,
      targetEntityId,
      type: edgeType,
      documentIds: [],
      chunkIds: [],
      weight: 1,
      evidenceText: ["Manual ontology relation"],
      confidence: 1,
      manualOverride: true,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    })

    await onRefresh()
    setStatusMessage("Added ontology relation.")
    setSourceEntityId("")
    setTargetEntityId("")
    setEdgeType("related_to")
  }

  async function handleDeleteEdge(edge: StoredGraphEdge) {
    await deleteGraphEdge(workspaceId, edge.id)
    await onRefresh()
    setStatusMessage("Deleted ontology relation.")
  }

  return (
    <div className="app-scrollbar h-full overflow-y-auto p-5">
      <div className="mb-4 grid grid-cols-4 gap-2 text-xs" aria-label="Ontology summary">
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <span className="block truncate text-[10px] uppercase tracking-[0.1em] text-emerald-200/60">Entities</span>
          <strong className="mt-1 block truncate text-sm text-slate-50">{entities.length.toLocaleString()}</strong>
        </div>
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <span className="block truncate text-[10px] uppercase tracking-[0.1em] text-emerald-200/60">Manual entities</span>
          <strong className="mt-1 block truncate text-sm text-slate-50">{manualEntityCount.toLocaleString()}</strong>
        </div>
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <span className="block truncate text-[10px] uppercase tracking-[0.1em] text-emerald-200/60">Relations</span>
          <strong className="mt-1 block truncate text-sm text-slate-50">{edges.length.toLocaleString()}</strong>
        </div>
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <span className="block truncate text-[10px] uppercase tracking-[0.1em] text-emerald-200/60">Manual relations</span>
          <strong className="mt-1 block truncate text-sm text-slate-50">{manualEdgeCount.toLocaleString()}</strong>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 rounded-2xl border border-emerald-300/15 bg-slate-950/20 p-4" aria-label="Ontology entities">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-emerald-100">Ontology entities</h3>
              <p className="mt-1 text-xs text-slate-400">Workspace-global view with document-aware provenance.</p>
            </div>
            <Input
              type="search"
              aria-label="Search ontology entities"
              placeholder="Search entities, aliases, documents..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 max-w-xs rounded-xl border-white/10 bg-slate-950/30 text-sm text-slate-100 placeholder:text-slate-400 focus-visible:border-emerald-300/60 focus-visible:ring-emerald-300/20"
            />
          </div>

          <div className="app-scrollbar max-h-[440px] overflow-auto rounded-xl border border-white/10">
            {isLoading ? (
              <div className="flex min-h-[180px] items-center justify-center text-sm text-slate-300">Loading ontology…</div>
            ) : filteredEntities.length === 0 ? (
              <div className="flex min-h-[180px] items-center justify-center px-6 text-center text-sm text-slate-400">No ontology entities match the current search.</div>
            ) : (
              <table className="min-w-full divide-y divide-white/10 text-left text-xs" aria-label="Ontology entities table">
                <thead className="bg-white/5 text-[10px] uppercase tracking-[0.12em] text-emerald-100/70">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Provenance</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filteredEntities.map((entity) => (
                    <tr key={entity.id} className={selectedEntityId === entity.id ? "bg-emerald-400/10" : "bg-slate-950/15"}>
                      <td className="max-w-[260px] px-3 py-2 align-top">
                        <button type="button" onClick={() => handleSelectEntity(entity)} className="text-left font-bold text-slate-100 hover:text-emerald-100">
                          {entity.name}
                        </button>
                        <p className="mt-1 truncate text-slate-400">{formatAliases(entity.aliases)}</p>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-200">{entity.type}</td>
                      <td className="px-3 py-2 align-top text-slate-300">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-emerald-100/80">{getEntitySource(entity)}</span>
                        <p className="mt-1 max-w-[220px] truncate text-slate-400">{entity.documentId ? documentNameById.get(entity.documentId) ?? entity.documentId : "Workspace-level"}</p>
                        <p className="mt-1 text-slate-500">{entity.mentions.length} mentions</p>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex gap-2">
                          <Button type="button" variant="secondary" size="sm" onClick={() => handleSelectEntity(entity)} className="border border-white/10 bg-white/10 text-xs text-slate-100 hover:bg-white/15">Edit</Button>
                          <Button type="button" variant="destructive" size="icon-sm" aria-label={`Delete ontology entity ${entity.name}`} onClick={() => void handleDeleteEntity(entity)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4" aria-label="Ontology entity editor">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-extrabold text-emerald-100">{selectedEntity ? "Edit entity" : "Add entity"}</h3>
              {selectedEntity ? (
                <Button type="button" variant="secondary" size="sm" onClick={resetEntityForm} className="border border-white/10 bg-white/10 text-xs text-slate-100 hover:bg-white/15">New</Button>
              ) : null}
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-200">
                Name
                <Input value={entityName} onChange={(event) => setEntityName(event.target.value)} aria-label="Ontology entity name" className="mt-1 h-9 rounded-xl border-white/10 bg-slate-950/30 text-slate-100" />
              </label>
              <label className="block text-xs font-semibold text-slate-200">
                Type
                <select value={entityType} onChange={(event) => setEntityType(event.target.value as GraphEntityType)} aria-label="Ontology entity type" className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 text-sm text-slate-100 outline-none focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20">
                  {GRAPH_ENTITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-200">
                Aliases
                <textarea value={entityAliases} onChange={(event) => setEntityAliases(event.target.value)} aria-label="Ontology entity aliases" placeholder="Comma or newline separated aliases" className="mt-1 min-h-20 w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20" />
              </label>
              <Button type="button" onClick={() => void handleSaveEntity()} className="w-full rounded-xl bg-emerald-500 text-white hover:bg-emerald-400">
                <Save className="h-4 w-4" />
                Save entity
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4" aria-label="Ontology relation editor">
            <h3 className="text-sm font-extrabold text-emerald-100">Add relation</h3>
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-semibold text-slate-200">
                Source
                <select value={sourceEntityId} onChange={(event) => setSourceEntityId(event.target.value)} aria-label="Ontology relation source" className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 text-sm text-slate-100 outline-none focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20">
                  <option value="">Select source entity</option>
                  {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-200">
                Relation type
                <select value={edgeType} onChange={(event) => setEdgeType(event.target.value as GraphEdgeType)} aria-label="Ontology relation type" className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 text-sm text-slate-100 outline-none focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20">
                  {GRAPH_EDGE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-200">
                Target
                <select value={targetEntityId} onChange={(event) => setTargetEntityId(event.target.value)} aria-label="Ontology relation target" className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 text-sm text-slate-100 outline-none focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20">
                  <option value="">Select target entity</option>
                  {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
                </select>
              </label>
              <Button type="button" onClick={() => void handleAddEdge()} className="w-full rounded-xl bg-emerald-500 text-white hover:bg-emerald-400">
                <Plus className="h-4 w-4" />
                Add relation
              </Button>
            </div>
          </section>
        </aside>
      </div>

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4" aria-label="Ontology relations">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-emerald-100">Ontology relations</h3>
            <p className="mt-1 text-xs text-slate-400">Manual relations are workspace-level unless linked to extracted document evidence.</p>
          </div>
        </div>
        <div className="app-scrollbar max-h-[280px] overflow-auto rounded-xl border border-white/10">
          {edges.length === 0 ? (
            <div className="flex min-h-[140px] items-center justify-center px-6 text-center text-sm text-slate-400">No ontology relations yet.</div>
          ) : (
            <table className="min-w-full divide-y divide-white/10 text-left text-xs" aria-label="Ontology relations table">
              <thead className="bg-white/5 text-[10px] uppercase tracking-[0.12em] text-emerald-100/70">
                <tr>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Target</th>
                  <th className="px-3 py-2 font-semibold">Scope</th>
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {edges.map((edge) => {
                  const source = entityById.get(edge.sourceEntityId)
                  const target = entityById.get(edge.targetEntityId)

                  return (
                    <tr key={edge.id} className="bg-slate-950/15">
                      <td className="px-3 py-2 font-semibold text-slate-100">{source?.name ?? edge.sourceEntityId}</td>
                      <td className="px-3 py-2 text-slate-200">
                        {edge.type}
                        <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-emerald-100/80">{getEdgeSource(edge)}</span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-100">{target?.name ?? edge.targetEntityId}</td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-slate-400">{formatDocumentScope(edge.documentIds, documentNameById)}</td>
                      <td className="px-3 py-2">
                        <Button type="button" variant="destructive" size="icon-sm" aria-label={`Delete ontology relation ${source?.name ?? edge.sourceEntityId} ${edge.type} ${target?.name ?? edge.targetEntityId}`} onClick={() => void handleDeleteEdge(edge)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {statusMessage ? (
        <p className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100" role="status">{statusMessage}</p>
      ) : null}
    </div>
  )
}
