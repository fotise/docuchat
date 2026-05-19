import type {
  GraphEdgeType,
  GraphEntityType,
  StoredDocumentChunk,
  StoredGraphEdge,
  StoredGraphEntity,
} from "@/lib/chat-history/indexed-db"
import type { WorkspaceGraphExtractionTerms } from "@/types/dashboard"
import nlp from "compromise"
import type { GeneratedEmbedding } from "./embeddings"

interface DocumentGraph {
  edges: StoredGraphEdge[]
  entities: StoredGraphEntity[]
}

export interface LlmGraphEntity {
  aliases?: string[]
  confidence?: number
  name: string
  type?: GraphEntityType
}

export interface LlmGraphRelation {
  confidence?: number
  evidence?: string
  source: string
  target: string
  type?: GraphEdgeType
}

export interface LlmGraphExtractionResult {
  entities?: LlmGraphEntity[]
  relations?: LlmGraphRelation[]
}

interface BuildDocumentGraphOptions {
  graphExtractionTerms?: Partial<WorkspaceGraphExtractionTerms>
  llmExtraction?: LlmGraphExtractionResult
}

interface RuntimeGraphExtractionTerms {
  domainTopicPatterns: RegExp[]
  genericEntityTerms: Set<string>
  layoutEndTerms: Set<string>
  layoutStartTerms: Set<string>
  processStateTerms: Set<string>
  rasciActionTerms: Set<string>
  repeatedFooterPhrases: string[]
  toolEntityTerms: Set<string>
}

type EntityCandidateSource = "capitalized" | "date" | "llm" | "metric" | "nlp" | "noun_phrase" | "topic" | "typed_nlp"

interface EntityCandidate {
  firstSeen: number
  isGeneric: boolean
  isStrongSignal: boolean
  llmConfidence?: number
  llmConfirmed: boolean
  name: string
  normalizedName: string
  score: number
  sources: Set<EntityCandidateSource>
  tokenCount: number
  type?: GraphEntityType
}

interface LlmEntityConfirmation {
  confidence?: number
  name: string
  type?: GraphEntityType
}

const MAX_ENTITIES_PER_CHUNK = 8
const MAX_COOCCURRENCE_ENTITIES_PER_CHUNK = 5
const MAX_ENTITY_NAME_LENGTH = 64
const MIN_ENTITY_CANDIDATE_SCORE = 0.42
const MIN_COOCCURRENCE_ENTITY_SCORE = 0.58
const TOPIC_STOP_WORDS = new Set([
  "about",
  "analysis",
  "based",
  "between",
  "chapter",
  "context",
  "data",
  "document",
  "file",
  "from",
  "market",
  "overview",
  "page",
  "report",
  "section",
  "summary",
  "table",
  "that",
  "their",
  "there",
  "these",
  "this",
  "with",
])
const GENERIC_ENTITY_TERMS = new Set([
  "acronym",
  "acronyms",
  "activity",
  "activities",
  "active",
  "alt",
  "alternate",
  "applicability",
  "appendix",
  "category",
  "chapter",
  "context",
  "data",
  "date",
  "definition",
  "definitions",
  "description",
  "document",
  "documents",
  "domain",
  "file",
  "function",
  "functions",
  "general",
  "glossary",
  "hierarchy",
  "identifier",
  "input",
  "inputs",
  "item",
  "items",
  "level",
  "list",
  "name",
  "output",
  "outputs",
  "page",
  "performance",
  "process",
  "processes",
  "properties",
  "purpose",
  "record",
  "records",
  "report",
  "requirement",
  "requirements",
  "resource",
  "resources",
  "responsible",
  "role",
  "roles",
  "scope",
  "section",
  "step",
  "steps",
  "status",
  "summary",
  "table",
  "task",
  "tasks",
  "title",
  "type",
  "unit",
  "upstream",
])
const LAYOUT_START_TERMS = new Set([
  "activity",
  "appendix",
  "description",
  "entity",
  "function",
  "functions",
  "gates",
  "hierarchy",
  "indicators",
  "inputs",
  "key",
  "name",
  "outputs",
  "process",
  "purpose",
  "reference",
  "referenced",
  "scope",
  "status",
  "sub",
  "topics",
])
const LAYOUT_END_TERMS = new Set([
  "active",
  "approver",
  "date",
  "description",
  "editor",
  "each",
  "endorser",
  "general",
  "identifier",
  "list",
  "name",
  "once",
  "page",
  "properties",
  "purpose",
  "required",
  "responsible",
  "scope",
  "status",
  "table",
  "the",
  "title",
  "to",
  "type",
  "upon",
])
const RASCI_ACTION_TERMS = new Set([
  "add",
  "align",
  "analyze",
  "approve",
  "check",
  "close",
  "coordinate",
  "define",
  "evaluate",
  "identify",
  "initiate",
  "manage",
  "perform",
  "provide",
  "release",
  "review",
  "run",
  "share",
  "update",
  "validate",
])
const PROCESS_STATE_TERMS = new Set([
  ...RASCI_ACTION_TERMS,
  "approved",
  "configured",
  "deployed",
  "escalated",
  "fulfilled",
  "identified",
  "known",
  "normal",
  "prioritized",
  "recorded",
  "requested",
  "resolved",
  "unknown",
  "updated",
  "validated",
])
const TOOL_ENTITY_TERMS = new Set([
  "alfabet",
  "alphabet",
  "epm",
  "helix",
  "tls",
])
const DOMAIN_TOPIC_PATTERNS = [
  /\bmanage it (?:architecture|service|events?|incidents?|initiatives?|problems?|service requests?)\b/gi,
  /\bset[- ]up and maintain it service\b/gi,
  /\bservice management process\b/gi,
  /\b(?:event|incident|problem|project|business continuity) management\b/gi,
  /\bdocument management system\b/gi,
  /\bservice bulletin\b/gi,
  /\bservice catalogue modification request\b/gi,
  /\bproject to service transition checklist\b/gi,
  /\barchitecture (?:board|patterns|principles|quality efficiency)\b/gi,
  /\btechnology portfolio\b/gi,
  /\bsoftware platforms?\b/gi,
  /\b(?:alfabet|aris) reference\b/gi,
  /\bit solution rating tool\b/gi,
  /\binformation security management\b/gi,
  /\bsecurity (?:applicability|drivers|patterns)\b/gi,
  /\bapplicability result\b/gi,
]
const REPEATED_FOOTER_PHRASES = [
  "all rights reserved",
  "consult the document management system",
  "refer to last page",
  "st restricted",
  "restricted controlled document",
  "st restricted controlled",
  "table of contents",
]

export const DEFAULT_GRAPH_EXTRACTION_TERMS: WorkspaceGraphExtractionTerms = {
  domainTopicPatterns: DOMAIN_TOPIC_PATTERNS.map((pattern) => pattern.source),
  genericEntityTerms: [...GENERIC_ENTITY_TERMS],
  layoutEndTerms: [...LAYOUT_END_TERMS],
  layoutStartTerms: [...LAYOUT_START_TERMS],
  processStateTerms: [...PROCESS_STATE_TERMS],
  rasciActionTerms: [...RASCI_ACTION_TERMS],
  repeatedFooterPhrases: [...REPEATED_FOOTER_PHRASES],
  toolEntityTerms: [...TOOL_ENTITY_TERMS],
}

function normalizeTermList(values: string[] | undefined, fallback: string[]) {
  return Array.from(new Set((values ?? fallback).map((value) => value.trim().toLowerCase()).filter(Boolean)))
}

function createDomainTopicPattern(source: string) {
  try {
    return new RegExp(source, "gi")
  } catch {
    return undefined
  }
}

function createGraphExtractionTerms(overrides: Partial<WorkspaceGraphExtractionTerms> = {}): RuntimeGraphExtractionTerms {
  const domainTopicPatternSources = Array.from(new Set((overrides.domainTopicPatterns ?? DEFAULT_GRAPH_EXTRACTION_TERMS.domainTopicPatterns).map((source) => source.trim()).filter(Boolean)))

  return {
    domainTopicPatterns: domainTopicPatternSources.map(createDomainTopicPattern).filter((pattern): pattern is RegExp => Boolean(pattern)),
    genericEntityTerms: new Set(normalizeTermList(overrides.genericEntityTerms, DEFAULT_GRAPH_EXTRACTION_TERMS.genericEntityTerms)),
    layoutEndTerms: new Set(normalizeTermList(overrides.layoutEndTerms, DEFAULT_GRAPH_EXTRACTION_TERMS.layoutEndTerms)),
    layoutStartTerms: new Set(normalizeTermList(overrides.layoutStartTerms, DEFAULT_GRAPH_EXTRACTION_TERMS.layoutStartTerms)),
    processStateTerms: new Set(normalizeTermList(overrides.processStateTerms, DEFAULT_GRAPH_EXTRACTION_TERMS.processStateTerms)),
    rasciActionTerms: new Set(normalizeTermList(overrides.rasciActionTerms, DEFAULT_GRAPH_EXTRACTION_TERMS.rasciActionTerms)),
    repeatedFooterPhrases: normalizeTermList(overrides.repeatedFooterPhrases, DEFAULT_GRAPH_EXTRACTION_TERMS.repeatedFooterPhrases),
    toolEntityTerms: new Set(normalizeTermList(overrides.toolEntityTerms, DEFAULT_GRAPH_EXTRACTION_TERMS.toolEntityTerms)),
  }
}

const DEFAULT_RUNTIME_GRAPH_EXTRACTION_TERMS = createGraphExtractionTerms()

function normalizeEntityName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function createSafeId(value: string) {
  return normalizeEntityName(value).replace(/\s+/g, "-") || "entity"
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getEntityTokens(value: string) {
  return normalizeEntityName(value).split(/\s+/).filter(Boolean)
}

function isGenericEntityPhrase(value: string, terms = DEFAULT_RUNTIME_GRAPH_EXTRACTION_TERMS) {
  const tokens = getEntityTokens(value)

  if (tokens.length === 0) {
    return true
  }

  if (tokens.length === 1) {
    return terms.genericEntityTerms.has(tokens[0]) || TOPIC_STOP_WORDS.has(tokens[0])
  }

  return tokens.every((token) => terms.genericEntityTerms.has(token) || TOPIC_STOP_WORDS.has(token))
}

function isStandaloneDateArtifact(tokens: string[]) {
  return tokens.length === 1 && /^(?:19|20)\d{2}$/.test(tokens[0])
}

function hasBrokenPdfFragment(value: string, tokens: string[]) {
  return value.includes("...")
    || /^\p{L}\s*&/u.test(value.trim())
    || (tokens.length >= 2 && tokens[0].length === 1)
    || tokens.some((token) => /^(?:c|e|h|o|r|s|t)?(?:cess|ements|ethods|hods|lements|ments|nts|rocess|thods|tit|ts|ut)\b/.test(token))
}

function isRasciOrProcessFragment(tokens: string[], terms = DEFAULT_RUNTIME_GRAPH_EXTRACTION_TERMS) {
  if (tokens.length === 3 && tokens[0] === "a" && tokens[1] === "r" && terms.rasciActionTerms.has(tokens[2])) {
    return true
  }

  if (tokens.length <= 3 && /^l[3-6]$/.test(tokens[0]) && terms.rasciActionTerms.has(tokens[1])) {
    return true
  }

  if (tokens.length >= 3 && tokens.some((token, index) => /^l[3-6]$/.test(token) && terms.rasciActionTerms.has(tokens[index + 1] ?? ""))) {
    return true
  }

  if (tokens.length >= 2 && (tokens[0] === "and" || tokens[0] === "or") && tokens.some((token) => /^l[3-6]$/.test(token) || terms.rasciActionTerms.has(token))) {
    return true
  }

  if (tokens.length <= 3 && (tokens[0] === "and" || tokens[0] === "or" || tokens[0] === "na") && (terms.processStateTerms.has(tokens[1] ?? "") || tokens[1] === "it")) {
    return true
  }

  if (tokens.length <= 3 && terms.processStateTerms.has(tokens[0]) && tokens[tokens.length - 1] === "it") {
    return true
  }

  if (tokens.length <= 4 && tokens[0] === "template" && tokens[1] === "na" && terms.processStateTerms.has(tokens[2] ?? "")) {
    return true
  }

  if (tokens.length <= 4 && terms.toolEntityTerms.has(tokens[0]) && (terms.processStateTerms.has(tokens[1] ?? "") || tokens[1] === "l5" || tokens[1] === "l4")) {
    return true
  }

  if (tokens.length <= 4 && (tokens[0] === "supports" || tokens[0] === "carries") && tokens.some((token) => /^l[3-6]$/.test(token) || terms.processStateTerms.has(token))) {
    return true
  }

  if (tokens.length === 2 && tokens[0] === "supports" && tokens[1] === "carries") {
    return true
  }

  if (tokens.length >= 2 && tokens[0] === "supports" && tokens[1] === "carries") {
    return true
  }

  return false
}

function isLayoutArtifact(value: string, tokens: string[], terms = DEFAULT_RUNTIME_GRAPH_EXTRACTION_TERMS) {
  const normalized = tokens.join(" ")

  if (terms.repeatedFooterPhrases.some((phrase) => normalized.includes(phrase))) {
    return true
  }

  if (/\bpage\b/.test(normalized) && /\b(?:19|20)\d{2}\b/.test(normalized)) {
    return true
  }

  if (/\b(?:active|revision|rev)\b/.test(normalized) && /\b(?:19|20)\d{2}\b/.test(normalized)) {
    return true
  }

  if (/\bstatus\b.*\bstatus\b/.test(normalized)) {
    return true
  }

  if (/\bservice bulletin\b.*\bservice bulletin\b/.test(normalized)) {
    return true
  }

  if (/[-–—]\s*$/.test(value.trim())) {
    return true
  }

  if (tokens.length <= 2 && (tokens[0] === "for" || tokens[0] === "in" || tokens[0] === "the")) {
    return true
  }

  if (tokens.length <= 2 && normalized === "set up") {
    return true
  }

  if (tokens.length <= 3 && (terms.layoutStartTerms.has(tokens[0]) || terms.layoutEndTerms.has(tokens[tokens.length - 1]))) {
    return true
  }

  if (/\b(\w+)\s+\1\b/.test(normalized)) {
    return true
  }

  return /^document properties|^revision history|^process execution|^executive summary|^referenced documents|^process characteristics/.test(normalized)
}

function isLikelyPdfOrTableArtifact(value: string, terms = DEFAULT_RUNTIME_GRAPH_EXTRACTION_TERMS) {
  const tokens = getEntityTokens(value)

  if (tokens.length === 0) {
    return true
  }

  return isStandaloneDateArtifact(tokens)
    || hasBrokenPdfFragment(value, tokens)
    || isRasciOrProcessFragment(tokens, terms)
    || isLayoutArtifact(value, tokens, terms)
}

function isValidEntityName(value: string, terms = DEFAULT_RUNTIME_GRAPH_EXTRACTION_TERMS) {
  const normalized = normalizeEntityName(value)

  return normalized.length > 2
    && normalized.length <= MAX_ENTITY_NAME_LENGTH
    && !TOPIC_STOP_WORDS.has(normalized)
    && !isGenericEntityPhrase(value, terms)
    && !isLikelyPdfOrTableArtifact(value, terms)
}

function inferEntityType(name: string): GraphEntityType {
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\d{4}$|\b(q[1-4]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(name)) {
    return "date"
  }

  if (/%|\b(kpi|revenue|growth|score|rate|margin|retention|churn|sales)\b/i.test(name)) {
    return "metric"
  }

  if (/\b(inc|llc|ltd|corp|company|group|partners|bank|university)\b/i.test(name)) {
    return "organization"
  }

  if (/\b(risk|clause|contract|liability|termination|indemnification)\b/i.test(name)) {
    return "topic"
  }

  return "topic"
}

function extractCapitalizedEntities(text: string, terms: RuntimeGraphExtractionTerms) {
  const matches = text.match(/\b[A-Z][A-Za-z0-9&'’-]*(?:\s+[A-Z][A-Za-z0-9&'’-]*){0,4}\b/g) ?? []

  return matches.filter((entity) => isValidEntityName(entity, terms))
}

function extractMetricEntities(text: string) {
  const matches = text.match(/\b\d+(?:[.,]\d+)?\s?(?:%|k|m|b|x|usd|eur|gbp|days|months|years)\b/gi) ?? []

  return matches.map((match) => match.trim())
}

function extractDateEntities(text: string) {
  const matches = text.match(/\b(?:20\d{2}|19\d{2}|Q[1-4]\s+20\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2})\b/gi) ?? []

  return matches.map((match) => match.trim())
}

function extractTopicEntities(text: string, terms: RuntimeGraphExtractionTerms) {
  const matches = [
    ...(text.match(/\b(?:customer health|customer retention|retention|churn|market trend|competitor|contract risk|liability|termination|indemnification|growth|revenue|survey|vendor|budget)\b/gi) ?? []),
    ...terms.domainTopicPatterns.flatMap((pattern) => text.match(pattern) ?? []),
  ]

  return matches.map((match) => match.trim())
}

function toStringArray(value: string[] | string) {
  return Array.isArray(value) ? value : value ? [value] : []
}

function extractCompromiseMatches(
  document: ReturnType<typeof nlp>,
  method: "dates" | "money" | "organizations" | "people" | "places" | "percentages" | "topics"
) {
  return toStringArray(document[method]?.().out("array") ?? [])
}

function extractNlpEntities(text: string, terms: RuntimeGraphExtractionTerms) {
  const document = nlp(text)

  return uniqueValues([
    ...extractCompromiseMatches(document, "people"),
    ...extractCompromiseMatches(document, "organizations"),
    ...extractCompromiseMatches(document, "places"),
    ...extractCompromiseMatches(document, "dates"),
    ...extractCompromiseMatches(document, "money"),
    ...extractCompromiseMatches(document, "percentages"),
    ...extractCompromiseMatches(document, "topics"),
  ]).filter((entity) => isValidEntityName(entity, terms))
}

function extractNounPhraseEntities(text: string, terms: RuntimeGraphExtractionTerms) {
  const document = nlp(text)

  return uniqueValues(toStringArray(document.match("#Adjective? #Noun+").out("array")))
    .filter((entity) => {
      const tokens = getEntityTokens(entity)

      return tokens.length >= 2
        && tokens.length <= 4
        && isValidEntityName(entity, terms)
    })
}

function buildLlmConfirmationIndex(extraction: LlmGraphExtractionResult | undefined) {
  const confirmations = new Map<string, LlmEntityConfirmation>()

  for (const entity of extraction?.entities ?? []) {
    for (const name of [entity.name, ...(entity.aliases ?? [])]) {
      const normalizedName = normalizeEntityName(name)

      if (normalizedName) {
        confirmations.set(normalizedName, {
          confidence: entity.confidence,
          name: entity.name,
          type: entity.type,
        })
      }
    }
  }

  for (const relation of extraction?.relations ?? []) {
    for (const name of [relation.source, relation.target]) {
      const normalizedName = normalizeEntityName(name)

      if (normalizedName && !confirmations.has(normalizedName)) {
        confirmations.set(normalizedName, { name })
      }
    }
  }

  return confirmations
}

function addEntityCandidate(
  candidates: Map<string, EntityCandidate>,
  name: string,
  source: EntityCandidateSource,
  firstSeen: number,
  llmConfirmations: Map<string, LlmEntityConfirmation>,
  terms: RuntimeGraphExtractionTerms,
  type?: GraphEntityType
) {
  const normalizedName = normalizeEntityName(name)

  if (!normalizedName || !isValidEntityName(name, terms)) {
    return
  }

  const llmConfirmation = llmConfirmations.get(normalizedName)
  const existingCandidate = candidates.get(normalizedName)

  if (existingCandidate) {
    existingCandidate.sources.add(source)
    existingCandidate.isStrongSignal = existingCandidate.isStrongSignal || source !== "noun_phrase"
    existingCandidate.llmConfirmed = existingCandidate.llmConfirmed || Boolean(llmConfirmation) || source === "llm"
    existingCandidate.llmConfidence = Math.max(existingCandidate.llmConfidence ?? 0, llmConfirmation?.confidence ?? 0)
    existingCandidate.type = type ?? llmConfirmation?.type ?? existingCandidate.type
    return
  }

  candidates.set(normalizedName, {
    firstSeen,
    isGeneric: isGenericEntityPhrase(name, terms),
    isStrongSignal: source !== "noun_phrase",
    llmConfidence: llmConfirmation?.confidence,
    llmConfirmed: Boolean(llmConfirmation) || source === "llm",
    name: llmConfirmation?.name ?? name,
    normalizedName,
    score: 0,
    sources: new Set([source]),
    tokenCount: getEntityTokens(name).length,
    type: type ?? llmConfirmation?.type,
  })
}

function scoreEntityCandidate(candidate: EntityCandidate) {
  let score = 0.2

  if (candidate.sources.has("typed_nlp")) score += 0.26
  if (candidate.sources.has("metric") || candidate.sources.has("date")) score += 0.28
  if (candidate.sources.has("capitalized")) score += 0.18
  if (candidate.sources.has("topic")) score += 0.16
  if (candidate.sources.has("nlp")) score += 0.1
  if (candidate.sources.has("noun_phrase")) score += 0.04
  if (candidate.sources.size > 1) score += 0.12
  if (candidate.llmConfirmed) score += 0.34 + ((candidate.llmConfidence ?? 0.7) * 0.12)
  if (candidate.tokenCount >= 2) score += 0.08
  if (candidate.tokenCount > 4) score -= 0.16
  if (candidate.isGeneric) score -= 0.28
  if (candidate.sources.size === 1 && candidate.sources.has("noun_phrase")) score -= 0.14

  candidate.score = clamp(score, 0, 1)
  return candidate.score
}

function collectEntityCandidates(text: string, llmConfirmations: Map<string, LlmEntityConfirmation>, terms: RuntimeGraphExtractionTerms) {
  const candidates = new Map<string, EntityCandidate>()
  let firstSeen = 0

  for (const entity of extractNlpEntities(text, terms)) {
    const inferredType = inferEntityType(entity)
    const source: EntityCandidateSource = inferredType === "date" || inferredType === "metric" || inferredType === "organization"
      ? "typed_nlp"
      : "nlp"

    addEntityCandidate(candidates, entity, source, firstSeen, llmConfirmations, terms, inferredType)
    firstSeen += 1
  }

  for (const entity of extractCapitalizedEntities(text, terms)) {
    addEntityCandidate(candidates, entity, "capitalized", firstSeen, llmConfirmations, terms)
    firstSeen += 1
  }

  for (const entity of extractMetricEntities(text)) {
    addEntityCandidate(candidates, entity, "metric", firstSeen, llmConfirmations, terms, "metric")
    firstSeen += 1
  }

  for (const entity of extractDateEntities(text)) {
    addEntityCandidate(candidates, entity, "date", firstSeen, llmConfirmations, terms, "date")
    firstSeen += 1
  }

  for (const entity of extractTopicEntities(text, terms)) {
    addEntityCandidate(candidates, entity, "topic", firstSeen, llmConfirmations, terms, "topic")
    firstSeen += 1
  }

  for (const entity of extractNounPhraseEntities(text, terms)) {
    addEntityCandidate(candidates, entity, "noun_phrase", firstSeen, llmConfirmations, terms)
    firstSeen += 1
  }

  for (const [normalizedName, confirmation] of llmConfirmations) {
    if (normalizeEntityName(text).includes(normalizedName)) {
      addEntityCandidate(candidates, confirmation.name, "llm", firstSeen, llmConfirmations, terms, confirmation.type)
      firstSeen += 1
    }
  }

  return Array.from(candidates.values())
}

function rankEntityCandidates(candidates: EntityCandidate[]) {
  return candidates
    .map((candidate) => {
      scoreEntityCandidate(candidate)
      return candidate
    })
    .filter((candidate) => candidate.score >= MIN_ENTITY_CANDIDATE_SCORE || candidate.llmConfirmed)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.firstSeen - right.firstSeen
    })
    .slice(0, MAX_ENTITIES_PER_CHUNK)
}

function createEvidenceText(text: string) {
  return text.length > 220 ? `${text.slice(0, 220)}…` : text
}

function createEdgeId(workspaceId: string, documentId: string, leftId: string, rightId: string, type: GraphEdgeType) {
  return `${workspaceId}:${documentId}:edge:${type}:${leftId}:${rightId}`
}

function findExistingCoOccurrenceEdge(
  workspaceId: string,
  documentId: string,
  edgeByPair: Map<string, StoredGraphEdge>,
  sourceEntityId: string,
  targetEntityId: string
) {
  const forwardId = createEdgeId(workspaceId, documentId, sourceEntityId, targetEntityId, "co_occurs_with")
  const reverseId = createEdgeId(workspaceId, documentId, targetEntityId, sourceEntityId, "co_occurs_with")

  return edgeByPair.get(forwardId) ?? edgeByPair.get(reverseId)
}

function findFirstChildMention(chunks: StoredDocumentChunk[], names: string[]) {
  const normalizedNames = names.map(normalizeEntityName).filter(Boolean)

  return chunks.find((chunk) => {
    if (chunk.level !== "child") {
      return false
    }

    const normalizedText = normalizeEntityName(chunk.text)

    return normalizedNames.some((name) => normalizedText.includes(name))
  })
}

function ensureLlmEntity(
  workspaceId: string,
  documentId: string,
  chunks: StoredDocumentChunk[],
  entityByName: Map<string, StoredGraphEntity>,
  entity: LlmGraphEntity,
  terms: RuntimeGraphExtractionTerms,
  now: number
) {
  const normalizedName = normalizeEntityName(entity.name)

  if (!normalizedName || !isValidEntityName(entity.name, terms)) {
    return undefined
  }

  const aliases = uniqueValues([entity.name, ...(entity.aliases ?? [])])
  const existingEntity = entityByName.get(normalizedName)
  const mentionChunk = findFirstChildMention(chunks, aliases)
  const mention = mentionChunk
    ? {
        documentId,
        chunkId: mentionChunk.chunkId,
        parentChunkId: mentionChunk.parentChunkId,
        pageNumbers: mentionChunk.pageNumbers,
        text: createEvidenceText(mentionChunk.text),
      }
    : undefined

  if (existingEntity) {
    existingEntity.aliases = uniqueValues([...existingEntity.aliases, ...aliases])
    existingEntity.confidence = Math.min(1, Math.max(existingEntity.confidence, entity.confidence ?? 0.78) + 0.08)
    existingEntity.type = entity.type ?? existingEntity.type
    existingEntity.updatedAt = now

    if (mention) {
      existingEntity.mentions.push(mention)
    }

    return existingEntity
  }

  const createdEntity: StoredGraphEntity = {
    id: `${workspaceId}:${documentId}:entity:${createSafeId(normalizedName)}`,
    workspaceId,
    documentId,
    name: entity.name,
    normalizedName,
    type: entity.type ?? inferEntityType(entity.name),
    aliases,
    mentions: mention ? [mention] : [],
    confidence: entity.confidence ?? 0.7,
    createdAt: now,
    updatedAt: now,
  }

  entityByName.set(normalizedName, createdEntity)
  return createdEntity
}

function mergeLlmExtraction(
  workspaceId: string,
  documentId: string,
  chunks: StoredDocumentChunk[],
  entityByName: Map<string, StoredGraphEntity>,
  edgeByPair: Map<string, StoredGraphEdge>,
  extraction: LlmGraphExtractionResult | undefined,
  terms: RuntimeGraphExtractionTerms,
  now: number
) {
  if (!extraction) {
    return
  }

  for (const entity of extraction.entities ?? []) {
    ensureLlmEntity(workspaceId, documentId, chunks, entityByName, entity, terms, now)
  }

  for (const relation of extraction.relations ?? []) {
    const sourceEntity = ensureLlmEntity(
      workspaceId,
      documentId,
      chunks,
      entityByName,
      { name: relation.source },
      terms,
      now
    )
    const targetEntity = ensureLlmEntity(
      workspaceId,
      documentId,
      chunks,
      entityByName,
      { name: relation.target },
      terms,
      now
    )

    if (!sourceEntity || !targetEntity) {
      continue
    }

    const edgeType = relation.type ?? "related_to"
    const existingCoOccurrenceEdge = findExistingCoOccurrenceEdge(
      workspaceId,
      documentId,
      edgeByPair,
      sourceEntity.id,
      targetEntity.id
    )
    const edgeId = createEdgeId(
      workspaceId,
      documentId,
      sourceEntity.id,
      targetEntity.id,
      edgeType
    )
    const evidenceText = relation.evidence
      ? createEvidenceText(relation.evidence)
      : sourceEntity.mentions[0]?.text ?? targetEntity.mentions[0]?.text ?? "LLM extracted relation"
    const chunkIds = uniqueValues([
      sourceEntity.mentions[0]?.chunkId,
      targetEntity.mentions[0]?.chunkId,
    ].filter((value): value is string => Boolean(value)))

    if (existingCoOccurrenceEdge && edgeType !== "co_occurs_with") {
      edgeByPair.delete(existingCoOccurrenceEdge.id)
    }

    edgeByPair.set(edgeId, {
      id: edgeId,
      workspaceId,
      sourceEntityId: sourceEntity.id,
      targetEntityId: targetEntity.id,
      type: edgeType,
      documentIds: [documentId],
      chunkIds: uniqueValues([...(existingCoOccurrenceEdge?.chunkIds ?? []), ...chunkIds]),
      weight: Math.max(2, (existingCoOccurrenceEdge?.weight ?? 0) + 1),
      evidenceText: uniqueValues([evidenceText, ...(existingCoOccurrenceEdge?.evidenceText ?? [])]).slice(0, 5),
      confidence: Math.max(existingCoOccurrenceEdge?.confidence ?? 0, relation.confidence ?? 0.78),
      createdAt: now,
      updatedAt: now,
    })
  }
}

export function buildDocumentGraph(
  workspaceId: string,
  documentId: string,
  chunks: StoredDocumentChunk[],
  options: BuildDocumentGraphOptions = {}
): DocumentGraph {
  const now = Date.now()
  const graphExtractionTerms = createGraphExtractionTerms(options.graphExtractionTerms)
  const childChunks = chunks.filter((chunk) => chunk.level === "child")
  const entityByName = new Map<string, StoredGraphEntity>()
  const edgeByPair = new Map<string, StoredGraphEdge>()
  const llmConfirmations = buildLlmConfirmationIndex(options.llmExtraction)

  for (const chunk of childChunks) {
    const candidates = rankEntityCandidates(collectEntityCandidates(chunk.text, llmConfirmations, graphExtractionTerms))
    const chunkEntities: Array<{ id: string, isStrongSignal: boolean, score: number }> = []

    for (const candidate of candidates) {
      const normalizedName = candidate.normalizedName

      if (!normalizedName) {
        continue
      }

      const id = `${workspaceId}:${documentId}:entity:${createSafeId(normalizedName)}`
      const mention = {
        documentId,
        chunkId: chunk.chunkId,
        parentChunkId: chunk.parentChunkId,
        pageNumbers: chunk.pageNumbers,
        text: createEvidenceText(chunk.text),
      }
      const existingEntity = entityByName.get(normalizedName)
      const candidateConfidence = clamp(0.42 + (candidate.score * 0.42), 0.48, candidate.llmConfirmed ? 0.92 : 0.82)

      if (existingEntity) {
        existingEntity.aliases = uniqueValues([...existingEntity.aliases, candidate.name])
        existingEntity.mentions.push(mention)
        existingEntity.confidence = Math.min(1, Math.max(existingEntity.confidence, candidateConfidence) + 0.08)
        existingEntity.type = candidate.type ?? existingEntity.type
        existingEntity.updatedAt = now
      } else {
        entityByName.set(normalizedName, {
          id,
          workspaceId,
          documentId,
          name: candidate.name,
          normalizedName,
          type: candidate.type ?? inferEntityType(candidate.name),
          aliases: [candidate.name],
          mentions: [mention],
          confidence: candidateConfidence,
          createdAt: now,
          updatedAt: now,
        })
      }

      chunkEntities.push({
        id,
        isStrongSignal: candidate.isStrongSignal || candidate.llmConfirmed,
        score: candidate.score,
      })
    }

    const edgeEligibleEntities = Array.from(new Map(chunkEntities.map((entity) => [entity.id, entity])).values())
      .filter((entity) => entity.score >= MIN_COOCCURRENCE_ENTITY_SCORE || entity.isStrongSignal)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score
        }

        return left.id.localeCompare(right.id)
      })
      .slice(0, MAX_COOCCURRENCE_ENTITIES_PER_CHUNK)

    for (let leftIndex = 0; leftIndex < edgeEligibleEntities.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < edgeEligibleEntities.length; rightIndex += 1) {
        const sourceEntity = edgeEligibleEntities[leftIndex]
        const targetEntity = edgeEligibleEntities[rightIndex]

        if (!sourceEntity.isStrongSignal && !targetEntity.isStrongSignal) {
          continue
        }

        const sourceEntityId = sourceEntity.id
        const targetEntityId = targetEntity.id
        const edgeId = createEdgeId(
          workspaceId,
          documentId,
          sourceEntityId,
          targetEntityId,
          "co_occurs_with"
        )
        const existingEdge = edgeByPair.get(edgeId)

        if (existingEdge) {
          existingEdge.chunkIds = uniqueValues([...existingEdge.chunkIds, chunk.chunkId])
          existingEdge.documentIds = uniqueValues([...existingEdge.documentIds, documentId])
          existingEdge.evidenceText = uniqueValues([
            ...existingEdge.evidenceText,
            createEvidenceText(chunk.text),
          ]).slice(0, 5)
          existingEdge.weight += 1
          existingEdge.confidence = Math.min(1, existingEdge.confidence + 0.08)
          existingEdge.updatedAt = now
        } else {
          edgeByPair.set(edgeId, {
            id: edgeId,
            workspaceId,
            sourceEntityId,
            targetEntityId,
            type: "co_occurs_with",
            documentIds: [documentId],
            chunkIds: [chunk.chunkId],
            weight: 1,
            evidenceText: [createEvidenceText(chunk.text)],
            confidence: 0.46,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }
  }

  mergeLlmExtraction(
    workspaceId,
    documentId,
    chunks,
    entityByName,
    edgeByPair,
    options.llmExtraction,
    graphExtractionTerms,
    now
  )

  return {
    edges: Array.from(edgeByPair.values()),
    entities: Array.from(entityByName.values()),
  }
}

export function applyGraphEntityEmbeddings(
  graph: DocumentGraph,
  embeddings: GeneratedEmbedding[]
): DocumentGraph {
  return {
    ...graph,
    entities: graph.entities.map((entity, index) => {
      const embedding = embeddings[index]

      return embedding
        ? {
            ...entity,
            embedding: embedding.embedding,
            embeddingDimensions: embedding.dimensions,
            embeddingModel: embedding.model,
          }
        : entity
    }),
  }
}
