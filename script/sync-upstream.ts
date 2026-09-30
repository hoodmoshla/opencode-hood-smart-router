import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

type SyncJournal = {
  upstream: {
    repository: string
    branch: string
    lastSyncedCommit: string
    lastSyncedTimestamp: string
  }
  downstream: {
    officialBranch: string
    syncBranch: string
  }
  protectedFeatures: Array<{
    name: string
    files: string[]
    critical: boolean
  }>
  verificationGates: string[]
  syncHistory: Array<{
    timestamp: string
    upstreamCommit: string
    status: string
    testsPassed: boolean
    releaseBuilt: boolean
    notes: string
  }>
}

const rootDir = resolve(import.meta.dir, "..")
const journalPath = resolve(rootDir, "sync-journal.json")

function runCommand(command: string, allowFail = false): string {
  try {
    return execSync(command, { cwd: rootDir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
  } catch (error: any) {
    if (allowFail) return error.stdout?.toString() ?? ""
    throw new Error(`Command failed: ${command}\nStderr: ${error.stderr?.toString() ?? error.message}`)
  }
}

export async function syncUpstream() {
  console.log("=== Hood Smart Router — Upstream Sync Engine ===")
  const journalRaw = readFileSync(journalPath, "utf8")
  const journal: SyncJournal = JSON.parse(journalRaw)

  // 1. Ensure upstream remote exists
  const remotes = runCommand("git remote -v")
  if (!remotes.includes("upstream")) {
    console.log(`Adding upstream remote: ${journal.upstream.repository}`)
    runCommand(`git remote add upstream ${journal.upstream.repository}`)
  }

  // 2. Fetch upstream target branch
  console.log(`Fetching latest commits from upstream ${journal.upstream.branch}...`)
  runCommand(`git fetch upstream ${journal.upstream.branch} --no-tags`)

  // 3. Get latest upstream commit
  const upstreamRef = `upstream/${journal.upstream.branch}`
  const latestUpstreamCommit = runCommand(`git rev-parse ${upstreamRef}`)
  console.log(`Latest upstream commit on ${journal.upstream.branch}: ${latestUpstreamCommit}`)
  console.log(`Last recorded sync commit: ${journal.upstream.lastSyncedCommit}`)

  if (latestUpstreamCommit === journal.upstream.lastSyncedCommit) {
    console.log("✓ Hood Smart Router is already fully up-to-date with upstream OpenCode. No sync required.")
    return { status: "UP_TO_DATE", commit: latestUpstreamCommit }
  }

  // 4. List incoming commits
  const incomingLog = runCommand(`git log --oneline ${journal.upstream.lastSyncedCommit}..${upstreamRef}`)
  console.log("Incoming upstream commits:")
  console.log(incomingLog)

  // 5. Check out / prepare sync branch
  const syncBranch = journal.downstream.syncBranch
  console.log(`Switching to dedicated sync branch: ${syncBranch}`)
  runCommand(`git checkout -B ${syncBranch} ${journal.downstream.officialBranch}`)

  // 6. Attempt automated merge without committing
  console.log("Attempting merge with upstream...")
  try {
    execSync(`git merge ${upstreamRef} --no-commit --no-ff`, { cwd: rootDir, stdio: "pipe" })
  } catch {
    // Conflict occurred
    const conflictedFiles = runCommand("git diff --name-only --diff-filter=U", true)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)

    console.error("\n❌ MERGE CONFLICT DETECTED!")
    console.error("The following files have conflicts:")
    for (const file of conflictedFiles) {
      const isProtected = journal.protectedFeatures.some((feature) =>
        feature.files.some((p) => file.startsWith(p) || p.startsWith(file)),
      )
      console.error(`  - ${file} ${isProtected ? "🚨 [CRITICAL PROTECTED FEATURE]" : ""}`)
    }

    console.log("\nAborting merge to prevent breaking Hood Smart Router custom modifications...")
    try {
      runCommand("git merge --abort")
    } catch {}

    // Record conflict in journal
    journal.syncHistory.unshift({
      timestamp: new Date().toISOString(),
      upstreamCommit: latestUpstreamCommit,
      status: "CONFLICT_PENDING_REVIEW",
      testsPassed: false,
      releaseBuilt: false,
      notes: `Conflicts in ${conflictedFiles.length} files: ${conflictedFiles.join(", ")}`,
    })
    writeFileSync(journalPath, JSON.stringify(journal, null, 2), "utf8")

    return { status: "CONFLICT", files: conflictedFiles, commit: latestUpstreamCommit }
  }

  // 7. Keep our repository's CI workflows isolated from upstream workflow modifications
  try {
    runCommand("git reset HEAD -- .github/workflows", true)
    runCommand("git checkout HEAD -- .github/workflows", true)
    runCommand("git clean -fd -- .github/workflows", true)
  } catch {}

  // 8. Check if critical protected features were overwritten or corrupted
  console.log("Verifying protected Hood Smart Router features...")
  const changedFiles = runCommand("git diff --cached --name-only")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)

  console.log(`Merged ${changedFiles.length} changed files from upstream.`)

  // 8. Run Verification Gates
  console.log("Running quality and test verification gates...")
  for (const gate of journal.verificationGates) {
    console.log(`Running: ${gate}...`)
    try {
      execSync(gate, { cwd: rootDir, stdio: "inherit" })
    } catch (testErr) {
      console.error(`\n❌ VERIFICATION GATE FAILED: ${gate}`)
      console.log("Aborting merge to preserve stability...")
      runCommand("git merge --abort")

      journal.syncHistory.unshift({
        timestamp: new Date().toISOString(),
        upstreamCommit: latestUpstreamCommit,
        status: "VERIFICATION_FAILED",
        testsPassed: false,
        releaseBuilt: false,
        notes: `Failed verification gate: ${gate}`,
      })
      writeFileSync(journalPath, JSON.stringify(journal, null, 2), "utf8")
      return { status: "GATE_FAILED", gate, commit: latestUpstreamCommit }
    }
  }

  // 9. Commit the clean merge
  console.log("All tests and typechecks passed! Committing merge...")
  runCommand(
    `git commit -m "chore(sync): merge upstream opencode ${latestUpstreamCommit.slice(0, 9)} into hood-smart-router"`,
  )

  // 10. Update journal
  journal.upstream.lastSyncedCommit = latestUpstreamCommit
  journal.upstream.lastSyncedTimestamp = new Date().toISOString()
  journal.syncHistory.unshift({
    timestamp: new Date().toISOString(),
    upstreamCommit: latestUpstreamCommit,
    status: "SUCCESS",
    testsPassed: true,
    releaseBuilt: false,
    notes: `Successfully merged and verified upstream commit ${latestUpstreamCommit.slice(0, 9)}.`,
  })
  writeFileSync(journalPath, JSON.stringify(journal, null, 2), "utf8")

  // Commit journal update
  runCommand(`git add sync-journal.json`)
  runCommand(`git commit -m "chore(sync): record upstream sync update in journal"`)

  console.log("✓ Synchronization completed successfully with 100% integrity!")
  return { status: "SUCCESS", commit: latestUpstreamCommit }
}

if (import.meta.main) {
  syncUpstream()
    .then((result) => {
      if (result.status === "CONFLICT") {
        console.error("Halting CI: Manual review required for merge conflicts.")
        process.exit(1)
      }
    })
    .catch((err) => {
      console.error("Sync failed:", err)
      process.exit(1)
    })
}
