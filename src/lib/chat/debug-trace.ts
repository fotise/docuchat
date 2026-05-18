import type { RagDebugTrace } from "@/lib/llm/types"

function safeStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export function createRagDebugTraceJson(trace: RagDebugTrace) {
  return safeStringify(trace)
}

export function createRagDebugTraceMarkdown(trace: RagDebugTrace) {
  const lines = [
    "# DocuChat RAG Debug Trace",
    "",
    `- Trace ID: ${trace.id}`,
    `- Created at: ${trace.createdAt}`,
    `- Workspace: ${trace.workspaceTitle}`,
    `- Tab: ${trace.tabLabel}`,
    `- User prompt: ${trace.userPrompt}`,
    `- Selected retrieval mode: ${trace.selectedRetrievalMode ?? "auto"}`,
    `- Effective retrieval mode: ${trace.effectiveRetrievalMode}`,
    `- Retrieval confidence: ${trace.retrieval.confidence}`,
    `- Semantic chunks: ${trace.retrieval.diagnostics.semanticChunkCount}`,
    `- Graph chunks: ${trace.retrieval.diagnostics.graphChunkCount}`,
    `- Target documents: ${trace.retrieval.diagnostics.effectiveTargetDocumentNames.join(", ") || "All files"}`,
    `- Model: ${trace.model ? `${trace.model.clientLabel} (${trace.model.clientId})` : "not captured"}`,
    "",
    "## Effective Search Queries",
    ...trace.retrieval.diagnostics.effectiveSearchQueries.map((query, index) => `${index + 1}. ${query}`),
    "",
    "## Retrieved Chunks",
    trace.retrieval.retrievedChunks.length > 0 ? "" : "No chunks captured.",
    ...trace.retrieval.retrievedChunks.flatMap((chunk, index) => [
      `### Chunk ${index + 1}`,
      `- Source: ${chunk.documentName ?? chunk.documentId}`,
      `- Parent ID: ${chunk.parentChunkId}`,
      `- Source type: ${chunk.retrievalSource ?? "unknown"}`,
      `- Score: ${chunk.score.toFixed(3)}`,
      `- Similarity: ${chunk.similarity.toFixed(3)}`,
      `- Pages: ${chunk.pageNumbers.join(", ") || "unknown"}`,
      chunk.graphEntityNames?.length ? `- Graph entities: ${chunk.graphEntityNames.join(", ")}` : undefined,
      chunk.graphEdgeTypes?.length ? `- Graph edges: ${chunk.graphEdgeTypes.join(", ")}` : undefined,
      chunk.excerpt ? `\nExcerpt:\n\n> ${chunk.excerpt.replace(/\n/g, "\n> ")}` : undefined,
      "",
    ].filter((line): line is string => Boolean(line))),
    "## Planner Result",
    "```json",
    safeStringify(trace.planner.result),
    "```",
    "",
    "## Final Prompt Sent To Model",
    trace.model?.finalPrompt ? "```text" : "Final prompt was not captured for this client/scenario.",
    ...(trace.model?.finalPrompt ? [trace.model.finalPrompt, "```"] : []),
  ]

  return lines.join("\n")
}

export async function copyTextToClipboard(text: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard API is not available.")
  }

  await navigator.clipboard.writeText(text)
}
