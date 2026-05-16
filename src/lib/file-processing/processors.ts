import {
  replaceDocumentChunks,
  type StoredDocumentChunk,
} from "@/lib/chat-history/indexed-db"
import {
  createParentChildChunks,
  type PageText,
  type ParentChildChunkOptions,
  type ParentChunk,
} from "./chunking"
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

interface PdfPipelineOptions extends ParentChildChunkOptions {
  extractTextByPage?: (content: ArrayBuffer) => Promise<PageText[]>
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
  const pages: PageText[] = []

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

function flattenChunks(
  workspaceId: string,
  documentId: string,
  parents: ParentChunk[]
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
  const parentChunks = createParentChildChunks(pages, {
    ...options,
    idPrefix: options.idPrefix ?? job.documentId,
  })
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
