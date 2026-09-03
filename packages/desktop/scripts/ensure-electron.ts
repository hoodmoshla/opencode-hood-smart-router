#!/usr/bin/env bun
import { $ } from "bun"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const packageDir = join(import.meta.dir, "..")
const electronCandidates = [
  join(packageDir, "node_modules", "electron"),
  join(packageDir, "..", "..", "node_modules", "electron"),
]
const electronDir = electronCandidates.find((candidate) => existsSync(join(candidate, "package.json")))
if (!electronDir) throw new Error("Electron package is not installed; run bun install before starting Desktop")
const electronPackage = JSON.parse(readFileSync(join(electronDir, "package.json"), "utf8")) as { version: string }
const version = electronPackage.version
const executable = process.platform === "win32" ? "electron.exe" : "electron"
const distDir = join(electronDir, "dist")
const executablePath = join(distDir, executable)

if (existsSync(executablePath)) {
  console.log(`Electron ${version} already available in cache`)
  process.exit(0)
}

try {
  await $`bun run install-electron`
  if (existsSync(executablePath)) process.exit(0)
} catch (error) {
  console.warn("Electron package downloader failed; using direct release fallback", error)
}

const platform = process.platform === "win32" ? "win32" : process.platform
const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : process.arch
const filename = `electron-v${version}-${platform}-${arch}.zip`
const url = `https://github.com/electron/electron/releases/download/v${version}/${filename}`
const archive = join(tmpdir(), filename)

mkdirSync(distDir, { recursive: true })
const curl = process.platform === "win32" ? "curl.exe" : "curl"
await $`${curl} --fail --location --retry 3 --retry-delay 2 --connect-timeout 20 --max-time 900 --output ${archive} ${url}`

if (process.platform === "win32") {
  await $`tar -xf ${archive} -C ${distDir}`
} else {
  await $`unzip -oq ${archive} -d ${distDir}`
}

writeFileSync(join(electronDir, "path.txt"), "dist\n")
if (!existsSync(executablePath)) throw new Error(`Electron archive extracted without ${executable}`)
console.log(`Electron ${version} downloaded and cached at ${distDir}`)
