import {
  replaceDocumentChunks,
  type StoredDocumentChunk,
} from "@/lib/chat-history/indexed-db"
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url"

export type FileProcessorKind =
  | "generic"
  | "pdf"
  | "presentation"
  | "spreadsheet"
  | "text"
  | "word"

export interface FileProcessingJob {
  workspaceId?: string
  documentId?: string
  fileName: string
  fileType?: string
  mimeType?: string
  content?: ArrayBuffer
}

export interface FileProcessingResult {
  byteLength: number
  processor: FileProcessorKind
  childChunkCount?: number
  pageCount?: number
  parentChunkCount?: number
}

type FileProcessor = (job: FileProcessingJob) => Promise<FileProcessingResult>

export interface PdfPageText {
  pageNumber: number
  text: string
}

export interface PdfChildChunk {
  id: string
  parentId: string
  text: string
  pageNumbers: number[]
  order: number
}

export interface PdfParentChunk {
  id: string
  text: string
  pageNumbers: number[]
  order: number
  children: PdfChildChunk[]
}

interface PdfPipelineOptions {
  childChunkOverlap?: number
  childChunkSize?: number
  extractTextByPage?: (content: ArrayBuffer) => Promise<PdfPageText[]>
  parentChunkOverlap?: number
  parentChunkSize?: number
}

interface PdfJsTextContent {
  items: unknown[]
}

interface PdfJsPage {
  getTextContent: () => Promise<PdfJsTextContent>
}

interface PdfJsDocument {
  destroy?: () => Promise<void> | void
  getPage: (pageNumber: number) => Promise<PdfJsPage>
  numPages: number
}

interface PdfJsWorker {
  destroy: () => void
}

interface PdfJsModule {
  GlobalWorkerOptions: {
    workerSrc: string
  }
  PDFWorker: {
    create: (options: { name: string; port: Worker }) => PdfJsWorker
  }
  getDocument: (options: {
    data: Uint8Array
    isEvalSupported: boolean
    worker?: PdfJsWorker
  }) => {
    promise: Promise<PdfJsDocument>
  }
}

const DEFAULT_PARENT_CHUNK_SIZE = 1800
const DEFAULT_PARENT_CHUNK_OVERLAP = 180
const DEFAULT_CHILD_CHUNK_SIZE = 500
const DEFAULT_CHILD_CHUNK_OVERLAP = 80

const mimeTypeExtensionMap: Record<string, string> = {
  "application/msword": "doc",
  "application/pdf": "pdf",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/csv": "csv",
  "text/markdown": "md",
  "text/plain": "txt",
}

function getFileNameExtension(fileName: string) {
  return fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : undefined
}

function getExtension({ fileName, fileType, mimeType }: FileProcessingJob) {
  const normalizedFileType = fileType?.toLowerCase()
  const normalizedMimeType = mimeType?.toLowerCase()

  if (normalizedFileType && !normalizedFileType.includes("/")) {
    return normalizedFileType
  }

  return (
    getFileNameExtension(fileName) ||
    (normalizedMimeType ? mimeTypeExtensionMap[normalizedMimeType] : undefined) ||
    (normalizedFileType ? mimeTypeExtensionMap[normalizedFileType] : undefined) ||
    "file"
  )
}

async function processWith(kind: FileProcessorKind, job: FileProcessingJob) {
  return {
    byteLength: job.content?.byteLength ?? 0,
    processor: kind,
  }
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function getTextItemString(item: unknown) {
  if (typeof item !== "object" || item === null || !("str" in item)) {
    return ""
  }

  const value = (item as { str?: unknown }).str
  return typeof value === "string" ? value : ""
}

function uniquePageNumbers(pageNumbers: number[]) {
  return [...new Set(pageNumbers)].sort((a, b) => a - b)
}

function getChunkEnd(text: string, start: number, size: number) {
  const preferredEnd = Math.min(start + size, text.length)

  if (preferredEnd === text.length) {
    return preferredEnd
  }

  const boundary = text.lastIndexOf(" ", preferredEnd)
  return boundary > start ? boundary : preferredEnd
}

function splitText(text: string, size: number, overlap: number) {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = getChunkEnd(text, start, size)
    const chunk = text.slice(start, end).trim()

    if (chunk) {
      chunks.push(chunk)
    }

    if (end >= text.length) {
      break
    }

    start = Math.max(end - overlap, start + 1)
  }

  return chunks
}

async function extractPdfTextByPage(content: ArrayBuffer) {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule

  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const pdfWorker = pdfjs.PDFWorker.create({
    name: "docuchat-pdf-worker",
    port: new Worker(pdfWorkerUrl, { type: "module" }),
  })

  const documentTask = pdfjs.getDocument({
    data: new Uint8Array(content),
    isEvalSupported: false,
    worker: pdfWorker,
  })
  const pdf = await documentTask.promise
  const pages: PdfPageText[] = []

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const text = normalizeText(
        textContent.items.map(getTextItemString).filter(Boolean).join(" ")
      )

      pages.push({ pageNumber, text })
    }
  } finally {
    await pdf.destroy?.()
    pdfWorker.destroy()
  }

  return pages
}

function createChildChunks(
  documentId: string,
  parent: Omit<PdfParentChunk, "children">,
  childChunkSize: number,
  childChunkOverlap: number
) {
  return splitText(parent.text, childChunkSize, childChunkOverlap).map(
    (text, index) => ({
      id: `${documentId}:child:${parent.order}:${index}`,
      parentId: parent.id,
      text,
      pageNumbers: parent.pageNumbers,
      order: index,
    }) satisfies PdfChildChunk
  )
}

export function createParentChildChunks(
  documentId: string,
  pages: PdfPageText[],
  options: Omit<PdfPipelineOptions, "extractTextByPage"> = {}
) {
  const parentChunkSize = options.parentChunkSize ?? DEFAULT_PARENT_CHUNK_SIZE
  const parentChunkOverlap = options.parentChunkOverlap ?? DEFAULT_PARENT_CHUNK_OVERLAP
  const childChunkSize = options.childChunkSize ?? DEFAULT_CHILD_CHUNK_SIZE
  const childChunkOverlap = options.childChunkOverlap ?? DEFAULT_CHILD_CHUNK_OVERLAP
  const parents: PdfParentChunk[] = []
  let parentOrder = 0

  function addParent(text: string, pageNumbers: number[]) {
    const normalized = normalizeText(text)

    if (!normalized) {
      return
    }

    const parent = {
      id: `${documentId}:parent:${parentOrder}`,
      text: normalized,
      pageNumbers: uniquePageNumbers(pageNumbers),
      order: parentOrder,
    }
    const children = createChildChunks(
      documentId,
      parent,
      childChunkSize,
      childChunkOverlap
    )

    parents.push({ ...parent, children })
    parentOrder += 1
  }

  for (const page of pages) {
    const text = normalizeText(page.text)

    if (!text) {
      continue
    }

    for (const chunk of splitText(text, parentChunkSize, parentChunkOverlap)) {
      addParent(chunk, [page.pageNumber])
    }
  }

  return parents
}

function flattenChunks(
  workspaceId: string,
  documentId: string,
  parents: PdfParentChunk[]
) {
  const now = Date.now()
  const chunks: StoredDocumentChunk[] = []

  for (const parent of parents) {
    chunks.push({
      id: parent.id,
      workspaceId,
      documentId,
      chunkId: parent.id,
      level: "parent",
      text: parent.text,
      pageNumbers: parent.pageNumbers,
      order: chunks.length,
      createdAt: now,
    })

    for (const child of parent.children) {
      chunks.push({
        id: child.id,
        workspaceId,
        documentId,
        chunkId: child.id,
        parentChunkId: parent.id,
        level: "child",
        text: child.text,
        pageNumbers: child.pageNumbers,
        order: chunks.length,
        createdAt: now,
      })
    }
  }

  return chunks
}

export async function processPdfPipeline(
  job: FileProcessingJob,
  options: PdfPipelineOptions = {}
) {
  if (!job.workspaceId || !job.documentId) {
    throw new Error("PDF processing requires workspaceId and documentId")
  }

  if (!job.content) {
    throw new Error("PDF processing requires file content")
  }

  // Step 1: extract page-aware text inside the worker.
  const pages = await (options.extractTextByPage ?? extractPdfTextByPage)(job.content)

  // Step 2: create parent/child chunks while preserving page references.
  const parentChunks = createParentChildChunks(job.documentId, pages, options)
  const storedChunks = flattenChunks(job.workspaceId, job.documentId, parentChunks)

  // Step 3: persist the searchable chunk index in IndexedDB.
  await replaceDocumentChunks(job.workspaceId, job.documentId, storedChunks)

  return {
    byteLength: job.content.byteLength,
    childChunkCount: parentChunks.reduce(
      (total, parent) => total + parent.children.length,
      0
    ),
    pageCount: pages.length,
    parentChunkCount: parentChunks.length,
    processor: "pdf",
  } satisfies FileProcessingResult
}

const processorByExtension: Record<string, FileProcessor> = {
  csv: (job) => processWith("spreadsheet", job),
  doc: (job) => processWith("word", job),
  docx: (job) => processWith("word", job),
  md: (job) => processWith("text", job),
  pdf: (job) => processPdfPipeline(job),
  ppt: (job) => processWith("presentation", job),
  pptx: (job) => processWith("presentation", job),
  txt: (job) => processWith("text", job),
  xls: (job) => processWith("spreadsheet", job),
  xlsx: (job) => processWith("spreadsheet", job),
}

const processorKindByExtension: Record<string, FileProcessorKind> = {
  csv: "spreadsheet",
  doc: "word",
  docx: "word",
  md: "text",
  pdf: "pdf",
  ppt: "presentation",
  pptx: "presentation",
  txt: "text",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
}

const genericProcessor: FileProcessor = (job) => processWith("generic", job)

export function getFileProcessorKind(job: FileProcessingJob): FileProcessorKind {
  const extension = getExtension(job)

  return processorKindByExtension[extension] ?? "generic"
}

export function getFileProcessor(job: FileProcessingJob) {
  const extension = getExtension(job)

  return processorByExtension[extension] ?? genericProcessor
}

export async function processWorkspaceFile(job: FileProcessingJob) {
  const processor = getFileProcessor(job)

  return processor(job)
}
