import { describe, expect, test } from "bun:test"
import { chooseHoodModel, classifyHoodTask } from "./hood-smart-router"

const models = [
  { providerID: "big-pickle", modelID: "big-pickle", name: "Big Pickle", free: true },
  { providerID: "nvidia", modelID: "nemotron-ultra", name: "Nemotron Ultra", free: true, capabilities: { reasoning: true } },
  { providerID: "google", modelID: "gemini-2.5-flash", name: "Gemini Flash", capabilities: { vision: true } },
  { providerID: "seekai", modelID: "claude-opus-4-7", name: "Claude Opus 4.7" },
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

  test("prefers verified free models before paid SeekAI for normal coding", () => {
    const decision = chooseHoodModel({ text: "fix this bug", available: models })
    expect(["big-pickle", "nvidia"]).toContain(decision?.model.providerID ?? "")
    expect(decision?.task).toBe("coding")
  })

  test("selects a vision-capable model for image tasks", () => {
    const decision = chooseHoodModel({ text: "inspect this screenshot", hasImages: true, available: models })
    expect(decision?.model.providerID).toBe("google")
  })

  test("uses a verified SeekAI model when it is the only available model", () => {
    const decision = chooseHoodModel({ text: "write a complex implementation", available: [models[3]] })
    expect(decision?.model).toEqual(models[3])
  })
})
