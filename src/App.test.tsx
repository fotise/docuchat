import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { LlmProvider } from "@/components/llm/llm-provider"
import { WorkspaceProvider } from "@/components/workspaces/workspace-provider"
import {
  clearDocuChatData,
  getDocumentChunks,
  getWorkspaceGraphEdges,
  getWorkspaceGraphEntities,
  getWorkspaceDocuments,
  replaceDocumentChunks,
  replaceDocumentGraph,
} from "@/lib/chat-history/indexed-db"
import { createParentChildChunks } from "@/lib/file-processing/chunking"
import { buildDocumentGraph } from "@/lib/file-processing/graph-extraction"
import { parseGraphExtractionResponse } from "@/lib/file-processing/llm-graph-extraction"
import {
  graphSearchWorkspace,
  retrieveGraphContextForWorkspace,
} from "@/lib/file-processing/graph-search"
import {
  getFileProcessorKind,
  processPdfPipeline,
  processTextPipeline,
  processWorkspaceFile,
} from "@/lib/file-processing/processors"
import {
  retrieveParentChunksForWorkspace,
  semanticSearchWorkspace,
} from "@/lib/file-processing/semantic-search"
import { generateRagReply, generateRagRetrievalContext } from "@/lib/chat/rag-chat"
import { createChromeLocalLlmClient } from "@/lib/llm/chrome-local-llm"
import type { LlmClient } from "@/lib/llm"
import type { GenerateReplyInput } from "@/lib/llm/types"
import { useDashboardStore } from "@/store/dashboard-store"
import { useWorkspaceStore } from "@/store/workspace-store"
import { dashboardConfig } from "@/config/dashboard"
import App from "./App"

let lastGenerateReplyInput: GenerateReplyInput | null = null
const FILE_PROCESSING_RESULT_MESSAGE = "docuchat:file-processing-result"

const testLlmClient: LlmClient = {
  id: "test-llm",
  label: "Test LLM",
  isAvailable: async () => true,
  generateReply: async (input) => {
    lastGenerateReplyInput = input

    if (input.prompt.toLowerCase().includes("markdown")) {
      return "**Key point**\n\n- First item\n- Second item"
    }

    return `Test LLM reply for: ${input.prompt}`
  },
}

function createControlledProcessingWorker() {
  const worker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    messages: [] as Array<{ message: unknown; transfer?: Transferable[] }>,
    postMessage(message: unknown, transfer?: Transferable[]) {
      this.messages.push({ message, transfer })
    },
    terminate: () => {},
  }

  return worker
}

function renderApp() {
  return render(
    <LlmProvider client={testLlmClient}>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </LlmProvider>
  )
}

afterEach(async () => {
  cleanup()
  lastGenerateReplyInput = null
  window.LanguageModel = undefined
  localStorage.clear()
  useWorkspaceStore.setState({
    isLoaded: false,
    isProcessingDocument: false,
    workspaces: [],
  })
  useDashboardStore.setState({
    activeTabByWorkspace: {},
    messagesByWorkspaceTab: {},
    loadedByWorkspaceTab: {},
    replyingByWorkspaceTab: {},
  })
  await clearDocuChatData()
  window.history.pushState({}, "", "/")
})

describe("App", () => {
  it("redirects to the default workspace", async () => {
    renderApp()

    expect(await screen.findAllByText("Market Research")).not.toHaveLength(0)
  })

  it("opens semantic search from the header search control", async () => {
    renderApp()

    fireEvent.click(await screen.findByRole("button", { name: "Open semantic search" }))

    expect(await screen.findByRole("dialog", { name: "Semantic search" })).toBeTruthy()
    expect(screen.getByText("RAG search debugger")).toBeTruthy()
    expect(screen.getByText("Interactive graph view")).toBeTruthy()
    expect(screen.getByText("No graph nodes yet.")).toBeTruthy()
    expect(screen.getByRole("searchbox", { name: "Semantic search query" })).toBeTruthy()
    expect(screen.getByRole("spinbutton", { name: "Semantic search threshold" })).toHaveValue(0.3)
    expect(screen.getByRole("spinbutton", { name: "RAG child match limit" })).toHaveValue(40)
    expect(screen.getByRole("spinbutton", { name: "RAG parent chunk limit" })).toHaveValue(10)
    expect(screen.getByRole("spinbutton", { name: "Graph search depth" })).toHaveValue(1)
    expect(screen.getByRole("textbox", { name: "RAG target document names" })).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "RAG additional queries" })).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "Graph entity queries" })).toBeTruthy()
    expect(screen.getByRole("table", { name: "Semantic search results table" })).toBeTruthy()

    fireEvent.change(screen.getByRole("spinbutton", { name: "Semantic search threshold" }), {
      target: { value: "0.6" },
    })
    fireEvent.change(screen.getByRole("spinbutton", { name: "RAG child match limit" }), {
      target: { value: "55" },
    })
    fireEvent.change(screen.getByRole("spinbutton", { name: "RAG parent chunk limit" }), {
      target: { value: "8" },
    })
    fireEvent.change(screen.getByRole("spinbutton", { name: "Graph search depth" }), {
      target: { value: "2" },
    })

    await waitFor(() => {
      const workspace = useWorkspaceStore
        .getState()
        .workspaces.find((item) => item.id === "market-research")

      expect(workspace?.semanticSearchThreshold).toBe(0.6)
      expect(workspace?.graphSearchDepth).toBe(2)
      expect(workspace?.ragSearchChildMatchLimit).toBe(55)
      expect(workspace?.ragSearchParentChunkLimit).toBe(8)
    })

    fireEvent.click(screen.getByRole("button", { name: "Close semantic search" }))

    expect(screen.queryByRole("dialog", { name: "Semantic search" })).toBeNull()
  })

  it("ranks embedded child chunks with semantic search", async () => {
    const results = await semanticSearchWorkspace("market-research", "retention", {
      generateEmbeddings: async () => [
        {
          dimensions: 3,
          embedding: [1, 0, 0],
          model: "test-embedding-model",
        },
      ],
      getChunks: async () => [
        {
          id: "chunk-low",
          workspaceId: "market-research",
          documentId: "doc-1",
          chunkId: "chunk-low",
          level: "child",
          text: "Expansion planning context.",
          pageNumbers: [2],
          embedding: [0, 1, 0],
          embeddingDimensions: 3,
          embeddingModel: "test-embedding-model",
          order: 2,
          createdAt: 2,
        },
        {
          id: "chunk-high",
          workspaceId: "market-research",
          documentId: "doc-1",
          chunkId: "chunk-high",
          parentChunkId: "parent-1",
          level: "child",
          text: "Retention signals and customer health context.",
          pageNumbers: [1],
          embedding: [0.98, 0.02, 0],
          embeddingDimensions: 3,
          embeddingModel: "test-embedding-model",
          order: 1,
          createdAt: 1,
        },
      ],
      getDocuments: async () => [
        {
          id: "doc-1",
          workspaceId: "market-research",
          name: "Signals.pdf",
          type: "pdf",
          tone: "blue",
          mimeType: "application/pdf",
          blob: new Blob(["signals"]),
          content: new ArrayBuffer(1),
        },
      ],
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      chunk: {
        chunkId: "chunk-high",
        text: "Retention signals and customer health context.",
      },
      document: {
        name: "Signals.pdf",
      },
    })
    expect(results[0].similarity).toBeGreaterThan(0.45)
    expect(results[0].score).toBeGreaterThan(0)
  })

  it("retrieves top parent chunks from semantic child matches", async () => {
    const results = await retrieveParentChunksForWorkspace("market-research", "retention", {
      generateEmbeddings: async () => [
        {
          dimensions: 2,
          embedding: [1, 0],
          model: "test-embedding-model",
        },
      ],
      getChunks: async () => [
        {
          id: "parent-1",
          workspaceId: "market-research",
          documentId: "doc-1",
          chunkId: "parent-1",
          level: "parent",
          text: "Parent context about retention and customer health.",
          pageNumbers: [1, 2],
          order: 1,
          createdAt: 1,
        },
        {
          id: "child-1",
          workspaceId: "market-research",
          documentId: "doc-1",
          chunkId: "child-1",
          parentChunkId: "parent-1",
          level: "child",
          text: "Retention signals.",
          pageNumbers: [1],
          embedding: [1, 0],
          embeddingDimensions: 2,
          embeddingModel: "test-embedding-model",
          order: 2,
          createdAt: 2,
        },
        {
          id: "child-2",
          workspaceId: "market-research",
          documentId: "doc-1",
          chunkId: "child-2",
          parentChunkId: "parent-1",
          level: "child",
          text: "Customer health.",
          pageNumbers: [2],
          embedding: [0.95, 0.05],
          embeddingDimensions: 2,
          embeddingModel: "test-embedding-model",
          order: 3,
          createdAt: 3,
        },
      ],
      getDocuments: async () => [
        {
          id: "doc-1",
          workspaceId: "market-research",
          name: "Signals.pdf",
          type: "pdf",
          tone: "blue",
          mimeType: "application/pdf",
          blob: new Blob(["signals"]),
          content: new ArrayBuffer(1),
        },
      ],
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      documentName: "Signals.pdf",
      matchedChildChunkIds: ["child-1", "child-2"],
      matchedQueries: ["retention"],
      pageNumbers: [1, 2],
      parentChunkId: "parent-1",
      text: "Parent context about retention and customer health.",
    })
    expect(results[0].excerpt).toContain("retention")
  })

  it("uses hybrid keyword matching and targeted documents during semantic search", async () => {
    const results = await semanticSearchWorkspace("legal-files", "contract renewal 2026", {
      minSimilarity: 0.9,
      targetDocumentNames: ["Agreement.pdf"],
      generateEmbeddings: async () => [
        {
          dimensions: 2,
          embedding: [1, 0],
          model: "test-embedding-model",
        },
      ],
      getChunks: async () => [
        {
          id: "target-keyword-child",
          workspaceId: "legal-files",
          documentId: "doc-target",
          chunkId: "target-keyword-child",
          parentChunkId: "parent-target",
          level: "child",
          text: "The contract renewal deadline is in 2026.",
          pageNumbers: [4],
          embedding: [0, 1],
          embeddingDimensions: 2,
          embeddingModel: "test-embedding-model",
          order: 1,
          createdAt: 1,
        },
        {
          id: "other-keyword-child",
          workspaceId: "legal-files",
          documentId: "doc-other",
          chunkId: "other-keyword-child",
          parentChunkId: "parent-other",
          level: "child",
          text: "The contract renewal deadline is in 2026.",
          pageNumbers: [2],
          embedding: [1, 0],
          embeddingDimensions: 2,
          embeddingModel: "test-embedding-model",
          order: 2,
          createdAt: 2,
        },
      ],
      getDocuments: async () => [
        {
          id: "doc-target",
          workspaceId: "legal-files",
          name: "Agreement.pdf",
          type: "pdf",
          tone: "blue",
          mimeType: "application/pdf",
          blob: new Blob(["agreement"]),
          content: new ArrayBuffer(1),
        },
        {
          id: "doc-other",
          workspaceId: "legal-files",
          name: "Budget.pdf",
          type: "pdf",
          tone: "green",
          mimeType: "application/pdf",
          blob: new Blob(["budget"]),
          content: new ArrayBuffer(1),
        },
      ],
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      chunk: {
        chunkId: "target-keyword-child",
      },
      document: {
        name: "Agreement.pdf",
      },
      keywordScore: 1,
      sourceScore: 1,
    })
  })

  it("does not fall back to all files when targeted semantic search misses", async () => {
    const results = await semanticSearchWorkspace("legal-files", "contract renewal 2026", {
      minSimilarity: 0.1,
      targetDocumentNames: ["Missing.pdf"],
      generateEmbeddings: async () => [
        {
          dimensions: 2,
          embedding: [1, 0],
          model: "test-embedding-model",
        },
      ],
      getChunks: async () => [
        {
          id: "untargeted-child",
          workspaceId: "legal-files",
          documentId: "doc-target",
          chunkId: "untargeted-child",
          parentChunkId: "parent-target",
          level: "child",
          text: "The contract renewal deadline is in 2026.",
          pageNumbers: [4],
          embedding: [1, 0],
          embeddingDimensions: 2,
          embeddingModel: "test-embedding-model",
          order: 1,
          createdAt: 1,
        },
      ],
      getDocuments: async () => [
        {
          id: "doc-target",
          workspaceId: "legal-files",
          name: "Agreement.pdf",
          type: "pdf",
          tone: "blue",
          mimeType: "application/pdf",
          blob: new Blob(["agreement"]),
          content: new ArrayBuffer(1),
        },
      ],
    })

    expect(results).toHaveLength(0)
  })

  it("uses exact filename matching for targeted semantic search", async () => {
    const results = await semanticSearchWorkspace("legal-files", "contract renewal 2026", {
      minSimilarity: 0.1,
      targetDocumentNames: ["report"],
      generateEmbeddings: async () => [
        {
          dimensions: 2,
          embedding: [1, 0],
          model: "test-embedding-model",
        },
      ],
      getChunks: async () => [
        {
          id: "annual-report-child",
          workspaceId: "legal-files",
          documentId: "doc-annual-report",
          chunkId: "annual-report-child",
          parentChunkId: "annual-report-parent",
          level: "child",
          text: "The contract renewal deadline is in 2026.",
          pageNumbers: [4],
          embedding: [1, 0],
          embeddingDimensions: 2,
          embeddingModel: "test-embedding-model",
          order: 1,
          createdAt: 1,
        },
      ],
      getDocuments: async () => [
        {
          id: "doc-annual-report",
          workspaceId: "legal-files",
          name: "Annual_Report.pdf",
          type: "pdf",
          tone: "blue",
          mimeType: "application/pdf",
          blob: new Blob(["agreement"]),
          content: new ArrayBuffer(1),
        },
      ],
    })

    expect(results).toHaveLength(0)
  })

  it("builds and searches a local document graph for Graph RAG", async () => {
    const chunks = [
      {
        id: "parent-graph-1",
        workspaceId: "market-research",
        documentId: "doc-graph",
        chunkId: "parent-graph-1",
        level: "parent" as const,
        text: "Customer retention is linked with Customer Health and churn risk.",
        pageNumbers: [5],
        order: 1,
        createdAt: 1,
      },
      {
        id: "child-graph-1",
        workspaceId: "market-research",
        documentId: "doc-graph",
        chunkId: "child-graph-1",
        parentChunkId: "parent-graph-1",
        level: "child" as const,
        text: "Customer retention is linked with Customer Health and churn risk.",
        pageNumbers: [5],
        order: 2,
        createdAt: 2,
      },
    ]
    const graph = buildDocumentGraph("market-research", "doc-graph", chunks)

    await replaceDocumentChunks("market-research", "doc-graph", chunks)
    await replaceDocumentGraph("market-research", "doc-graph", graph.entities, graph.edges)

    expect((await getWorkspaceGraphEntities("market-research")).length).toBeGreaterThan(0)
    expect((await getWorkspaceGraphEdges("market-research")).length).toBeGreaterThan(0)

    const graphChunks = await retrieveGraphContextForWorkspace(
      "market-research",
      "relationship between retention and customer health",
      { depth: 1 }
    )

    expect(graphChunks[0]).toMatchObject({
      graphEdgeTypes: ["co_occurs_with"],
      parentChunkId: "parent-graph-1",
      retrievalSource: "graph",
    })
    expect(graphChunks[0].graphEntityNames?.join(" ").toLowerCase()).toContain("retention")
  })

  it("merges LLM-extracted graph entities and relations", () => {
    const graph = buildDocumentGraph(
      "legal-files",
      "doc-llm-graph",
      [
        {
          id: "parent-llm-graph",
          workspaceId: "legal-files",
          documentId: "doc-llm-graph",
          chunkId: "parent-llm-graph",
          level: "parent",
          text: "Delivery disruption can delay milestones.",
          pageNumbers: [7],
          order: 1,
          createdAt: 1,
        },
        {
          id: "child-llm-graph",
          workspaceId: "legal-files",
          documentId: "doc-llm-graph",
          chunkId: "child-llm-graph",
          parentChunkId: "parent-llm-graph",
          level: "child",
          text: "Delivery disruption can delay milestones.",
          pageNumbers: [7],
          order: 2,
          createdAt: 2,
        },
      ],
      {
        llmExtraction: {
          entities: [
            { name: "Supply Risk", type: "topic" },
            { name: "Delivery Delay", type: "topic" },
          ],
          relations: [
            {
              confidence: 0.9,
              evidence: "Supply risk can cause delivery delay.",
              source: "Supply Risk",
              target: "Delivery Delay",
              type: "causes",
            },
          ],
        },
      }
    )

    expect(graph.entities.map((entity) => entity.name)).toEqual(
      expect.arrayContaining(["Supply Risk", "Delivery Delay"])
    )
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confidence: 0.9,
          type: "causes",
        }),
      ])
    )
  })

  it("parses strict JSON graph extraction from a local LLM response", () => {
    const parsed = parseGraphExtractionResponse(`Here is the JSON:\n{
      "entities": [
        { "name": "Revenue Growth", "type": "metric", "aliases": ["growth"], "confidence": 0.86 }
      ],
      "relations": [
        { "source": "Revenue Growth", "target": "Customer Retention", "type": "depends_on", "evidence": "growth depends on retention", "confidence": 0.74 }
      ]
    }`)

    expect(parsed).toMatchObject({
      entities: [
        {
          aliases: ["growth"],
          confidence: 0.86,
          name: "Revenue Growth",
          type: "metric",
        },
      ],
      relations: [
        {
          confidence: 0.74,
          source: "Revenue Growth",
          target: "Customer Retention",
          type: "depends_on",
        },
      ],
    })
  })

  it("uses graph entity embeddings when lexical entity search is weak", async () => {
    const results = await graphSearchWorkspace("market-research", "loyalty signal", {
      generateEmbeddings: async () => [
        {
          dimensions: 2,
          embedding: [1, 0],
          model: "test-embedding-model",
        },
      ],
      getEdges: async () => [],
      getEntities: async () => [
        {
          id: "entity-retention",
          workspaceId: "market-research",
          documentId: "doc-1",
          name: "Customer retention",
          normalizedName: "customer retention",
          type: "topic",
          aliases: ["Customer retention"],
          mentions: [],
          confidence: 0.8,
          embedding: [0.99, 0.01],
          embeddingDimensions: 2,
          embeddingModel: "test-embedding-model",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      entity: {
        name: "Customer retention",
      },
    })
    expect(results[0].score).toBeGreaterThan(0.3)
  })

  it("keeps graphology traversal stable with reversed duplicate relations", async () => {
    const entities = [
      {
        id: "entity-a",
        workspaceId: "market-research",
        documentId: "doc-graph-target",
        name: "Revenue Growth",
        normalizedName: "revenue growth",
        type: "metric" as const,
        aliases: ["Revenue Growth"],
        mentions: [
          {
            documentId: "doc-graph-target",
            chunkId: "child-a",
            parentChunkId: "parent-a",
            pageNumbers: [1],
            text: "Revenue growth depends on retention.",
          },
        ],
        confidence: 0.9,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "entity-b",
        workspaceId: "market-research",
        documentId: "doc-graph-target",
        name: "Customer Retention",
        normalizedName: "customer retention",
        type: "topic" as const,
        aliases: ["Customer Retention"],
        mentions: [
          {
            documentId: "doc-graph-target",
            chunkId: "child-b",
            parentChunkId: "parent-a",
            pageNumbers: [1],
            text: "Revenue growth depends on retention.",
          },
        ],
        confidence: 0.9,
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    const edges = [
      {
        id: "edge-a-b",
        workspaceId: "market-research",
        sourceEntityId: "entity-a",
        targetEntityId: "entity-b",
        type: "depends_on" as const,
        documentIds: ["doc-graph-target"],
        chunkIds: ["child-a", "child-b"],
        weight: 2,
        evidenceText: ["Revenue growth depends on retention."],
        confidence: 0.8,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "edge-b-a",
        workspaceId: "market-research",
        sourceEntityId: "entity-b",
        targetEntityId: "entity-a",
        type: "depends_on" as const,
        documentIds: ["doc-graph-target"],
        chunkIds: ["child-a", "child-b"],
        weight: 2,
        evidenceText: ["Retention supports revenue growth."],
        confidence: 0.7,
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    const results = await graphSearchWorkspace("market-research", "Revenue Growth", {
      getEdges: async () => edges,
      getEntities: async () => entities,
    })

    expect(results[0]?.relatedEntities[0]?.entity.name).toBe("Customer Retention")
  })

  it("merges graph context into hybrid graph RAG retrieval", async () => {
    const workspace = dashboardConfig.workspaces[0]
    const llmClient: LlmClient = {
      id: "hybrid-graph-test-llm",
      label: "Hybrid Graph Test LLM",
      isAvailable: async () => true,
      generateRetrievalQuery: async () => ({
        graphDepth: 2,
        graphEntities: ["Customer retention", "Customer Health"],
        intent: "Explain relationships between retention and customer health.",
        needsDocumentSearch: true,
        retrievalMode: "hybrid_graph",
        searchQuery: "customer retention customer health relationship",
      }),
      generateReply: async () => "not used",
    }

    const context = await generateRagRetrievalContext({
      workspace,
      tabLabel: "Product Analysis",
      prompt: "How are retention and customer health related?",
      messages: [],
      llmClient,
      retrieveParentChunks: async () => [
        {
          documentId: "doc-1",
          documentName: "Market_Overview.pdf",
          matchedChildChunkIds: ["child-semantic"],
          pageNumbers: [3],
          parentChunkId: "parent-1",
          retrievalSource: "semantic",
          score: 0.7,
          similarity: 0.75,
          text: "Retention improved with customer health.",
        },
      ],
      retrieveGraphContext: async (_workspaceId, _query, options) => {
        expect(options.depth).toBe(2)
        expect(options.entityQueries).toContain("Customer retention")
        expect(options.targetDocumentNames).toEqual([])

        return [
          {
            documentId: "doc-1",
            documentName: "Market_Overview.pdf",
            graphEdgeTypes: ["co_occurs_with"],
            graphEntityNames: ["Customer retention", "Customer Health"],
            matchedChildChunkIds: ["child-graph"],
            pageNumbers: [3],
            parentChunkId: "parent-1",
            retrievalSource: "graph",
            score: 0.8,
            similarity: 0.8,
            text: "Retention improved with customer health.",
          },
        ]
      },
    })

    expect(context.retrievalMode).toBe("hybrid_graph")
    expect(context.retrievedChunks[0]).toMatchObject({
      graphEdgeTypes: ["co_occurs_with"],
      graphEntityNames: ["Customer retention", "Customer Health"],
      matchedChildChunkIds: ["child-semantic", "child-graph"],
      parentChunkId: "parent-1",
      retrievalSource: "hybrid",
    })
  })

  it("applies target file constraints to graph retrieval", async () => {
    const workspace = dashboardConfig.workspaces[0]
    const context = await generateRagRetrievalContext({
      workspace,
      tabLabel: "Product Analysis",
      prompt: "How are retention and customer health related in Market_Overview.pdf?",
      messages: [],
      llmClient: {
        id: "graph-target-test-llm",
        label: "Graph Target Test LLM",
        isAvailable: async () => true,
        generateRetrievalQuery: async () => ({
          graphEntities: ["Customer retention"],
          intent: "Explain graph relationship in one target file.",
          needsDocumentSearch: true,
          retrievalMode: "graph",
          searchQuery: "customer retention customer health relationship",
          targetDocumentNames: ["Market_Overview.pdf"],
        }),
        generateReply: async () => "not used",
      },
      retrieveGraphContext: async (_workspaceId, _query, options) => {
        expect(options.targetDocumentNames).toEqual(["Market_Overview.pdf"])
        return []
      },
    })

    expect(context.targetDocumentNames).toEqual(["Market_Overview.pdf"])
  })

  it("generates a retrieval query before answering chat with parent chunks", async () => {
    let retrievalQueryInput: GenerateReplyInput | null = null
    let finalReplyInput: GenerateReplyInput | null = null
    let retrievedQuery = ""
    const workspace = {
      ...dashboardConfig.workspaces[0],
      semanticSearchThreshold: 0.42,
    }
    const llmClient: LlmClient = {
      id: "rag-test-llm",
      label: "RAG Test LLM",
      isAvailable: async () => true,
      generateRetrievalQuery: async (input) => {
        retrievalQueryInput = input
        return {
          intent: "Explain market retention.",
          retrievalMode: "targeted_file",
          needsDocumentSearch: true,
          searchQuery: "market retention evidence",
          searchQueries: ["market retention evidence", "customer cohort retention"],
          targetDocumentNames: ["Market_Overview.pdf"],
          rationale: "The user is asking a follow-up about retention in the market overview.",
        }
      },
      generateReply: async (input) => {
        finalReplyInput = input
        return "RAG reply"
      },
    }

    const reply = await generateRagReply({
      workspace,
      tabLabel: "Product Analysis",
      prompt: "What does it say about retention?",
      messages: [
        {
          id: "previous-user",
          side: "left",
          text: "Focus on the market overview.",
        },
      ],
      llmClient,
      retrieveParentChunks: async (_workspaceId, query, options) => {
        retrievedQuery = query
        expect(options.additionalQueries).toEqual([
          "customer cohort retention",
          "What does it say about retention?",
        ])
        expect(options.minSimilarity).toBe(0.42)
        expect(options.parentLimit).toBe(10)
        expect(options.targetDocumentNames).toEqual(["Market_Overview.pdf"])

        return [
          {
            documentId: "doc-1",
            documentName: "Market_Overview.pdf",
            matchedChildChunkIds: ["child-1"],
            pageNumbers: [3],
            parentChunkId: "parent-1",
            score: 0.91,
            similarity: 0.86,
            text: "Retention improved with healthier customer cohorts.",
            excerpt: "Retention improved with healthier customer cohorts.",
          },
        ]
      },
    })

    expect(reply).toBe("RAG reply")
    expect(retrievalQueryInput?.prompt).toBe("What does it say about retention?")
    expect(retrievalQueryInput?.messages.at(-1)).toMatchObject({
      side: "left",
      text: "What does it say about retention?",
    })
    expect(retrievedQuery).toBe("market retention evidence")
    expect(finalReplyInput?.prompt).toBe("What does it say about retention?")
    expect(finalReplyInput?.messages.at(-1)).toMatchObject({
      side: "left",
      text: "What does it say about retention?",
    })
    expect(finalReplyInput?.retrievalIntent).toBe("Explain market retention.")
    expect(finalReplyInput?.retrievalMode).toBe("targeted_file")
    expect(finalReplyInput?.retrievalConfidence).toBe("high")
    expect(finalReplyInput?.retrievalQuery).toBe("market retention evidence")
    expect(finalReplyInput?.retrievalRationale).toBe("The user is asking a follow-up about retention in the market overview.")
    expect(finalReplyInput?.retrievedChunks?.[0]).toMatchObject({
      documentName: "Market_Overview.pdf",
      parentChunkId: "parent-1",
      text: "Retention improved with healthier customer cohorts.",
    })
  })

  it("opens workspace management and deletes all workspace files", async () => {
    renderApp()

    fireEvent.click(await screen.findByRole("button", { name: "Manage Workspace" }))

    expect(await screen.findByRole("dialog", { name: "Workspace management" })).toBeTruthy()
    expect(screen.getByText("Files in this workspace")).toBeTruthy()

    const managementFiles = screen.getByRole("list", {
      name: "Workspace management files",
    })
    const workspaceSummary = screen.getByLabelText("Workspace summary")

    expect(within(workspaceSummary).getByText("Files")).toBeTruthy()
    expect(within(workspaceSummary).getByText("Total size")).toBeTruthy()
    expect(within(workspaceSummary).getByText("Chunks")).toBeTruthy()
    expect(within(workspaceSummary).getByText("Pending")).toBeTruthy()

    expect(managementFiles).toHaveClass(
      "grid-cols-2",
      "sm:grid-cols-3",
      "lg:grid-cols-6",
      "max-h-[372px]",
      "overflow-y-auto"
    )
    expect(
      within(managementFiles).getByRole("button", {
        name: "Open details for Market_Overview.pdf",
      })
    ).toBeTruthy()

    fireEvent.change(screen.getByRole("searchbox", { name: "Search workspace files" }), {
      target: { value: "sales" },
    })

    expect(
      within(managementFiles).getByRole("button", {
        name: "Open details for Sales_Report.docx",
      })
    ).toBeTruthy()
    expect(
      within(managementFiles).queryByRole("button", {
        name: "Open details for Market_Overview.pdf",
      })
    ).toBeNull()

    fireEvent.change(screen.getByRole("searchbox", { name: "Search workspace files" }), {
      target: { value: "" },
    })
    fireEvent.change(screen.getByRole("combobox", { name: "Filter files by type" }), {
      target: { value: "pdf" },
    })

    expect(
      within(managementFiles).getByRole("button", {
        name: "Open details for Market_Overview.pdf",
      })
    ).toBeTruthy()
    expect(
      within(managementFiles).queryByRole("button", {
        name: "Open details for Sales_Report.docx",
      })
    ).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Delete all files" }))

    await waitFor(() => {
      expect(screen.queryByRole("list", { name: "Workspace management files" })).toBeNull()
    })

    expect(screen.getByText("No files in this workspace.")).toBeTruthy()
    expect(screen.getByText("Deleted all files from this workspace.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Open details for Market_Overview.pdf" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Close workspace management" }))

    expect(screen.queryByRole("dialog", { name: "Workspace management" })).toBeNull()
  })

  it("renders fixed file cards with ellipsis, tooltip details, and a scrollable list", async () => {
    renderApp()

    const filesList = await screen.findByRole("list", { name: "Workspace files" })
    const fileCard = await screen.findByRole("button", {
      name: "Open details for Market_Overview.pdf",
    })

    expect(filesList).toHaveClass("app-scrollbar", "max-h-[354px]", "overflow-y-auto")
    expect(fileCard).toHaveClass("h-28", "w-full")
    expect(fileCard.querySelector("div.truncate")).toBeTruthy()
    expect(fileCard).not.toHaveAttribute("title")

    fireEvent.mouseEnter(fileCard)

    expect(await screen.findByRole("tooltip")).toHaveClass("fixed", "z-[9999]")
    expect(screen.getByText("Name: Market_Overview.pdf")).toBeTruthy()
    expect(screen.getByText("Size: Size unavailable")).toBeTruthy()
    expect(screen.getByText("Status: Processed")).toBeTruthy()
    expect(screen.getByText("Chunks: Unavailable")).toBeTruthy()

    fireEvent.scroll(filesList)

    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("keeps only one file tooltip open at a time", async () => {
    renderApp()

    const firstFileCard = await screen.findByRole("button", {
      name: "Open details for Market_Overview.pdf",
    })
    const secondFileCard = await screen.findByRole("button", {
      name: "Open details for Sales_Report.docx",
    })

    fireEvent.mouseEnter(firstFileCard)

    expect(await screen.findByRole("tooltip")).toBeTruthy()
    expect(screen.getByText("Name: Market_Overview.pdf")).toBeTruthy()

    fireEvent.mouseEnter(secondFileCard)

    expect(screen.getAllByRole("tooltip")).toHaveLength(1)
    expect(screen.queryByText("Name: Market_Overview.pdf")).toBeNull()
    expect(screen.getByText("Name: Sales_Report.docx")).toBeTruthy()
  })

  it("uploads workspace files into IndexedDB", async () => {
    renderApp()

    const file = new File(["quarterly revenue"], "Quarterly_Report.pdf", {
      type: "application/pdf",
    })

    expect(
      screen.queryByRole("progressbar", {
        name: "Market Research file processing progress",
      })
    ).toBeNull()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: { files: [file] },
    })

    expect(await screen.findByText("Quarterly_Report.pdf")).toBeTruthy()
    expect(await screen.findByText("Uploaded Quarterly_Report.pdf to this workspace.")).toBeTruthy()
    expect(
      await screen.findByRole("button", {
        name: "Open details for Quarterly_Report.pdf",
      })
    ).not.toHaveAttribute("title")

    const storedDocuments = await getWorkspaceDocuments("market-research")
    const storedDocument = storedDocuments.find(
      (document) => document.name === "Quarterly_Report.pdf"
    )

    expect(storedDocument?.mimeType).toBe("application/pdf")
    expect(storedDocument?.content.byteLength).toBe(file.size)
    expect(storedDocument?.toBeProcessed).toBe(true)
    expect(storedDocument?.tone).toBe("gray")
    expect(storedDocument?.processingStatus).toBe("toBeProcessed")

    expect(
      await screen.findByRole("progressbar", {
        name: "Market Research file processing progress",
      })
    ).toHaveAttribute("aria-valuenow", "86")
  })

  it("shows gray pending progress when every workspace file needs processing", async () => {
    renderApp()

    fireEvent.click(await screen.findByRole("button", { name: "New Workspace" }))
    expect(await screen.findByText("This workspace is ready. Upload documents or ask a question to begin.")).toBeTruthy()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["pending"], "Pending_Report.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(
      await screen.findByRole("progressbar", {
        name: "Workspace 4 file processing progress",
      })
    ).toHaveAttribute("aria-valuenow", "0")
  })

  it("processes a pending workspace file with a worker", async () => {
    renderApp()

    const file = new File(["process me"], "Process_Me.pdf", {
      type: "application/pdf",
    })
    const worker = createControlledProcessingWorker()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: { files: [file] },
    })

    expect(await screen.findByText("Process_Me.pdf")).toBeTruthy()

    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => worker as unknown as Worker)
    ).toBe(true)

    await waitFor(() => {
      const document = useWorkspaceStore
        .getState()
        .workspaces[0]?.uploadedDocuments.find(
          (item) => item.name === "Process_Me.pdf"
        )

      expect(document?.processingStatus).toBe("processing")
    })

    const processingDocuments = await getWorkspaceDocuments("market-research")
    const processingDocument = processingDocuments.find(
      (document) => document.name === "Process_Me.pdf"
    )

    expect(processingDocument?.processingStatus).toBe("processing")
    expect(worker.messages).toHaveLength(1)
    expect(worker.messages[0]?.message).toMatchObject({
      workspaceId: "market-research",
      documentId: processingDocument?.id,
      fileName: "Process_Me.pdf",
      fileType: "pdf",
      mimeType: "application/pdf",
    })
    expect(worker.messages[0]?.transfer).toHaveLength(1)

    worker.onmessage?.({
      data: {
        type: FILE_PROCESSING_RESULT_MESSAGE,
        workspaceId: "market-research",
        documentId: processingDocument?.id,
        childChunkCount: 5,
        chunkCount: 7,
        pageCount: 2,
        parentChunkCount: 2,
        processingStatus: "processed",
      },
    } as MessageEvent)

    await waitFor(() => {
      const document = useWorkspaceStore
        .getState()
        .workspaces[0]?.uploadedDocuments.find(
          (item) => item.name === "Process_Me.pdf"
        )

      expect(document?.processingStatus).toBe("processed")
      expect(document?.toBeProcessed).toBe(false)
      expect(document?.tone).toBe("blue")
      expect(document?.chunkCount).toBe(7)
      expect(document?.parentChunkCount).toBe(2)
      expect(document?.childChunkCount).toBe(5)
      expect(document?.pageCount).toBe(2)
    })

    expect(useWorkspaceStore.getState().isProcessingDocument).toBe(false)

    const processedDocuments = await getWorkspaceDocuments("market-research")
    const processedDocument = processedDocuments.find(
      (document) => document.name === "Process_Me.pdf"
    )

    expect(processedDocument?.processingStatus).toBe("processed")
    expect(processedDocument?.tone).toBe("blue")
    expect(processedDocument?.chunkCount).toBe(7)
    expect(
      screen.queryByRole("progressbar", {
        name: "Market Research file processing progress",
      })
    ).toBeNull()
  })

  it("marks a file as error when worker processing fails", async () => {
    renderApp()

    const worker = createControlledProcessingWorker()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["retry"], "Retry_Me.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(await screen.findByText("Retry_Me.pdf")).toBeTruthy()
    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => worker as unknown as Worker)
    ).toBe(true)

    worker.onerror?.(new Event("error"))

    await waitFor(() => {
      const document = useWorkspaceStore
        .getState()
        .workspaces[0]?.uploadedDocuments.find(
          (item) => item.name === "Retry_Me.pdf"
        )

      expect(document?.processingStatus).toBe("error")
      expect(document?.toBeProcessed).toBe(false)
      expect(document?.tone).toBe("red")
    })

    expect(useWorkspaceStore.getState().isProcessingDocument).toBe(false)

    const storedDocuments = await getWorkspaceDocuments("market-research")
    const storedDocument = storedDocuments.find(
      (document) => document.name === "Retry_Me.pdf"
    )

    expect(storedDocument?.processingStatus).toBe("error")
    expect(storedDocument?.tone).toBe("red")
  })

  it("marks a file as error when the worker reports a failed result", async () => {
    renderApp()

    const worker = createControlledProcessingWorker()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["retry result"], "Retry_Result.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(await screen.findByText("Retry_Result.pdf")).toBeTruthy()
    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => worker as unknown as Worker)
    ).toBe(true)

    const processingDocuments = await getWorkspaceDocuments("market-research")
    const processingDocument = processingDocuments.find(
      (document) => document.name === "Retry_Result.pdf"
    )

    worker.onmessage?.({
      data: {
        type: FILE_PROCESSING_RESULT_MESSAGE,
        workspaceId: "market-research",
        documentId: processingDocument?.id,
        errorMessage: "Unsupported file contents",
        processingStatus: "error",
      },
    } as MessageEvent)

    await waitFor(() => {
      const document = useWorkspaceStore
        .getState()
        .workspaces[0]?.uploadedDocuments.find(
          (item) => item.name === "Retry_Result.pdf"
        )

      expect(document?.processingStatus).toBe("error")
      expect(document?.toBeProcessed).toBe(false)
      expect(document?.tone).toBe("red")
    })

    expect(useWorkspaceStore.getState().isProcessingDocument).toBe(false)

    const erroredFileCard = await screen.findByRole("button", {
      name: "Open details for Retry_Result.pdf",
    })

    fireEvent.mouseEnter(erroredFileCard)

    expect(await screen.findByText("Status: Error")).toBeTruthy()
  })

  it("ignores unrelated worker messages while a file remains processing", async () => {
    renderApp()

    const worker = createControlledProcessingWorker()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["ignore me"], "Ignore_Message.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(await screen.findByText("Ignore_Message.pdf")).toBeTruthy()
    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => worker as unknown as Worker)
    ).toBe(true)

    worker.onmessage?.({
      data: {
        source: "pdfjs-internal",
        status: "ready",
      },
    } as MessageEvent)

    await waitFor(() => {
      const document = useWorkspaceStore
        .getState()
        .workspaces[0]?.uploadedDocuments.find(
          (item) => item.name === "Ignore_Message.pdf"
        )

      expect(document?.processingStatus).toBe("processing")
      expect(document?.tone).toBe("gray")
    })

    expect(useWorkspaceStore.getState().isProcessingDocument).toBe(true)
  })

  it("rejects worker results from an unexpected workspace", async () => {
    renderApp()

    const worker = createControlledProcessingWorker()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["wrong workspace"], "Wrong_Workspace.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(await screen.findByText("Wrong_Workspace.pdf")).toBeTruthy()
    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => worker as unknown as Worker)
    ).toBe(true)

    const processingDocuments = await getWorkspaceDocuments("market-research")
    const processingDocument = processingDocuments.find(
      (document) => document.name === "Wrong_Workspace.pdf"
    )

    worker.onmessage?.({
      data: {
        type: FILE_PROCESSING_RESULT_MESSAGE,
        workspaceId: "legal-files",
        documentId: processingDocument?.id,
        processingStatus: "processed",
      },
    } as MessageEvent)

    await waitFor(() => {
      const document = useWorkspaceStore
        .getState()
        .workspaces[0]?.uploadedDocuments.find(
          (item) => item.name === "Wrong_Workspace.pdf"
        )

      expect(document?.processingStatus).toBe("error")
      expect(document?.tone).toBe("red")
    })
  })

  it("does not start another worker while a file is processing", async () => {
    renderApp()

    const worker = createControlledProcessingWorker()

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["first"], "First_Pending.pdf", {
            type: "application/pdf",
          }),
          new File(["second"], "Second_Pending.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(await screen.findByText("First_Pending.pdf")).toBeTruthy()
    expect(await screen.findByText("Second_Pending.pdf")).toBeTruthy()

    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => worker as unknown as Worker)
    ).toBe(true)
    expect(
      await useWorkspaceStore
        .getState()
        .processNextWorkspaceDocument(() => createControlledProcessingWorker() as unknown as Worker)
    ).toBe(false)

    const documents = useWorkspaceStore.getState().workspaces[0]?.uploadedDocuments ?? []

    expect(
      documents.filter((document) => document.processingStatus === "processing")
    ).toHaveLength(1)
    expect(
      documents.filter((document) => document.processingStatus === "toBeProcessed")
    ).toHaveLength(1)
  })

  it("selects a file processor from the document extension", async () => {
    expect(getFileProcessorKind({ fileName: "Report.PDF" })).toBe("pdf")
    expect(getFileProcessorKind({ fileName: "Contract.docx" })).toBe("word")
    expect(getFileProcessorKind({ fileName: "Metrics.xlsx" })).toBe("spreadsheet")
    expect(getFileProcessorKind({ fileName: "Slides.pptx" })).toBe("presentation")
    expect(getFileProcessorKind({ fileName: "Notes.md" })).toBe("text")
    expect(getFileProcessorKind({ fileName: "Archive.zip" })).toBe("generic")
    expect(
      getFileProcessorKind({
        fileName: "download",
        fileType: "application/pdf",
        mimeType: "application/pdf",
      })
    ).toBe("pdf")
  })

  it("runs the PDF pipeline with page-aware parent child chunks in IndexedDB", async () => {
    const content = new ArrayBuffer(8)
    let llmExtractionSectionCount = 0

    const result = await processPdfPipeline(
      {
        workspaceId: "market-research",
        documentId: "pdf-pipeline-test",
        fileName: "Pipeline.pdf",
        fileType: "pdf",
        mimeType: "application/pdf",
        content,
      },
      {
        extractGraphWithLlm: async (input) => {
          llmExtractionSectionCount = input.textSections.length

          return {
            entities: [
              { name: "Revenue Growth", type: "metric" },
              { name: "Retention Signals", type: "topic" },
            ],
            relations: [
              {
                confidence: 0.91,
                evidence: "Page one explains revenue growth and retention signals.",
                source: "Revenue Growth",
                target: "Retention Signals",
                type: "depends_on",
              },
            ],
          }
        },
        childChunkOverlap: 0,
        childChunkSize: 24,
        extractTextByPage: async () => [
          {
            pageNumber: 1,
            text: "Page one explains revenue growth and retention signals.",
          },
          {
            pageNumber: 2,
            text: "Page two covers churn risk and expansion opportunities.",
          },
        ],
        generateEmbeddings: async (texts) =>
          texts.map((_, index) => ({
            dimensions: 3,
            embedding: [index, index + 0.1, index + 0.2],
            model: "test-embedding-model",
          })),
        parentChunkOverlap: 0,
        parentChunkSize: 80,
      }
    )

    expect(result).toMatchObject({
      byteLength: 8,
      childChunkCount: 6,
      embeddingCount: 6,
      pageCount: 2,
      parentChunkCount: 2,
      processor: "pdf",
    })
    expect(llmExtractionSectionCount).toBe(2)

    const chunks = await getDocumentChunks("pdf-pipeline-test")
    const graphEdges = await getWorkspaceGraphEdges("market-research")

    expect(chunks).toHaveLength(8)
    expect(chunks[0]).toMatchObject({
      level: "parent",
      pageNumbers: [1],
      text: "Page one explains revenue growth and retention signals.",
    })
    expect(chunks[1]).toMatchObject({
      embedding: [0, 0.1, 0.2],
      embeddingDimensions: 3,
      embeddingModel: "test-embedding-model",
      level: "child",
      pageNumbers: [1],
      parentChunkId: "pdf-pipeline-test:parent:0",
    })
    expect(chunks.at(-1)).toMatchObject({
      embedding: [5, 5.1, 5.2],
      embeddingDimensions: 3,
      embeddingModel: "test-embedding-model",
      level: "child",
      pageNumbers: [2],
      parentChunkId: "pdf-pipeline-test:parent:1",
    })
    expect(graphEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confidence: 0.91,
          type: "depends_on",
        }),
      ])
    )
  })

  it("runs the text pipeline with chunks, embeddings, and graph artifacts", async () => {
    const content = new TextEncoder().encode(
      "Customer retention improved after onboarding changes. Revenue growth followed retention gains."
    ).buffer

    const result = await processTextPipeline(
      {
        workspaceId: "market-research",
        documentId: "text-pipeline-test",
        fileName: "Notes.txt",
        fileType: "txt",
        mimeType: "text/plain",
        content,
      },
      {
        childChunkOverlap: 0,
        childChunkSize: 40,
        generateEmbeddings: async (texts) =>
          texts.map((_, index) => ({
            dimensions: 2,
            embedding: [index + 1, index + 2],
            model: "test-embedding-model",
          })),
        parentChunkOverlap: 0,
        parentChunkSize: 100,
      }
    )

    expect(result.processor).toBe("text")
    expect(result.childChunkCount).toBeGreaterThan(0)

    const chunks = await getDocumentChunks("text-pipeline-test")
    const graphEntities = await getWorkspaceGraphEntities("market-research")

    expect(chunks.some((chunk) => chunk.level === "child" && chunk.embedding)).toBe(true)
    expect(graphEntities.length).toBeGreaterThan(0)
  })

  it("rolls back partial chunks when graph-stage processing fails", async () => {
    const content = new ArrayBuffer(8)
    let embeddingCallCount = 0

    await expect(
      processPdfPipeline(
        {
          workspaceId: "market-research",
          documentId: "rollback-pipeline-test",
          fileName: "Rollback.pdf",
          fileType: "pdf",
          mimeType: "application/pdf",
          content,
        },
        {
          childChunkOverlap: 0,
          childChunkSize: 40,
          extractTextByPage: async () => [
            {
              pageNumber: 1,
              text: "Customer retention and revenue growth appear together.",
            },
          ],
          generateEmbeddings: async (texts) => {
            embeddingCallCount += 1

            if (embeddingCallCount > 1) {
              throw new Error("Graph embedding failed")
            }

            return texts.map((_, index) => ({
              dimensions: 2,
              embedding: [index + 1, index + 2],
              model: "test-embedding-model",
            }))
          },
          parentChunkOverlap: 0,
          parentChunkSize: 100,
        }
      )
    ).rejects.toThrow("Graph embedding failed")

    expect(await getDocumentChunks("rollback-pipeline-test")).toHaveLength(0)
  })

  it("reports unsupported binary office files instead of marking them processed", async () => {
    await expect(
      processWorkspaceFile({
        workspaceId: "market-research",
        documentId: "unsupported-docx",
        fileName: "Unsupported.docx",
        fileType: "docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content: new ArrayBuffer(4),
      })
    ).rejects.toThrow("word processing is not implemented")
  })

  it("creates configurable parent child chunks without LangChain", () => {
    const chunks = createParentChildChunks(
      [
        {
          pageNumber: 3,
          text: "Alpha section. Beta section. Gamma section.",
        },
      ],
      {
        childChunkOverlap: 0,
        childChunkSize: 10,
        idPrefix: "custom-document",
        parentChunkOverlap: 0,
        parentChunkSize: 18,
        separators: [". ", " "],
      }
    )

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toMatchObject({
      id: "custom-document:parent:0",
      pageNumbers: [3],
      text: "Alpha section.",
    })
    expect(chunks[0]?.children[0]).toMatchObject({
      id: "custom-document:child:0:0",
      parentId: "custom-document:parent:0",
      pageNumbers: [3],
    })
    expect(chunks[1]).toMatchObject({
      id: "custom-document:parent:1",
      text: "Beta section.",
    })
  })

  it("honors paragraph separators and sanitizes chunking options", () => {
    const chunks = createParentChildChunks(
      [
        {
          pageNumber: 4,
          text: "First paragraph keeps its boundary.\n\nSecond paragraph follows.",
        },
      ],
      {
        childChunkOverlap: 999,
        childChunkSize: 12,
        idPrefix: "paragraph-document",
        parentChunkOverlap: -10,
        parentChunkSize: 40,
        separators: ["\n\n", " "],
      }
    )

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({
      pageNumbers: [4],
      text: "First paragraph keeps its boundary.",
    })
    expect(chunks[1]).toMatchObject({
      pageNumbers: [4],
      text: "Second paragraph follows.",
    })
    expect(chunks[0]?.children.length).toBeGreaterThan(1)
  })

  it("opens file details and deletes a workspace file", async () => {
    renderApp()

    const file = new File(["delete me"], "Delete_Me.pdf", {
      type: "application/pdf",
    })

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: { files: [file] },
    })

    await screen.findByText("Uploaded Delete_Me.pdf to this workspace.")

    const uploadedDocument = await waitFor(async () => {
      const uploadedDocuments = await getWorkspaceDocuments("market-research")
      const document = uploadedDocuments.find(
        (workspaceDocument) => workspaceDocument.name === "Delete_Me.pdf"
      )

      expect(document).toBeTruthy()
      return document
    })

    await replaceDocumentChunks(
      "market-research",
      uploadedDocument.id,
      [
        {
          id: "delete-me:parent:0",
          workspaceId: "market-research",
          documentId: uploadedDocument.id,
          chunkId: "delete-me:parent:0",
          level: "parent" as const,
          text: "Parent chunk 1 joins market retention and revenue context.",
          pageNumbers: [1, 2],
          order: 0,
          createdAt: Date.now(),
        },
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `delete-me:child:${index}`,
          workspaceId: "market-research",
          documentId: uploadedDocument.id,
          chunkId: `delete-me:child:${index}`,
          parentChunkId: "delete-me:parent:0",
          level: "child" as const,
          text: `Chunk ${index + 1} text about market retention and revenue.`,
          pageNumbers: [Math.floor(index / 4) + 1],
          embedding: [index, index + 0.25, index + 0.5, index + 0.75, index + 1],
          embeddingDimensions: 5,
          embeddingModel: "test-embedding-model",
          order: index + 1,
          createdAt: Date.now() + index + 1,
        })),
        {
          id: "delete-me:parent:1",
          workspaceId: "market-research",
          documentId: uploadedDocument.id,
          chunkId: "delete-me:parent:1",
          level: "parent" as const,
          text: "Parent chunk 2 joins expansion, churn, and planning context.",
          pageNumbers: [3],
          order: 7,
          createdAt: Date.now() + 7,
        },
        ...Array.from({ length: 6 }, (_, index) => {
          const childIndex = index + 6

          return {
            id: `delete-me:child:${childIndex}`,
            workspaceId: "market-research",
            documentId: uploadedDocument.id,
            chunkId: `delete-me:child:${childIndex}`,
            parentChunkId: "delete-me:parent:1",
            level: "child" as const,
            text: `Chunk ${childIndex + 1} text about market retention and revenue.`,
            pageNumbers: [3],
            embedding: [
              childIndex,
              childIndex + 0.25,
              childIndex + 0.5,
              childIndex + 0.75,
              childIndex + 1,
            ],
            embeddingDimensions: 5,
            embeddingModel: "test-embedding-model",
            order: childIndex + 2,
            createdAt: Date.now() + childIndex + 2,
          }
        }),
      ]
    )

    fireEvent.click(await screen.findByRole("button", { name: "Open details for Delete_Me.pdf" }))

    expect(await screen.findByRole("dialog", { name: "File details for Delete_Me.pdf" })).toBeTruthy()
    expect(screen.getByText("File details")).toBeTruthy()
    expect(screen.getAllByText("Delete_Me.pdf")).not.toHaveLength(0)
    expect(screen.getByText("9 B")).toBeTruthy()
    expect(screen.getByText("Chunks")).toBeTruthy()
    expect(screen.getAllByText("Unavailable")).not.toHaveLength(0)

    expect(await screen.findByRole("tab", { name: "Parent chunks (2)" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Chunks (12)" })).toBeTruthy()
    expect(await screen.findByRole("table", { name: "Parent chunks table" })).toBeTruthy()
    expect(screen.getByText("delete-me:parent:0")).toBeTruthy()
    expect(screen.getByText("delete-me:parent:1")).toBeTruthy()
    expect(screen.getAllByText("6")).not.toHaveLength(0)

    fireEvent.click(screen.getByRole("tab", { name: "Chunks (12)" }))

    expect(await screen.findByRole("table", { name: "Child chunks table" })).toBeTruthy()
    expect(await screen.findByText("Showing 1-10 of 12 chunks")).toBeTruthy()
    expect(screen.getByText("delete-me:child:0")).toBeTruthy()
    expect(screen.getByText("delete-me:child:9")).toBeTruthy()
    expect(screen.queryByText("delete-me:child:10")).toBeNull()
    expect(screen.getAllByText("test-embedding-model")).toHaveLength(10)
    expect(screen.getByText("[0.000, 0.250, 0.500, 0.750, …]")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Next chunks page" }))

    expect(await screen.findByText("Showing 11-12 of 12 chunks")).toBeTruthy()
    expect(screen.getByText("delete-me:child:10")).toBeTruthy()
    expect(screen.getByText("delete-me:child:11")).toBeTruthy()
    expect(screen.queryByText("delete-me:child:9")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Reprocess Delete_Me.pdf" }))

    await waitFor(async () => {
      expect(await getDocumentChunks(uploadedDocument.id)).toHaveLength(0)
    })

    await waitFor(async () => {
      const storedDocuments = await getWorkspaceDocuments("market-research")
      const storedDocument = storedDocuments.find(
        (workspaceDocument) => workspaceDocument.id === uploadedDocument.id
      )

      expect(storedDocument).toMatchObject({
        processingStatus: "toBeProcessed",
        toBeProcessed: true,
        tone: "gray",
      })
      expect(storedDocument?.chunkCount).toBeUndefined()
      expect(storedDocument?.childChunkCount).toBeUndefined()
      expect(storedDocument?.parentChunkCount).toBeUndefined()
      expect(storedDocument?.pageCount).toBeUndefined()
    })

    expect(await screen.findByText("The table will populate after file processing completes.")).toBeTruthy()
    expect(screen.getByText("Delete_Me.pdf is queued for reprocessing.")).toBeTruthy()
    expect(screen.queryByText("delete-me:child:10")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Close file details" }))

    expect(screen.queryByRole("dialog", { name: "File details for Delete_Me.pdf" })).toBeNull()

    fireEvent.click(await screen.findByRole("button", { name: "Open details for Delete_Me.pdf" }))

    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByRole("dialog", { name: "File details for Delete_Me.pdf" })).toBeNull()

    fireEvent.click(await screen.findByRole("button", { name: "Open details for Delete_Me.pdf" }))
    fireEvent.click(await screen.findByRole("button", { name: "Delete Delete_Me.pdf" }))

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Open details for Delete_Me.pdf" })).toBeNull()
    })

    const storedDocuments = await getWorkspaceDocuments("market-research")

    expect(
      storedDocuments.some((document) => document.name === "Delete_Me.pdf")
    ).toBe(false)
  })

  it("uses the configured LLM client for chat replies", async () => {
    renderApp()

    fireEvent.change(await screen.findByPlaceholderText("Ask something about your documents..."), {
      target: { value: "Summarize the market trends" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    expect(
      await screen.findByText("Test LLM reply for: Summarize the market trends")
    ).toBeTruthy()
    expect(lastGenerateReplyInput?.workspaceTitle).toBe("Market Research")
    expect(lastGenerateReplyInput?.documents[0]).toMatchObject({
      name: "Market_Overview.pdf",
      type: "pdf",
    })
  })

  it("renders LLM replies as markdown", async () => {
    renderApp()

    fireEvent.change(await screen.findByPlaceholderText("Ask something about your documents..."), {
      target: { value: "Return markdown" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    expect(await screen.findByText("Key point")).toBeTruthy()
    expect(await screen.findByText("First item")).toBeTruthy()
    expect(screen.getByText("Key point").tagName).toBe("STRONG")
    expect(screen.getByText("First item").closest("li")).toBeTruthy()
    expect(screen.getByText("Key point").closest(".app-scrollbar")).toHaveClass(
      "overflow-x-auto"
    )
  })

  it("adds workspace date and file context to the Chrome local LLM system prompt", async () => {
    let systemPrompt = ""
    let promptPayload = ""

    window.LanguageModel = {
      availability: async () => "available",
      create: async (options) => {
        systemPrompt = options?.systemPrompt ?? ""

        return {
          prompt: async (input) => {
            promptPayload = input
            return "Chrome local reply"
          },
        }
      },
    }

    const client = createChromeLocalLlmClient()
    const reply = await client.generateReply({
      workspaceTitle: "Research Hub",
      tabLabel: "Contracts",
      documents: [
        {
          name: "Agreement.pdf",
          type: "pdf",
          size: 2048,
          processingStatus: "processed",
        },
        {
          name: "Survey.csv",
          type: "csv",
          size: 512,
          processingStatus: "toBeProcessed",
        },
      ],
      prompt: "Summarize the files",
      messages: [],
    })

    expect(reply).toBe("Chrome local reply")
    expect(systemPrompt).toContain("Current date:")
    expect(systemPrompt).toContain("Workspace: Research Hub.")
    expect(systemPrompt).toContain("Active tab: Contracts.")
    expect(systemPrompt).toContain("Workspace files count: 2.")
    expect(systemPrompt).toContain("Workspace files (2):")
    expect(systemPrompt).toContain("1. Agreement.pdf (pdf, 2.0 KB, processed)")
    expect(systemPrompt).toContain("2. Survey.csv (csv, 512 B, to be processed)")
    expect(systemPrompt).toContain("For file inventory questions")
    expect(systemPrompt).toContain("Prefer processed files.")
    expect(systemPrompt).toContain("say what is missing instead of inventing details")
    expect(promptPayload).toContain("System context:")
    expect(promptPayload).toContain("Workspace: Research Hub.")
    expect(promptPayload).toContain("Workspace files count: 2.")
    expect(promptPayload).toContain("Workspace files (2):")
    expect(promptPayload).toContain("Current user request — answer this request now")
    expect(promptPayload).toContain("Conversation context for continuity and reference:")
    expect(promptPayload).toContain("Conversation so far: none")
    expect(promptPayload).toContain("Summarize the files")
  })

  it("prioritizes file inventory context for file count questions", async () => {
    let promptPayload = ""

    window.LanguageModel = {
      availability: async () => "available",
      create: async () => ({
        prompt: async (input) => {
          promptPayload = input
          return "Hai 2 file nel workspace corrente."
        },
      }),
    }

    const client = createChromeLocalLlmClient()
    const reply = await client.generateReply({
      workspaceTitle: "Vendor Notes",
      tabLabel: "General Chat",
      documents: [
        {
          name: "Vendor_Notes.pdf",
          type: "pdf",
          size: 1024,
          processingStatus: "processed",
        },
        {
          name: "Budget.xlsx",
          type: "xlsx",
          size: 4096,
          processingStatus: "processed",
        },
      ],
      prompt: "Quanti file ho?",
      messages: [
        {
          id: "previous-user",
          side: "left",
          text: "Summarize the vendor notes.",
        },
        {
          id: "previous-assistant",
          side: "right",
          text: "Please provide the vendor notes.",
        },
      ],
    })

    expect(reply).toBe("Hai 2 file nel workspace corrente.")
    expect(promptPayload).toContain("Workspace files count: 2.")
    expect(promptPayload).toContain("Current user request — answer this request now")
    expect(promptPayload.indexOf("Quanti file ho?")).toBeLessThan(
      promptPayload.indexOf("Conversation context for continuity and reference:")
    )
    expect(promptPayload).toContain("User: Summarize the vendor notes.")
    expect(promptPayload).toContain("Assistant: Please provide the vendor notes.")
    expect(promptPayload).toContain(
      "answer directly from the workspace files list without asking for document contents"
    )
  })

  it("ignores unsupported retrieval modes from Chrome local LLM planning", async () => {
    window.LanguageModel = {
      availability: async () => "available",
      create: async () => ({
        prompt: async () => JSON.stringify({
          intent: "Find retention evidence.",
          retrievalMode: "hybridgraphs",
          needsDocumentSearch: true,
          searchQuery: "retention evidence",
        }),
      }),
    }

    const client = createChromeLocalLlmClient()
    const result = await client.generateRetrievalQuery?.({
      workspaceTitle: "Research Hub",
      tabLabel: "General Chat",
      documents: [],
      prompt: "Find retention evidence",
      messages: [],
    })

    expect(result?.retrievalMode).toBeUndefined()
    expect(result?.searchQuery).toBe("retention evidence")
  })

  it("creates a new workspace", async () => {
    renderApp()

    fireEvent.click(await screen.findByRole("button", { name: "New Workspace" }))

    expect(await screen.findAllByText("Workspace 4")).not.toHaveLength(0)
    expect(await screen.findByText("This workspace is ready. Upload documents or ask a question to begin.")).toBeTruthy()
  })

  it("renames a workspace from the header on double click", async () => {
    renderApp()

    fireEvent.doubleClick(
      await screen.findByRole("button", { name: "Rename workspace Market Research" })
    )

    const input = await screen.findByRole("textbox", { name: "Workspace name" })
    fireEvent.change(input, { target: { value: "Research Hub" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(await screen.findAllByText("Research Hub")).not.toHaveLength(0)
  })

  it("renames a workspace from the sidebar on double click", async () => {
    renderApp()

    const sidebarWorkspace = (await screen.findAllByText("Market Research"))[0]
    fireEvent.doubleClick(sidebarWorkspace)

    const input = await screen.findByRole("textbox", {
      name: "Rename sidebar workspace Market Research",
    })
    fireEvent.change(input, { target: { value: "Market Lab" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(await screen.findAllByText("Market Lab")).not.toHaveLength(0)
  })

  it("changes a workspace icon from the header icon peaker", async () => {
    renderApp()

    fireEvent.click(
      await screen.findByRole("button", { name: "Change icon for Market Research" })
    )
    fireEvent.click(await screen.findByRole("button", { name: "Use Legal icon" }))

    expect(
      await screen.findByRole("button", { name: "Change icon for Market Research" })
    ).toHaveAttribute("aria-expanded", "false")

    await waitFor(() => {
      expect(useWorkspaceStore.getState().workspaces[0]?.navIcon).toBe("scale")
    })
  })

  it("changes a workspace icon from the sidebar icon", async () => {
    renderApp()

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Change sidebar icon for Market Research",
      })
    )
    fireEvent.click(await screen.findByRole("button", { name: "Use Business icon" }))

    await waitFor(() => {
      expect(useWorkspaceStore.getState().workspaces[0]?.navIcon).toBe("briefcase")
    })
  })

  it("keeps only one icon peaker open at a time", async () => {
    renderApp()

    fireEvent.click(
      await screen.findByRole("button", { name: "Change icon for Market Research" })
    )
    expect(screen.getAllByText("Workspace icon")).toHaveLength(1)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Change sidebar icon for Market Research",
      })
    )

    expect(screen.getAllByText("Workspace icon")).toHaveLength(1)
    expect(
      screen.getByRole("button", { name: "Change icon for Market Research" })
    ).toHaveAttribute("aria-expanded", "false")
  })

  it("closes the icon peaker on Escape", async () => {
    renderApp()

    fireEvent.click(
      await screen.findByRole("button", { name: "Change icon for Market Research" })
    )
    expect(screen.getByText("Workspace icon")).toBeTruthy()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByText("Workspace icon")).toBeNull()
  })

  it("closes the icon peaker on outside click", async () => {
    renderApp()

    fireEvent.click(
      await screen.findByRole("button", { name: "Change icon for Market Research" })
    )
    expect(screen.getByText("Workspace icon")).toBeTruthy()

    fireEvent.pointerDown(document.body)

    expect(screen.queryByText("Workspace icon")).toBeNull()
  })

  it("deletes an existing workspace", async () => {
    renderApp()

    expect(await screen.findAllByText("Market Research")).not.toHaveLength(0)

    fireEvent.change(await screen.findByLabelText("Upload files to workspace"), {
      target: {
        files: [
          new File(["cascade"], "Cascade_Delete.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    })

    expect(await screen.findByText("Cascade_Delete.pdf")).toBeTruthy()

    fireEvent.click(await screen.findByRole("button", { name: "Delete Workspace" }))

    expect(await screen.findByRole("alertdialog", { name: "Confirm workspace deletion" })).toBeTruthy()
    expect(screen.getByText("Delete this workspace?")).toBeTruthy()
    expect(screen.getAllByText("Market Research")).not.toHaveLength(0)

    fireEvent.click(screen.getByRole("button", { name: "Confirm delete workspace" }))

    expect(await screen.findAllByText("Legal Files")).not.toHaveLength(0)

    await waitFor(async () => {
      const storedDocuments = await getWorkspaceDocuments("market-research")

      expect(
        storedDocuments.some((document) => document.name === "Cascade_Delete.pdf")
      ).toBe(false)
    })
  })
})
