export type HoodTaskKind = "coding" | "analysis" | "simple" | "vision" | "long" | "reasoning"

export type SeekAIHealth = "verified" | "rate_limited" | "service_unavailable" | "unknown"

export type HoodModel = {
  providerID: string
  modelID: string
  name?: string
  free?: boolean
  seekaiHealth?: SeekAIHealth
  capabilities?: {
    vision?: boolean
    reasoning?: boolean
    longContext?: boolean
  }
}

const HOOD_ROUTER_STORAGE_KEY = "hood-smart-router.enabled"

const SEEKAI_HEALTH: Record<string, SeekAIHealth> = {
  "glm-5.3-flash": "verified",
  "grok-4.6": "rate_limited",
  "deepseek-v4-flash-vis": "rate_limited",
  "deepseek-v4-flash": "rate_limited",
  "minimax-m3": "service_unavailable",
  "kimi-k3": "service_unavailable",
  "rino-v2.5": "service_unavailable",
}

export function isHoodRouterEnabled() {
  if (typeof localStorage === "undefined") return true
  return localStorage.getItem(HOOD_ROUTER_STORAGE_KEY) !== "false"
}

export function setHoodRouterEnabled(enabled: boolean) {
  if (typeof localStorage !== "undefined") localStorage.setItem(HOOD_ROUTER_STORAGE_KEY, String(enabled))
}

export type HoodRouterInput = {
  text: string
  hasImages?: boolean
  available: readonly HoodModel[]
  fallback?: HoodModel
  allowRateLimitedSeekAI?: boolean
}

export type HoodRouterDecision = {
  enabled: true
  task: HoodTaskKind
  model: HoodModel
  reason: string
  candidates: HoodModel[]
}

const normalize = (value: string) => value.toLowerCase()
const hasAny = (text: string, terms: readonly string[]) => terms.some((term) => text.includes(term))
const isSeekAI = (model: HoodModel) => normalize(model.providerID).includes("seekai")

export function seekAIHealth(modelID: string): SeekAIHealth {
  return SEEKAI_HEALTH[normalize(modelID)] ?? "unknown"
}

export function isSeekAIEligible(model: HoodModel, allowRateLimited = false) {
  if (!isSeekAI(model)) return true
  const health = model.seekaiHealth ?? seekAIHealth(model.modelID)
  return health === "verified" || (allowRateLimited && health === "rate_limited")
}

export function classifyHoodTask(text: string, hasImages = false): HoodTaskKind {
  const value = normalize(text)
  if (hasImages || hasAny(value, ["image", "screenshot", "صورة", "صور", "رؤية", "vision"])) return "vision"
  if (hasAny(value, ["reasoning", "prove", "derive", "architecture decision", "استدلال", "برهان", "قرار معماري"])) {
    return "reasoning"
  }
  if (hasAny(value, ["whole project", "repository", "codebase", "analyze project", "المشروع كامل", "تحليل المشروع"])) {
    return "analysis"
  }
  if (hasAny(value, ["refactor", "debug", "bug", "implement", "fix", "تصحيح", "برمجة", "إصلاح", "تنفيذ"])) return "coding"
  if (hasAny(value, ["long", "migration", "large", "طويل", "ترحيل", "كبير"])) return "long"
  return "simple"
}

const providerScore = (model: HoodModel, task: HoodTaskKind) => {
  const id = normalize(`${model.providerID}/${model.modelID} ${model.name ?? ""}`)
  const seekai = isSeekAI(model)
  const gemini = id.includes("gemini") || id.includes("google")
  const free = model.free || id.includes("free") || id.includes("big-pickle") || id.includes("nemotron") || id.includes("mimo")
  const vision = model.capabilities?.vision || id.includes("vision") || id.includes("gemini") || id.includes("flash-vis")
  const reasoning = model.capabilities?.reasoning || id.includes("reason") || id.includes("r1") || id.includes("o3")
  const longContext = model.capabilities?.longContext || id.includes("long") || id.includes("gemini") || id.includes("claude")

  let score = free ? 100 : 0
  if (task === "vision") score += vision ? 80 : -80
  if (task === "reasoning") score += reasoning ? 80 : 0
  if (task === "long") score += longContext ? 70 : 0
  if (task === "coding" || task === "analysis") score += reasoning ? 35 : 0
  if (gemini && task === "vision") score += 25
  if (seekai) score -= 20
  if (task === "coding" && (id.includes("big-pickle") || id.includes("nemotron") || id.includes("claude") || id.includes("gpt"))) score += 30
  return score
}

export function chooseHoodModel(input: HoodRouterInput): HoodRouterDecision | undefined {
  if (input.available.length === 0 && !input.fallback) return undefined
  const task = classifyHoodTask(input.text, input.hasImages)
  const available = input.available.filter((model) => isSeekAIEligible(model, input.allowRateLimitedSeekAI))
  const candidates = [...available].sort((a, b) => providerScore(b, task) - providerScore(a, task))
  const model = candidates[0] ?? input.fallback
  if (!model || !isSeekAIEligible(model, input.allowRateLimitedSeekAI)) return undefined
  const freeFirst = model.free || normalize(`${model.providerID}/${model.modelID}`).includes("free")
  const health = isSeekAI(model) ? `seekai-health=${model.seekaiHealth ?? seekAIHealth(model.modelID)}` : "provider-health=available"
  const reason = `${task}; ${freeFirst ? "free-first" : "best available capability"}; ${health}; score=${providerScore(model, task)}`
  return { enabled: true, task, model, reason, candidates }
}
