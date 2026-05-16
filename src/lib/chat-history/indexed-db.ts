import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type {
  UploadedDocument,
  WorkspaceMessage,
  WorkspaceRouteConfig,
  WorkspaceTabId,
} from "@/types/dashboard"

const DB_NAME = "docuchat"
const DB_VERSION = 3
const MESSAGE_STORE = "messages"
const WORKSPACE_STORE = "workspaces"
const DOCUMENT_STORE = "documents"
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

export async function updateWorkspaceDocument(document: StoredWorkspaceDocument) {
  const db = await getDb()
  await db.put(DOCUMENT_STORE, document)
}

export async function deleteWorkspaceDocument(documentId: string) {
  const db = await getDb()
  await db.delete(DOCUMENT_STORE, documentId)
}

export async function deleteWorkspace(workspaceId: string) {
  const db = await getDb()
  await db.delete(WORKSPACE_STORE, workspaceId)

  const tx = db.transaction([MESSAGE_STORE, DOCUMENT_STORE], "readwrite")
  const messageWorkspaceIndex = tx.objectStore(MESSAGE_STORE).index("workspaceId")
  const documentWorkspaceIndex = tx.objectStore(DOCUMENT_STORE).index("workspaceId")

  for await (const cursor of messageWorkspaceIndex.iterate(workspaceId)) {
    await cursor.delete()
  }

  for await (const cursor of documentWorkspaceIndex.iterate(workspaceId)) {
    await cursor.delete()
  }

  await tx.done
}

export async function clearDocuChatData() {
  const db = await getDb()
  const tx = db.transaction(
    [MESSAGE_STORE, WORKSPACE_STORE, DOCUMENT_STORE],
    "readwrite"
  )

  await Promise.all([
    tx.objectStore(MESSAGE_STORE).clear(),
    tx.objectStore(WORKSPACE_STORE).clear(),
    tx.objectStore(DOCUMENT_STORE).clear(),
    tx.done,
  ])
}
