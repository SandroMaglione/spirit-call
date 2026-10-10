// Saves a database key (see reader.ts) to the file in ENV_FILE,
// readable by its owner only: the account id, and the token as KEY_NAME,
// keeping the file's other lines (settings).
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const { ENV_FILE, ACCOUNT_ID, KEY_NAME, KEY } = process.env
const set = { CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID, [KEY_NAME]: KEY }
const kept = (existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split("\n") : [])
  .filter((line) => line.includes("=") && !(line.slice(0, line.indexOf("=")) in set))
writeFileSync(ENV_FILE, [...Object.entries(set).map(([name, value]) => `${name}=${value}`), ...kept].join("\n") + "\n", { mode: 0o600 })
