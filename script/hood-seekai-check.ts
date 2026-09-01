const baseURL = (process.env.SEEKAI_BASE_URL ?? "https://seekai.cc/v1").replace(/\/$/, "")
const apiKey = process.env.SEEKAI_API_KEY
const requested = process.argv.slice(2)

if (!apiKey) {
  console.error("SEEKAI_API_KEY is not set; refusing to run authenticated checks.")
  process.exit(2)
}

const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }
const modelsResponse = await fetch(`${baseURL}/models`, { headers })
if (!modelsResponse.ok) {
  console.error(`SeekAI /models failed: HTTP ${modelsResponse.status}`)
  process.exit(1)
}

const body = (await modelsResponse.json()) as { data?: Array<{ id?: string }> }
const listed = (body.data ?? []).flatMap((item) => (item.id ? [item.id] : []))
const candidates = requested.length > 0 ? requested : listed
const results: Array<{ model: string; ok: boolean; status: number; error?: string }> = []

for (const model of candidates) {
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 8 }),
  })
  if (response.ok) {
    results.push({ model, ok: true, status: response.status })
    continue
  }
  const error = await response.text().catch(() => "")
  results.push({ model, ok: false, status: response.status, error: error.slice(0, 240) })
}

console.log(JSON.stringify({ baseURL, listed, verified: results.filter((item) => item.ok).map((item) => item.model), results }, null, 2))
if (results.some((item) => !item.ok)) process.exitCode = 1
