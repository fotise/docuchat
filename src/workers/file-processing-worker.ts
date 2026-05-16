interface FileProcessingRequest {
  workspaceId: string
  documentId: string
  content?: ArrayBuffer
}

self.onmessage = (event: MessageEvent<FileProcessingRequest>) => {
  // Future CPU-heavy parsing/embedding work must happen here, inside the worker,
  // so the React UI thread stays responsive while files are processed.
  const byteLength = event.data.content?.byteLength ?? 0

  self.postMessage({
    workspaceId: event.data.workspaceId,
    documentId: event.data.documentId,
    byteLength,
    processingStatus: "processed",
  })
}

export {}
