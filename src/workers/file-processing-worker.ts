import { processWorkspaceFile } from "@/lib/file-processing/processors"
import type { WorkspaceGraphExtractionTerms } from "@/types/dashboard"

const FILE_PROCESSING_RESULT_MESSAGE = "docuchat:file-processing-result"

function postProcessingProgress(eventData: FileProcessingRequest, progress: number) {
  self.postMessage({
    type: FILE_PROCESSING_RESULT_MESSAGE,
    workspaceId: eventData.workspaceId,
    documentId: eventData.documentId,
    processingProgress: progress,
    processingStatus: "processing",
  })
}

interface FileProcessingRequest {
  graphExtractionTerms?: Partial<WorkspaceGraphExtractionTerms>
  workspaceId: string
  documentId: string
  fileName: string
  fileType?: string
  mimeType?: string
  content?: ArrayBuffer
}

self.onmessage = async (event: MessageEvent<FileProcessingRequest>) => {
  try {
    postProcessingProgress(event.data, 5)
    // Future CPU-heavy parsing/embedding work must happen here, inside the worker,
    // so the React UI thread stays responsive while files are processed.
    const result = await processWorkspaceFile({
      workspaceId: event.data.workspaceId,
      documentId: event.data.documentId,
      fileName: event.data.fileName,
      fileType: event.data.fileType,
      mimeType: event.data.mimeType,
      content: event.data.content,
      graphExtractionTerms: event.data.graphExtractionTerms,
    }, {
      onProgress: (progress) => postProcessingProgress(event.data, progress),
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
      graphEdgeCount: result.graphEdgeCount,
      graphEntityCount: result.graphEntityCount,
      pageCount: result.pageCount,
      parentChunkCount: result.parentChunkCount,
      processor: result.processor,
      processingProgress: 100,
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
      processingProgress: 0,
      processingStatus: "error",
    })
  }
}

export {}
