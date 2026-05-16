export const DEFAULT_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2"

export interface GeneratedEmbedding {
  dimensions: number
  embedding: number[]
  model: string
}

interface TensorLike {
  data: ArrayLike<number>
}

type FeatureExtractionPipeline = (
  text: string,
  options: { normalize: boolean; pooling: "mean" }
) => Promise<unknown>

interface TransformersModule {
  pipeline: (
    task: "feature-extraction",
    model: string
  ) => Promise<FeatureExtractionPipeline>
}

const extractorPromises = new Map<string, Promise<FeatureExtractionPipeline>>()

function isTensorLike(value: unknown): value is TensorLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    typeof (value as { data?: unknown }).data === "object" &&
    (value as { data?: unknown }).data !== null
  )
}

function collectNumbers(value: unknown): number[] {
  if (typeof value === "number") {
    return Number.isFinite(value) ? [value] : []
  }

  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      return []
    }

    return Array.from(value as unknown as ArrayLike<number>).filter(Number.isFinite)
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectNumbers)
  }

  if (isTensorLike(value)) {
    return Array.from(value.data).filter(Number.isFinite)
  }

  return []
}

async function getExtractor(model: string) {
  let extractorPromise = extractorPromises.get(model)

  if (!extractorPromise) {
    extractorPromise = import("@huggingface/transformers").then((module) =>
      (module as unknown as TransformersModule).pipeline("feature-extraction", model)
    )
    extractorPromises.set(model, extractorPromise)
  }

  return extractorPromise
}

export async function generateEmbeddings(
  texts: string[],
  model = DEFAULT_EMBEDDING_MODEL
): Promise<GeneratedEmbedding[]> {
  if (texts.length === 0) {
    return []
  }

  const extractor = await getExtractor(model)
  const embeddings: GeneratedEmbedding[] = []

  for (const text of texts) {
    const output = await extractor(text, {
      normalize: true,
      pooling: "mean",
    })
    const embedding = collectNumbers(output)

    embeddings.push({
      dimensions: embedding.length,
      embedding,
      model,
    })
  }

  return embeddings
}
