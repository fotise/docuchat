import { processWorkspaceFile } from "@/lib/file-processing/processors"

const FILE_PROCESSING_RESULT_MESSAGE = "docuchat:file-processing-result"

interface FileProcessingRequest {
  workspaceId: string
  documentId: string
  fileName: string
  fileType?: string
  mimeType?: string
  content?: ArrayBuffer
}

self.onmessage = async (event: MessageEvent<FileProcessingRequest>) => {
  try {
    // Future CPU-heavy parsing/embedding work must happen here, inside the worker,
    // so the React UI thread stays responsive while files are processed.
    const result = await processWorkspaceFile({
      workspaceId: event.data.workspaceId,
      documentId: event.data.documentId,
      fileName: event.data.fileName,
      fileType: event.data.fileType,
      mimeType: event.data.mimeType,
      content: event.data.content,
    })

    self.postMessage({
      type: FILE_PROCESSING_RESULT_MESSAGE,
      workspaceId: event.data.workspaceId,
      documentId: event.data.documentId,
      byteLength: result.byteLength,
      childChunkCount: result.childChunkCount,
      chunkCount: result.parentChunkCount !== undefined || result.childChunkCount !== undefined
        ? (result.parentChunkCount ?? 0) + (result.childChunkCount ?? 0)
        : undefined,
      embeddingCount: result.embeddingCount,
      pageCount: result.pageCount,
      parentChunkCount: result.parentChunkCount,
      processor: result.processor,
      processingStatus: "processed",
    })
  } catch (error) {
    console.error("[DocuChat] File processing pipeline failed", {
      documentId: event.data.documentId,
      error,
      fileName: event.data.fileName,
      workspaceId: event.data.workspaceId,
    })

    self.postMessage({
      type: FILE_PROCESSING_RESULT_MESSAGE,
      workspaceId: event.data.workspaceId,
      documentId: event.data.documentId,
      errorMessage: error instanceof Error ? error.message : "File processing failed",
      processingStatus: "error",
    })
  }
}

export {}
