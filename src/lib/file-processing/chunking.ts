export interface PageText {
  pageNumber: number
  text: string
}

export interface ChildChunk {
  id: string
  parentId: string
  text: string
  pageNumbers: number[]
  order: number
}

export interface ParentChunk {
  id: string
  text: string
  pageNumbers: number[]
  order: number
  children: ChildChunk[]
}

export interface ParentChildChunkOptions {
  childChunkOverlap?: number
  childChunkSize?: number
  idPrefix?: string
  parentChunkOverlap?: number
  parentChunkSize?: number
  separators?: string[]
}

const DEFAULT_PARENT_CHUNK_SIZE = 1800
const DEFAULT_PARENT_CHUNK_OVERLAP = 180
const DEFAULT_CHILD_CHUNK_SIZE = 500
const DEFAULT_CHILD_CHUNK_OVERLAP = 80
const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " "]

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function uniquePageNumbers(pageNumbers: number[]) {
  return [...new Set(pageNumbers)].sort((a, b) => a - b)
}

function getValidChunkSize(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function getValidOverlap(value: number, chunkSize: number, fallback: number) {
  if (!Number.isFinite(value) || value < 0) {
    return fallback
  }

  return Math.min(Math.floor(value), chunkSize - 1)
}

function getChunkEnd(
  text: string,
  start: number,
  size: number,
  separators: string[]
) {
  const preferredEnd = Math.min(start + size, text.length)

  if (preferredEnd === text.length) {
    return preferredEnd
  }

  for (const separator of separators) {
    const boundary = text.lastIndexOf(separator, preferredEnd)

    if (boundary > start) {
      return boundary + separator.length
    }
  }

  return preferredEnd
}

export function splitText(
  text: string,
  size: number,
  overlap: number,
  separators = DEFAULT_SEPARATORS
) {
  const source = text.trim()
  const chunks: string[] = []
  const chunkSize = getValidChunkSize(size, DEFAULT_CHILD_CHUNK_SIZE)
  const chunkOverlap = getValidOverlap(overlap, chunkSize, 0)
  let start = 0

  while (start < source.length) {
    const end = getChunkEnd(source, start, chunkSize, separators)
    const chunk = normalizeText(source.slice(start, end))

    if (chunk) {
      chunks.push(chunk)
    }

    if (end >= source.length) {
      break
    }

    start = Math.max(end - chunkOverlap, start + 1)
  }

  return chunks
}

function createChildChunks(
  parent: Omit<ParentChunk, "children">,
  childChunkSize: number,
  childChunkOverlap: number,
  idPrefix: string,
  separators: string[]
) {
  return splitText(parent.text, childChunkSize, childChunkOverlap, separators).map(
    (text, index) => ({
      id: `${idPrefix}:child:${parent.order}:${index}`,
      parentId: parent.id,
      text,
      pageNumbers: parent.pageNumbers,
      order: index,
    }) satisfies ChildChunk
  )
}

export function createParentChildChunks(
  pages: PageText[],
  options: ParentChildChunkOptions = {}
) {
  const parentChunkSize = getValidChunkSize(
    options.parentChunkSize ?? DEFAULT_PARENT_CHUNK_SIZE,
    DEFAULT_PARENT_CHUNK_SIZE
  )
  const parentChunkOverlap = getValidOverlap(
    options.parentChunkOverlap === undefined
      ? DEFAULT_PARENT_CHUNK_OVERLAP
      : options.parentChunkOverlap,
    parentChunkSize,
    0
  )
  const childChunkSize = getValidChunkSize(
    options.childChunkSize ?? DEFAULT_CHILD_CHUNK_SIZE,
    DEFAULT_CHILD_CHUNK_SIZE
  )
  const childChunkOverlap = getValidOverlap(
    options.childChunkOverlap === undefined
      ? DEFAULT_CHILD_CHUNK_OVERLAP
      : options.childChunkOverlap,
    childChunkSize,
    0
  )
  const idPrefix = options.idPrefix ?? "chunk"
  const separators = options.separators ?? DEFAULT_SEPARATORS
  const parents: ParentChunk[] = []
  let parentOrder = 0

  function addParent(text: string, pageNumbers: number[]) {
    const normalized = normalizeText(text)

    if (!normalized) {
      return
    }

    const parent = {
      id: `${idPrefix}:parent:${parentOrder}`,
      text: normalized,
      pageNumbers: uniquePageNumbers(pageNumbers),
      order: parentOrder,
    }
    const children = createChildChunks(
      parent,
      childChunkSize,
      childChunkOverlap,
      idPrefix,
      separators
    )

    parents.push({ ...parent, children })
    parentOrder += 1
  }

  for (const page of pages) {
    for (const chunk of splitText(
      page.text,
      parentChunkSize,
      parentChunkOverlap,
      separators
    )) {
      addParent(chunk, [page.pageNumber])
    }
  }

  return parents
}
