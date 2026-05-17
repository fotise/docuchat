import type { LlmGraphExtractionResult } from "./graph-extraction"

interface LanguageModelSession {
  prompt: (input: string, options?: { signal?: AbortSignal }) => Promise<string>
  destroy?: () => void
}

interface LanguageModelFactory {
  availability?: () => Promise<string>
  capabilities?: () => Promise<{ available?: string }>
  create: (options?: { signal?: AbortSignal; systemPrompt?: string }) => Promise<LanguageModelSession>
}

export interface ExtractGraphWithLlmInput {
  documentName: string
  signal?: AbortSignal
  textSections: Array<{
    id: string
    pageNumbers: number[]
    text: string
  }>
}

declare global {
  var LanguageModel: LanguageModelFactory | undefined
  var ai: { languageModel?: LanguageModelFactory } | undefined
}

const supportedAvailability = new Set([
  "available",
  "downloadable",
  "readily",
  "after-download",
])

function getLanguageModel() {
  return globalThis.LanguageModel ?? globalThis.ai?.languageModel
}

async function isLanguageModelAvailable(languageModel: LanguageModelFactory) {
  const availability = languageModel.availability
    ? await languageModel.availability()
    : (await languageModel.capabilities?.())?.available ?? "unavailable"

  return supportedAvailability.has(availability)
}

function buildGraphExtractionPrompt({ documentName, textSections }: ExtractGraphWithLlmInput) {
  const sections = textSections
    .slice(0, 8)
    .map((section, index) => [
      `Section ${index + 1}`,
      `Chunk: ${section.id}`,
      `Pages: ${section.pageNumbers.join(", ") || "unknown"}`,
      section.text.length > 1_600 ? `${section.text.slice(0, 1_600)}…` : section.text,
    ].join("\n"))
    .join("\n\n")

  return [
    "Extract a concise knowledge graph from this document content.",
    `Document: ${documentName}`,
    "Return strict JSON only with this shape:",
    `{"entities":[{"name":"Entity","type":"topic","aliases":["alias"],"confidence":0.8}],"relations":[{"source":"Entity A","target":"Entity B","type":"related_to","evidence":"short quote from the text","confidence":0.8}]}`,
    "Allowed entity types: person, organization, product, location, date, metric, topic, unknown.",
    "Allowed relation types: related_to, causes, depends_on, compares_to, contradicts, part_of, co_occurs_with, mentioned_in, unknown.",
    "Extract only relations supported by explicit text evidence. Prefer 5-15 important entities and 3-12 important relations.",
    sections,
  ].join("\n\n")
}

export function parseGraphExtractionResponse(response: string): LlmGraphExtractionResult | undefined {
  const jsonMatch = response.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    return undefined
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as LlmGraphExtractionResult
    const entities = Array.isArray(parsed.entities)
      ? parsed.entities.filter((entity) => typeof entity?.name === "string" && entity.name.trim())
      : []
    const relations = Array.isArray(parsed.relations)
      ? parsed.relations.filter((relation) =>
          typeof relation?.source === "string"
          && typeof relation?.target === "string"
          && relation.source.trim()
          && relation.target.trim()
        )
      : []

    return { entities, relations }
  } catch {
    return undefined
  }
}

export async function extractGraphWithLlm(
  input: ExtractGraphWithLlmInput
): Promise<LlmGraphExtractionResult | undefined> {
  const languageModel = getLanguageModel()

  if (!languageModel || !(await isLanguageModelAvailable(languageModel))) {
    return undefined
  }

  const session = await languageModel.create({
    signal: input.signal,
    systemPrompt: "You extract document knowledge graphs as strict JSON. Do not invent unsupported relations.",
  })

  try {
    const response = await session.prompt(buildGraphExtractionPrompt(input), {
      signal: input.signal,
    })

    return parseGraphExtractionResponse(response)
  } finally {
    session.destroy?.()
  }
}
