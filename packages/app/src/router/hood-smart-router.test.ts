import { describe, expect, test } from "bun:test"
import { chooseHoodModel, classifyHoodTask, isSeekAIEligible, seekAIHealth } from "./hood-smart-router"

const models = [
  { providerID: "big-pickle", modelID: "big-pickle", name: "Big Pickle", free: true },
  { providerID: "nvidia", modelID: "nemotron-ultra", name: "Nemotron Ultra", free: true, capabilities: { reasoning: true } },
  { providerID: "google", modelID: "gemini-2.5-flash", name: "Gemini Flash", capabilities: { vision: true } },
  { providerID: "seekai", modelID: "glm-5.3-flash", name: "GLM 5.3 Flash" },
  { providerID: "seekai", modelID: "grok-4.6", name: "Grok 4.6" },
  { providerID: "seekai", modelID: "minimax-m3", name: "MiniMax M3" },
]

describe("Hood Smart Router", () => {
  test("classifies the supported task families", () => {
    expect(classifyHoodTask("fix the bug in this function")).toBe("coding")
    expect(classifyHoodTask("analyze the whole repository")).toBe("analysis")
    expect(classifyHoodTask("what is 2 + 2?")).toBe("simple")
    expect(classifyHoodTask("analyze this screenshot", true)).toBe("vision")
    expect(classifyHoodTask("derive a proof for this architecture decision")).toBe("reasoning")
    expect(classifyHoodTask("perform a large migration")).toBe("long")
  })

  test("prefers verified free models before verified paid SeekAI for normal coding", () => {
    const decision = chooseHoodModel({ text: "fix this bug", available: models })
    expect(["big-pickle", "nvidia"]).toContain(decision?.model.providerID ?? "")
    expect(decision?.task).toBe("coding")
  })

  test("selects a vision-capable model for image tasks", () => {
    const decision = chooseHoodModel({ text: "inspect this screenshot", hasImages: true, available: models })
    expect(decision?.model.providerID).toBe("google")
  })

  test("allows only the HTTP 200 verified SeekAI model automatically", () => {
    const decision = chooseHoodModel({ text: "write a complex implementation", available: models.slice(3) })
    expect(decision?.model.modelID).toBe("glm-5.3-flash")
    expect(seekAIHealth("glm-5.3-flash")).toBe("verified")
    expect(seekAIHealth("grok-4.6")).toBe("rate_limited")
    expect(seekAIHealth("minimax-m3")).toBe("service_unavailable")
    expect(isSeekAIEligible(models[4])).toBe(false)
    expect(isSeekAIEligible(models[5])).toBe(false)
    expect(isSeekAIEligible(models[4], true)).toBe(true)
  })
})
