import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type { WorkspaceMessage, WorkspaceTabId } from "@/types/dashboard"

const DB_NAME = "docuchat"
const DB_VERSION = 1
const MESSAGE_STORE = "messages"
const MESSAGE_LIMIT = 100

export interface StoredChatMessage extends WorkspaceMessage {
  workspaceId: string
  tabId: WorkspaceTabId
  createdAt: number
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
}

let dbPromise: Promise<IDBPDatabase<DocuChatDb>> | null = null

function getDb() {
  dbPromise ??= openDB<DocuChatDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
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
