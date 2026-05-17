import {
  deleteDocumentChunks,
  deleteDocumentGraph,
  replaceDocumentChunks,
  replaceDocumentGraph,
  type StoredDocumentChunk,
} from "@/lib/chat-history/indexed-db"
import {
  createParentChildChunks,
  type PageText,
  type ParentChildChunkOptions,
  type ParentChunk,
} from "./chunking"
import {
  generateEmbeddings,
  type GeneratedEmbedding,
} from "./embeddings"
import { applyGraphEntityEmbeddings, buildDocumentGraph } from "./graph-extraction"
import { extractGraphWithLlm, type ExtractGraphWithLlmInput } from "./llm-graph-extraction"
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
  embeddingCount?: number
  graphEdgeCount?: number
  graphEntityCount?: number
  pageCount?: number
  parentChunkCount?: number
}

type FileProcessor = (job: FileProcessingJob) => Promise<FileProcessingResult>

interface DocumentPipelineOptions extends ParentChildChunkOptions {
  extractGraphWithLlm?: (input: ExtractGraphWithLlmInput) => Promise<Awaited<ReturnType<typeof extractGraphWithLlm>>>
  generateEmbeddings?: (texts: string[]) => Promise<GeneratedEmbedding[]>
}

interface PdfPipelineOptions extends DocumentPipelineOptions {
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

async function processUnsupported(kind: FileProcessorKind, job: FileProcessingJob): Promise<FileProcessingResult> {
  throw new Error(`${kind} processing is not implemented for ${job.fileName}`)
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
  parents: ParentChunk[],
  childEmbeddings: GeneratedEmbedding[]
) {
  const now = Date.now()
  const chunks: StoredDocumentChunk[] = []
  let childEmbeddingIndex = 0

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
      const generatedEmbedding = childEmbeddings[childEmbeddingIndex]

      chunks.push({
        id: child.id,
        workspaceId,
        documentId,
        chunkId: child.id,
        embedding: generatedEmbedding?.embedding,
        embeddingDimensions: generatedEmbedding?.dimensions,
        embeddingModel: generatedEmbedding?.model,
        parentChunkId: parent.id,
        level: "child",
        text: child.text,
        pageNumbers: child.pageNumbers,
        order: chunks.length,
        createdAt: now,
      })
      childEmbeddingIndex += 1
    }
  }

  return chunks
}

async function processPageTextPipeline(
  job: FileProcessingJob,
  pages: PageText[],
  processor: FileProcessorKind,
  options: DocumentPipelineOptions = {}
) {
  if (!job.workspaceId || !job.documentId) {
    throw new Error("Document processing requires workspaceId and documentId")
  }

  if (!job.content) {
    throw new Error("Document processing requires file content")
  }

  let didPersistChunks = false

  try {
    const parentChunks = createParentChildChunks(pages, {
      ...options,
      idPrefix: options.idPrefix ?? job.documentId,
    })
    const childChunks = parentChunks.flatMap((parent) => parent.children)
    const childEmbeddings = await (options.generateEmbeddings ?? generateEmbeddings)(
      childChunks.map((child) => child.text)
    )
    const storedChunks = flattenChunks(
      job.workspaceId,
      job.documentId,
      parentChunks,
      childEmbeddings
    )

    await replaceDocumentChunks(job.workspaceId, job.documentId, storedChunks)
    didPersistChunks = true

    const llmExtraction = await (options.extractGraphWithLlm ?? extractGraphWithLlm)({
      documentName: job.fileName,
      textSections: parentChunks.map((parent) => ({
        id: parent.id,
        pageNumbers: parent.pageNumbers,
        text: parent.text,
      })),
    }).catch(() => undefined)

    const documentGraph = buildDocumentGraph(
      job.workspaceId,
      job.documentId,
      storedChunks,
      { llmExtraction }
    )
    const graphEntityEmbeddings = documentGraph.entities.length > 0
      ? await (options.generateEmbeddings ?? generateEmbeddings)(
          documentGraph.entities.map((entity) => [
            entity.name,
            ...entity.aliases,
            entity.mentions[0]?.text ?? "",
          ].join("\n"))
        )
      : []
    const embeddedDocumentGraph = applyGraphEntityEmbeddings(
      documentGraph,
      graphEntityEmbeddings
    )

    await replaceDocumentGraph(
      job.workspaceId,
      job.documentId,
      embeddedDocumentGraph.entities,
      embeddedDocumentGraph.edges
    )

    return {
      byteLength: job.content.byteLength,
      childChunkCount: parentChunks.reduce(
        (total, parent) => total + parent.children.length,
        0
      ),
      embeddingCount: childEmbeddings.length,
      graphEdgeCount: embeddedDocumentGraph.edges.length,
      graphEntityCount: embeddedDocumentGraph.entities.length,
      pageCount: pages.length,
      parentChunkCount: parentChunks.length,
      processor,
    } satisfies FileProcessingResult
  } catch (error) {
    if (didPersistChunks) {
      await deleteDocumentChunks(job.documentId)
      await deleteDocumentGraph(job.documentId)
    }

    throw error
  }
}

function decodeTextContent(content: ArrayBuffer) {
  return normalizeText(new TextDecoder().decode(content))
}

export async function processTextPipeline(
  job: FileProcessingJob,
  options: DocumentPipelineOptions = {}
) {
  if (!job.content) {
    throw new Error("Text processing requires file content")
  }

  const text = decodeTextContent(job.content)

  if (!text) {
    throw new Error(`No extractable text found in ${job.fileName}`)
  }

  return processPageTextPipeline(
    job,
    [{ pageNumber: 1, text }],
    "text",
    options
  )
}

async function processCsvPipeline(job: FileProcessingJob) {
  const result = await processTextPipeline(job)

  return {
    ...result,
    processor: "spreadsheet",
  } satisfies FileProcessingResult
}

async function processMarkdownPipeline(job: FileProcessingJob) {
  return processTextPipeline(job)
}

export async function processPdfPipeline(
  job: FileProcessingJob,
  options: PdfPipelineOptions = {}
) {
  if (!job.content) {
    throw new Error("PDF processing requires file content")
  }

  const pages = await (options.extractTextByPage ?? extractPdfTextByPage)(job.content)

  return processPageTextPipeline(job, pages, "pdf", options)
}

const processorByExtension: Record<string, FileProcessor> = {
  csv: (job) => processCsvPipeline(job),
  doc: (job) => processUnsupported("word", job),
  docx: (job) => processUnsupported("word", job),
  md: (job) => processMarkdownPipeline(job),
  pdf: (job) => processPdfPipeline(job),
  ppt: (job) => processUnsupported("presentation", job),
  pptx: (job) => processUnsupported("presentation", job),
  txt: (job) => processTextPipeline(job),
  xls: (job) => processUnsupported("spreadsheet", job),
  xlsx: (job) => processUnsupported("spreadsheet", job),
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

const genericProcessor: FileProcessor = (job) => processUnsupported("generic", job)

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
