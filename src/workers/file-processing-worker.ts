import { processWorkspaceFile } from "@/lib/file-processing/processors"

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
      fileName: event.data.fileName,
      fileType: event.data.fileType,
      mimeType: event.data.mimeType,
      content: event.data.content,
    })

    self.postMessage({
      workspaceId: event.data.workspaceId,
      documentId: event.data.documentId,
      byteLength: result.byteLength,
      processor: result.processor,
      processingStatus: "processed",
    })
  } catch (error) {
    self.postMessage({
      workspaceId: event.data.workspaceId,
      documentId: event.data.documentId,
      errorMessage: error instanceof Error ? error.message : "File processing failed",
      processingStatus: "toBeProcessed",
    })
  }
}

export {}
