import { app } from "electron"

type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.OPENCODE_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const APP_NAMES: Record<Channel, string> = {
  dev: "Hood Smart Router Dev",
  beta: "Hood Smart Router Beta",
  prod: "Hood Smart Router",
}

export const APP_IDS: Record<Channel, string> = {
  dev: "com.hoodmoshla.hoodsmartrouter.dev",
  beta: "com.hoodmoshla.hoodsmartrouter.beta",
  prod: "com.hoodmoshla.hoodsmartrouter",
}

export const PROTOCOL_NAME: Record<Channel, string> = {
  dev: "Hood Smart Router Dev",
  beta: "Hood Smart Router Beta",
  prod: "Hood Smart Router",
}

export const PROTOCOL_SCHEME = "hood-smart-router"

export const UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev"
