export type FileProcessorKind =
  | "generic"
  | "pdf"
  | "presentation"
  | "spreadsheet"
  | "text"
  | "word"

export interface FileProcessingJob {
  fileName: string
  fileType?: string
  mimeType?: string
  content?: ArrayBuffer
}

export interface FileProcessingResult {
  byteLength: number
  processor: FileProcessorKind
}

type FileProcessor = (job: FileProcessingJob) => Promise<FileProcessingResult>

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

const processorByExtension: Record<string, FileProcessor> = {
  csv: (job) => processWith("spreadsheet", job),
  doc: (job) => processWith("word", job),
  docx: (job) => processWith("word", job),
  md: (job) => processWith("text", job),
  pdf: (job) => processWith("pdf", job),
  ppt: (job) => processWith("presentation", job),
  pptx: (job) => processWith("presentation", job),
  txt: (job) => processWith("text", job),
  xls: (job) => processWith("spreadsheet", job),
  xlsx: (job) => processWith("spreadsheet", job),
}

const genericProcessor: FileProcessor = (job) => processWith("generic", job)

export function getFileProcessor(job: FileProcessingJob) {
  const extension = getExtension(job)

  return processorByExtension[extension] ?? genericProcessor
}

export async function processWorkspaceFile(job: FileProcessingJob) {
  const processor = getFileProcessor(job)

  return processor(job)
}
