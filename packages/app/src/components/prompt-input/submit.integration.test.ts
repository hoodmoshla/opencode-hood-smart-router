import { describe, expect, test } from "bun:test"
import { sendFollowupDraft } from "./submit"

const createInput = (agent: string, models: Array<{ providerID: string; modelID: string }>, prompt: (model: unknown) => Promise<void>) =>
  ({
    api: { prompt },
    serverSync: { session: { set: () => undefined } },
    sync: {
      data: { command: [] },
      session: { optimistic: { add: () => undefined, remove: () => undefined } },
    },
    draft: {
      sessionID: "session-test",
      sessionDirectory: "/tmp/opencode-test",
      prompt: [{ type: "text", text: "fix this bug" }],
      context: [],
      agent,
      model: models[0],
      routerFallbackModels: models.slice(1),
    },
    messageID: "message-test",
    optimisticBusy: false,
    before: () => true,
  }) as never

describe("sendFollowupDraft provider integration", () => {
  test("retries a retryable error and falls back to the next model", async () => {
    const calls: unknown[] = []
    let attempts = 0
    const input = createInput("architect", [
      { providerID: "seekai", modelID: "grok-4.6" },
      { providerID: "seekai", modelID: "glm-5.3-flash" },
    ], async (model) => {
      calls.push((model as { model: unknown }).model)
      attempts += 1
      if (attempts === 1) throw { status: 429 }
    })

    expect(await sendFollowupDraft(input)).toBe(true)
    expect(calls).toEqual([
      { providerID: "seekai", modelID: "grok-4.6" },
      { providerID: "seekai", modelID: "glm-5.3-flash" },
    ])
  })

  test("does not fallback for the independent SeekAI agent", async () => {
    const calls: unknown[] = []
    const input = createInput("seekai", [
      { providerID: "seekai", modelID: "grok-4.6" },
      { providerID: "seekai", modelID: "glm-5.3-flash" },
    ], async (model) => {
      calls.push((model as { model: unknown }).model)
      throw { status: 503 }
    })

    await expect(sendFollowupDraft(input)).rejects.toEqual({ status: 503 })
    expect(calls).toEqual([{ providerID: "seekai", modelID: "grok-4.6" }])
  })

  test("does not fallback for Build", async () => {
    const calls: unknown[] = []
    const input = createInput("build", [
      { providerID: "big-pickle", modelID: "big-pickle" },
      { providerID: "seekai", modelID: "glm-5.3-flash" },
    ], async (model) => {
      calls.push((model as { model: unknown }).model)
      throw { status: 503 }
    })

    await expect(sendFollowupDraft(input)).rejects.toEqual({ status: 503 })
    expect(calls).toEqual([{ providerID: "big-pickle", modelID: "big-pickle" }])
  })
})
