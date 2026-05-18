import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type {
  UploadedDocument,
  WorkspaceMessage,
  WorkspaceRouteConfig,
  WorkspaceTabId,
} from "@/types/dashboard"

const DB_NAME = "docuchat"
const DB_VERSION = 6
const MESSAGE_STORE = "messages"
const WORKSPACE_STORE = "workspaces"
const DOCUMENT_STORE = "documents"
const DOCUMENT_CHUNK_STORE = "documentChunks"
const GRAPH_ENTITY_STORE = "graphEntities"
const GRAPH_EDGE_STORE = "graphEdges"
const MESSAGE_LIMIT = 100

export interface StoredChatMessage extends WorkspaceMessage {
  workspaceId: string
  tabId: WorkspaceTabId
  createdAt: number
}

export interface StoredWorkspaceDocument extends UploadedDocument {
  workspaceId: string
  mimeType: string
  blob: Blob
  content: ArrayBuffer
}

export interface StoredDocumentChunk {
  id: string
  workspaceId: string
  documentId: string
  chunkId: string
  parentChunkId?: string
  level: "parent" | "child"
  text: string
  pageNumbers: number[]
  embedding?: number[]
  embeddingDimensions?: number
  embeddingModel?: string
  order: number
  createdAt: number
}

export type GraphEntityType =
  | "date"
  | "location"
  | "metric"
  | "organization"
  | "person"
  | "product"
  | "topic"
  | "unknown"

export type GraphEdgeType = "co_occurs_with" | "mentioned_in" | "related_to" | "unknown"
  | "causes"
  | "compares_to"
  | "contradicts"
  | "depends_on"
  | "part_of"

export interface GraphMention {
  documentId: string
  chunkId: string
  parentChunkId?: string
  pageNumbers: number[]
  text: string
}

export interface StoredGraphEntity {
  id: string
  workspaceId: string
  documentId?: string
  name: string
  normalizedName: string
  type: GraphEntityType
  aliases: string[]
  mentions: GraphMention[]
  confidence: number
  embedding?: number[]
  embeddingDimensions?: number
  embeddingModel?: string
  manualOverride?: boolean
  source?: "extracted" | "manual"
  createdAt: number
  updatedAt: number
}

export interface StoredGraphEdge {
  id: string
  workspaceId: string
  sourceEntityId: string
  targetEntityId: string
  type: GraphEdgeType
  documentIds: string[]
  chunkIds: string[]
  weight: number
  evidenceText: string[]
  confidence: number
  manualOverride?: boolean
  source?: "extracted" | "manual"
  createdAt: number
  updatedAt: number
}

interface DocuChatDb extends DBSchema {
  messages: {
    key: string
    value: StoredChatMessage
    indexes: {
      workspaceId: string
      tabId: WorkspaceTabId
      createdAt: number
      byWorkspaceTabCreatedAt: [string, WorkspaceTabId, number]
    }
  }
  workspaces: {
    key: string
    value: WorkspaceRouteConfig
    indexes: {
      path: string
    }
  }
  documents: {
    key: string
    value: StoredWorkspaceDocument
    indexes: {
      workspaceId: string
      uploadedAt: number
    }
  }
  documentChunks: {
    key: string
    value: StoredDocumentChunk
    indexes: {
      workspaceId: string
      documentId: string
      byDocumentOrder: [string, number]
    }
  }
  graphEntities: {
    key: string
    value: StoredGraphEntity
    indexes: {
      workspaceId: string
      documentId: string
      normalizedName: string
      byWorkspaceEntity: [string, string]
    }
  }
  graphEdges: {
    key: string
    value: StoredGraphEdge
    indexes: {
      workspaceId: string
      sourceEntityId: string
      targetEntityId: string
      byWorkspaceSource: [string, string]
      byWorkspaceTarget: [string, string]
    }
  }
}

let dbPromise: Promise<IDBPDatabase<DocuChatDb>> | null = null

function getDb() {
  dbPromise ??= openDB<DocuChatDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
        const messagesStore = db.createObjectStore(MESSAGE_STORE, {
          keyPath: "id",
        })

        messagesStore.createIndex("workspaceId", "workspaceId")
        messagesStore.createIndex("tabId", "tabId")
        messagesStore.createIndex("createdAt", "createdAt")
        messagesStore.createIndex("byWorkspaceTabCreatedAt", [
          "workspaceId",
          "tabId",
          "createdAt",
        ])
      }

      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
        const workspacesStore = db.createObjectStore(WORKSPACE_STORE, {
          keyPath: "id",
        })

        workspacesStore.createIndex("path", "path", { unique: true })
      }

      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
        const documentsStore = db.createObjectStore(DOCUMENT_STORE, {
          keyPath: "id",
        })

        documentsStore.createIndex("workspaceId", "workspaceId")
        documentsStore.createIndex("uploadedAt", "uploadedAt")
      }

      if (!db.objectStoreNames.contains(DOCUMENT_CHUNK_STORE)) {
        const chunksStore = db.createObjectStore(DOCUMENT_CHUNK_STORE, {
          keyPath: "id",
        })

        chunksStore.createIndex("workspaceId", "workspaceId")
        chunksStore.createIndex("documentId", "documentId")
        chunksStore.createIndex("byDocumentOrder", ["documentId", "order"])
      }

      if (!db.objectStoreNames.contains(GRAPH_ENTITY_STORE)) {
        const graphEntitiesStore = db.createObjectStore(GRAPH_ENTITY_STORE, {
          keyPath: "id",
        })

        graphEntitiesStore.createIndex("workspaceId", "workspaceId")
        graphEntitiesStore.createIndex("documentId", "documentId")
        graphEntitiesStore.createIndex("normalizedName", "normalizedName")
        graphEntitiesStore.createIndex("byWorkspaceEntity", ["workspaceId", "normalizedName"])
      }

      if (!db.objectStoreNames.contains(GRAPH_EDGE_STORE)) {
        const graphEdgesStore = db.createObjectStore(GRAPH_EDGE_STORE, {
          keyPath: "id",
        })

        graphEdgesStore.createIndex("workspaceId", "workspaceId")
        graphEdgesStore.createIndex("sourceEntityId", "sourceEntityId")
        graphEdgesStore.createIndex("targetEntityId", "targetEntityId")
        graphEdgesStore.createIndex("byWorkspaceSource", ["workspaceId", "sourceEntityId"])
        graphEdgesStore.createIndex("byWorkspaceTarget", ["workspaceId", "targetEntityId"])
      }
    },
  })

  return dbPromise
}

export function createStoredChatMessage(
  workspaceId: string,
  tabId: WorkspaceTabId,
  message: WorkspaceMessage
): StoredChatMessage {
  return {
    ...message,
    workspaceId,
    tabId,
    createdAt: Date.now(),
  }
}

export async function addChatMessage(message: StoredChatMessage) {
  const db = await getDb()
  await db.put(MESSAGE_STORE, message)
}

export async function addChatMessages(messages: StoredChatMessage[]) {
  if (messages.length === 0) {
    return
  }

  const db = await getDb()
  const tx = db.transaction(MESSAGE_STORE, "readwrite")

  await Promise.all([
    ...messages.map((message) => tx.store.put(message)),
    tx.done,
  ])
}

export async function getRecentChatMessages(
  workspaceId: string,
  tabId: WorkspaceTabId,
  limit = MESSAGE_LIMIT
): Promise<WorkspaceMessage[]> {
  const db = await getDb()
  const range = IDBKeyRange.bound(
    [workspaceId, tabId, 0],
    [workspaceId, tabId, Number.MAX_SAFE_INTEGER]
  )
  const messages: StoredChatMessage[] = []

  let cursor = await db
    .transaction(MESSAGE_STORE)
    .store.index("byWorkspaceTabCreatedAt")
    .openCursor(range, "prev")

  while (cursor && messages.length < limit) {
    messages.push(cursor.value)
    cursor = await cursor.continue()
  }

  return messages
    .reverse()
    .map(({ id, side, text }) => ({ id, side, text }))
}

export async function replaceWorkspaceMessages(
  workspaceId: string,
  messagesByTab: Record<WorkspaceTabId, WorkspaceMessage[]>
) {
  const db = await getDb()
  const tx = db.transaction(MESSAGE_STORE, "readwrite")
  const workspaceIndex = tx.store.index("workspaceId")

  for await (const cursor of workspaceIndex.iterate(workspaceId)) {
    await cursor.delete()
  }

  const now = Date.now()
  let offset = 0

  for (const [tabId, messages] of Object.entries(messagesByTab)) {
    for (const message of messages) {
      await tx.store.put({
        ...message,
        workspaceId,
        tabId,
        createdAt: now + offset,
      })
      offset += 1
    }
  }

  await tx.done
}

export async function clearWorkspaceTabMessages(
  workspaceId: string,
  tabId: WorkspaceTabId
) {
  const db = await getDb()
  const tx = db.transaction(MESSAGE_STORE, "readwrite")
  const range = IDBKeyRange.bound(
    [workspaceId, tabId, 0],
    [workspaceId, tabId, Number.MAX_SAFE_INTEGER]
  )
  const index = tx.store.index("byWorkspaceTabCreatedAt")

  for await (const cursor of index.iterate(range)) {
    await cursor.delete()
  }

  await tx.done
}

export async function clearChatHistory() {
  const db = await getDb()
  await db.clear(MESSAGE_STORE)
}

export async function getWorkspaces(): Promise<WorkspaceRouteConfig[]> {
  const db = await getDb()
  return db.getAll(WORKSPACE_STORE)
}

export async function seedWorkspacesIfEmpty(
  workspaces: WorkspaceRouteConfig[]
): Promise<WorkspaceRouteConfig[]> {
  const db = await getDb()
  const existingCount = await db.count(WORKSPACE_STORE)

  if (existingCount > 0) {
    return db.getAll(WORKSPACE_STORE)
  }

  const tx = db.transaction(WORKSPACE_STORE, "readwrite")

  await Promise.all([
    ...workspaces.map((workspace) => tx.store.put(workspace)),
    tx.done,
  ])

  return workspaces
}

export async function saveWorkspace(workspace: WorkspaceRouteConfig) {
  const db = await getDb()
  await db.put(WORKSPACE_STORE, workspace)
}

export async function addWorkspaceDocuments(documents: StoredWorkspaceDocument[]) {
  if (documents.length === 0) {
    return
  }

  const db = await getDb()
  const tx = db.transaction(DOCUMENT_STORE, "readwrite")

  await Promise.all([
    ...documents.map((document) => tx.store.put(document)),
    tx.done,
  ])
}

export async function getWorkspaceDocuments(
  workspaceId: string
): Promise<StoredWorkspaceDocument[]> {
  const db = await getDb()
  const documents = await db.getAllFromIndex(
    DOCUMENT_STORE,
    "workspaceId",
    workspaceId
  )

  return documents.sort((a, b) => (a.uploadedAt ?? 0) - (b.uploadedAt ?? 0))
}

export async function getWorkspaceDocument(documentId: string) {
  const db = await getDb()
  return db.get(DOCUMENT_STORE, documentId)
}

export async function getDocumentChunks(documentId: string) {
  const db = await getDb()
  const range = IDBKeyRange.bound(
    [documentId, 0],
    [documentId, Number.MAX_SAFE_INTEGER]
  )

  return db.getAllFromIndex(DOCUMENT_CHUNK_STORE, "byDocumentOrder", range)
}

export async function getWorkspaceDocumentChunks(workspaceId: string) {
  const db = await getDb()
  const chunks = await db.getAllFromIndex(
    DOCUMENT_CHUNK_STORE,
    "workspaceId",
    workspaceId
  )

  return chunks.sort((a, b) => {
    const documentOrder = a.documentId.localeCompare(b.documentId)

    return documentOrder === 0 ? a.order - b.order : documentOrder
  })
}

export async function replaceDocumentChunks(
  workspaceId: string,
  documentId: string,
  chunks: StoredDocumentChunk[]
) {
  const db = await getDb()
  const tx = db.transaction(DOCUMENT_CHUNK_STORE, "readwrite")
  const documentIndex = tx.store.index("documentId")

  for await (const cursor of documentIndex.iterate(documentId)) {
    await cursor.delete()
  }

  const now = Date.now()

  for (const chunk of chunks) {
    await tx.store.put({
      ...chunk,
      workspaceId,
      documentId,
      createdAt: chunk.createdAt || now,
    })
  }

  await tx.done
}

export async function replaceDocumentGraph(
  workspaceId: string,
  documentId: string,
  entities: StoredGraphEntity[],
  edges: StoredGraphEdge[]
) {
  const db = await getDb()
  const tx = db.transaction([GRAPH_ENTITY_STORE, GRAPH_EDGE_STORE], "readwrite")
  const entityStore = tx.objectStore(GRAPH_ENTITY_STORE)
  const edgeStore = tx.objectStore(GRAPH_EDGE_STORE)
  const entityDocumentIndex = entityStore.index("documentId")
  const edgeWorkspaceIndex = edgeStore.index("workspaceId")
  const entityIdsToDelete = new Set<string>()

  for await (const cursor of entityDocumentIndex.iterate(documentId)) {
    if (cursor.value.manualOverride || cursor.value.source === "manual") {
      continue
    }

    entityIdsToDelete.add(cursor.value.id)
    await cursor.delete()
  }

  for await (const cursor of edgeWorkspaceIndex.iterate(workspaceId)) {
    if (cursor.value.manualOverride || cursor.value.source === "manual") {
      continue
    }

    if (
      cursor.value.documentIds.includes(documentId)
      || entityIdsToDelete.has(cursor.value.sourceEntityId)
      || entityIdsToDelete.has(cursor.value.targetEntityId)
    ) {
      await cursor.delete()
    }
  }

  const now = Date.now()

  for (const entity of entities) {
    await entityStore.put({
      ...entity,
      workspaceId,
      documentId: entity.documentId ?? documentId,
      source: entity.source ?? "extracted",
      createdAt: entity.createdAt || now,
      updatedAt: now,
    })
  }

  for (const edge of edges) {
    await edgeStore.put({
      ...edge,
      workspaceId,
      source: edge.source ?? "extracted",
      createdAt: edge.createdAt || now,
      updatedAt: now,
    })
  }

  await tx.done
}

export async function getWorkspaceGraphEntities(workspaceId: string) {
  const db = await getDb()
  return db.getAllFromIndex(GRAPH_ENTITY_STORE, "workspaceId", workspaceId)
}

export async function getWorkspaceGraphEdges(workspaceId: string) {
  const db = await getDb()
  return db.getAllFromIndex(GRAPH_EDGE_STORE, "workspaceId", workspaceId)
}

function normalizeGraphEntityName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function createManualGraphEntityId(workspaceId: string, name: string) {
  const normalizedName = normalizeGraphEntityName(name).replace(/\s+/g, "-") || "entity"
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return `${workspaceId}:manual:entity:${normalizedName}:${suffix}`
}

export function createManualGraphEdgeId(workspaceId: string, sourceEntityId: string, targetEntityId: string, type: GraphEdgeType) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return `${workspaceId}:manual:edge:${sourceEntityId}:${targetEntityId}:${type}:${suffix}`
}

export async function upsertGraphEntity(entity: StoredGraphEntity) {
  const db = await getDb()
  const now = Date.now()
  const existing = await db.get(GRAPH_ENTITY_STORE, entity.id)

  await db.put(GRAPH_ENTITY_STORE, {
    ...existing,
    ...entity,
    normalizedName: normalizeGraphEntityName(entity.name),
    createdAt: entity.createdAt || existing?.createdAt || now,
    updatedAt: now,
  })
}

export async function upsertGraphEdge(edge: StoredGraphEdge) {
  const db = await getDb()
  const now = Date.now()
  const tx = db.transaction([GRAPH_ENTITY_STORE, GRAPH_EDGE_STORE], "readwrite")
  const entityStore = tx.objectStore(GRAPH_ENTITY_STORE)
  const sourceEntity = await entityStore.get(edge.sourceEntityId)
  const targetEntity = await entityStore.get(edge.targetEntityId)

  if (!sourceEntity || !targetEntity || sourceEntity.workspaceId !== edge.workspaceId || targetEntity.workspaceId !== edge.workspaceId) {
    throw new Error("Graph edge endpoints must exist in the same workspace.")
  }

  const existing = await tx.objectStore(GRAPH_EDGE_STORE).get(edge.id)

  await tx.objectStore(GRAPH_EDGE_STORE).put({
    ...existing,
    ...edge,
    createdAt: edge.createdAt || existing?.createdAt || now,
    updatedAt: now,
  })

  await tx.done
}

export async function deleteGraphEntity(workspaceId: string, entityId: string) {
  const db = await getDb()
  const tx = db.transaction([GRAPH_ENTITY_STORE, GRAPH_EDGE_STORE], "readwrite")
  const entityStore = tx.objectStore(GRAPH_ENTITY_STORE)
  const edgeStore = tx.objectStore(GRAPH_EDGE_STORE)
  const entity = await entityStore.get(entityId)

  if (!entity || entity.workspaceId !== workspaceId) {
    await tx.done
    return
  }

  await entityStore.delete(entityId)

  for await (const cursor of edgeStore.index("workspaceId").iterate(workspaceId)) {
    if (cursor.value.sourceEntityId === entityId || cursor.value.targetEntityId === entityId) {
      await cursor.delete()
    }
  }

  await tx.done
}

export async function deleteGraphEdge(workspaceId: string, edgeId: string) {
  const db = await getDb()
  const edge = await db.get(GRAPH_EDGE_STORE, edgeId)

  if (!edge || edge.workspaceId !== workspaceId) {
    return
  }

  await db.delete(GRAPH_EDGE_STORE, edgeId)
}

export async function deleteDocumentGraph(documentId: string) {
  const db = await getDb()
  const tx = db.transaction([GRAPH_ENTITY_STORE, GRAPH_EDGE_STORE], "readwrite")
  const entityStore = tx.objectStore(GRAPH_ENTITY_STORE)
  const edgeStore = tx.objectStore(GRAPH_EDGE_STORE)
  const entityDocumentIndex = entityStore.index("documentId")
  const edgeWorkspaceIndex = edgeStore.index("workspaceId")
  const entityIdsToDelete = new Set<string>()

  for await (const cursor of entityDocumentIndex.iterate(documentId)) {
    entityIdsToDelete.add(cursor.value.id)
    await cursor.delete()
  }

  for await (const cursor of edgeWorkspaceIndex.iterate()) {
    if (
      cursor.value.documentIds.includes(documentId)
      || entityIdsToDelete.has(cursor.value.sourceEntityId)
      || entityIdsToDelete.has(cursor.value.targetEntityId)
    ) {
      await cursor.delete()
    }
  }

  await tx.done
}

export async function deleteDocumentChunks(documentId: string) {
  const db = await getDb()
  const tx = db.transaction(DOCUMENT_CHUNK_STORE, "readwrite")
  const documentIndex = tx.store.index("documentId")

  for await (const cursor of documentIndex.iterate(documentId)) {
    await cursor.delete()
  }

  await tx.done
}

export async function updateWorkspaceDocument(document: StoredWorkspaceDocument) {
  const db = await getDb()
  await db.put(DOCUMENT_STORE, document)
}

export async function deleteWorkspaceDocument(documentId: string) {
  const db = await getDb()
  const tx = db.transaction([DOCUMENT_STORE, DOCUMENT_CHUNK_STORE, GRAPH_ENTITY_STORE, GRAPH_EDGE_STORE], "readwrite")
  const chunkDocumentIndex = tx.objectStore(DOCUMENT_CHUNK_STORE).index("documentId")
  const graphEntityDocumentIndex = tx.objectStore(GRAPH_ENTITY_STORE).index("documentId")
  const graphEdgeWorkspaceIndex = tx.objectStore(GRAPH_EDGE_STORE).index("workspaceId")
  const entityIdsToDelete = new Set<string>()

  await tx.objectStore(DOCUMENT_STORE).delete(documentId)

  for await (const cursor of chunkDocumentIndex.iterate(documentId)) {
    await cursor.delete()
  }

  for await (const cursor of graphEntityDocumentIndex.iterate(documentId)) {
    if (cursor.value.manualOverride || cursor.value.source === "manual") {
      continue
    }

    entityIdsToDelete.add(cursor.value.id)
    await cursor.delete()
  }

  for await (const cursor of graphEdgeWorkspaceIndex.iterate()) {
    if (cursor.value.manualOverride || cursor.value.source === "manual") {
      continue
    }

    if (
      cursor.value.documentIds.includes(documentId)
      || entityIdsToDelete.has(cursor.value.sourceEntityId)
      || entityIdsToDelete.has(cursor.value.targetEntityId)
    ) {
      await cursor.delete()
    }
  }

  await tx.done
}

export async function deleteWorkspaceDocuments(workspaceId: string) {
  const db = await getDb()
  const tx = db.transaction([DOCUMENT_STORE, DOCUMENT_CHUNK_STORE, GRAPH_ENTITY_STORE, GRAPH_EDGE_STORE], "readwrite")
  const documentWorkspaceIndex = tx.objectStore(DOCUMENT_STORE).index("workspaceId")
  const chunkWorkspaceIndex = tx.objectStore(DOCUMENT_CHUNK_STORE).index("workspaceId")
  const graphEntityWorkspaceIndex = tx.objectStore(GRAPH_ENTITY_STORE).index("workspaceId")
  const graphEdgeWorkspaceIndex = tx.objectStore(GRAPH_EDGE_STORE).index("workspaceId")

  for await (const cursor of documentWorkspaceIndex.iterate(workspaceId)) {
    await cursor.delete()
  }

  for await (const cursor of chunkWorkspaceIndex.iterate(workspaceId)) {
    await cursor.delete()
  }

  for await (const cursor of graphEntityWorkspaceIndex.iterate(workspaceId)) {
    await cursor.delete()
  }

  for await (const cursor of graphEdgeWorkspaceIndex.iterate(workspaceId)) {
    await cursor.delete()
  }

  await tx.done
}

export async function deleteWorkspace(workspaceId: string) {
  const db = await getDb()
  await db.delete(WORKSPACE_STORE, workspaceId)

  const tx = db.transaction(
    [MESSAGE_STORE, DOCUMENT_STORE, DOCUMENT_CHUNK_STORE, GRAPH_ENTITY_STORE, GRAPH_EDGE_STORE],
    "readwrite"
  )
  const messageWorkspaceIndex = tx.objectStore(MESSAGE_STORE).index("workspaceId")
  const documentWorkspaceIndex = tx.objectStore(DOCUMENT_STORE).index("workspaceId")
  const chunkWorkspaceIndex = tx.objectStore(DOCUMENT_CHUNK_STORE).index("workspaceId")
  const graphEntityWorkspaceIndex = tx.objectStore(GRAPH_ENTITY_STORE).index("workspaceId")
  const graphEdgeWorkspaceIndex = tx.objectStore(GRAPH_EDGE_STORE).index("workspaceId")

  for await (const cursor of messageWorkspaceIndex.iterate(workspaceId)) {
    await cursor.delete()
  }

  for await (const cursor of documentWorkspaceIndex.iterate(workspaceId)) {
    await cursor.delete()
  }

  for await (const cursor of chunkWorkspaceIndex.iterate(workspaceId)) {
    await cursor.delete()
  }

  for await (const cursor of graphEntityWorkspaceIndex.iterate(workspaceId)) {
    await cursor.delete()
  }

  for await (const cursor of graphEdgeWorkspaceIndex.iterate(workspaceId)) {
    await cursor.delete()
  }

  await tx.done
}

export async function clearDocuChatData() {
  const db = await getDb()
  const tx = db.transaction(
    [MESSAGE_STORE, WORKSPACE_STORE, DOCUMENT_STORE, DOCUMENT_CHUNK_STORE, GRAPH_ENTITY_STORE, GRAPH_EDGE_STORE],
    "readwrite"
  )

  await Promise.all([
    tx.objectStore(MESSAGE_STORE).clear(),
    tx.objectStore(WORKSPACE_STORE).clear(),
    tx.objectStore(DOCUMENT_STORE).clear(),
    tx.objectStore(DOCUMENT_CHUNK_STORE).clear(),
    tx.objectStore(GRAPH_ENTITY_STORE).clear(),
    tx.objectStore(GRAPH_EDGE_STORE).clear(),
    tx.done,
  ])
}
