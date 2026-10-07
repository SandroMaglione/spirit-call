// Saves the read-only database key (see reader.ts) to the file in ENV_FILE,
// readable by its owner only.
import { writeFileSync } from "node:fs"

writeFileSync(process.env.ENV_FILE, `CLOUDFLARE_ACCOUNT_ID=${process.env.ACCOUNT_ID}\nD1_READ_TOKEN=${process.env.READ_TOKEN}\n`, { mode: 0o600 })
