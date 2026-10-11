/**
 * The way in: the accounts on this device. Pick one to play, make a new
 * one (a name, no password), or delete one. It shows before the game
 * loads, over the backdrop, until an account is picked that no other tab
 * is playing; then the loading screen shows (the models take a while on
 * a phone's network) until the game is up.
 */
import { render } from "preact"
import { useSignal } from "@preact/signals"
import type { ReadonlySignal } from "@preact/signals"
import { useEffect } from "preact/hooks"

import { accountNameLimit } from "../account/account.ts"
import { Confirm } from "./kit/Confirm.tsx"
import { Loading } from "./Loading.tsx"
import { RoundButton } from "./kit/controls.tsx"
import { Panel, Row } from "./kit/panel.tsx"
import { fitToScreen } from "./kit/scale.ts"
import "./kit/kit.css"
import "./screens.css"

/** The account picked to play. */
export interface Picked {
  readonly id: string
  readonly name: string
}

/** An account in the list, and how far it got: never played, a save that cannot be read, or its numbers. */
export interface AccountSummary extends Picked {
  readonly progress:
    | { readonly kind: "new" }
    | { readonly kind: "unreadable" }
    | { readonly kind: "played"; readonly characters: number; readonly secondsPlayed: number }
}

/** What the picker can ask of this device's accounts: plain functions (the shell's `openAccounts`). */
export interface Accounts {
  readonly list: () => Promise<ReadonlyArray<AccountSummary>>
  /** The account made, or why it could not be, in words. */
  readonly create: (name: string) => Promise<({ readonly ok: true } & Picked) | { readonly ok: false; readonly problem: string }>
  /** Whether it was deleted. */
  readonly remove: (id: string) => Promise<boolean>
}

/** How long an account was played, in a few words (`2h 10m`, `12m`). */
const playedFor = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** What sets an account apart in the list. */
const progressOf = (account: AccountSummary) => {
  switch (account.progress.kind) {
    case "new":
      return "New"
    case "unreadable":
      return "Cannot be read"
    case "played":
      return `${account.progress.characters} ${account.progress.characters === 1 ? "character" : "characters"} · ${playedFor(account.progress.secondsPlayed)}`
  }
}

const AccountPicker = ({ accounts, play }: {
  readonly accounts: Accounts
  /** Plays the account: `false` when another tab is playing it. */
  readonly play: (account: Picked) => Promise<boolean>
}) => {
  const list = useSignal<ReadonlyArray<AccountSummary> | null>(null)
  const name = useSignal("")
  const problem = useSignal<string | null>(null)
  const busy = useSignal(false)
  const deleting = useSignal<AccountSummary | null>(null)
  const refresh = async () => {
    list.value = await accounts.list()
  }
  useEffect(() => {
    void refresh()
  }, [])
  /** Runs one thing at a time, saying what went wrong. */
  const run = async (action: () => Promise<string | null>) => {
    if (busy.value) return
    busy.value = true
    problem.value = null
    problem.value = await action()
    busy.value = false
  }
  const pick = (account: AccountSummary) =>
    run(async () => ((await play(account)) ? null : `${account.name} is open in another tab. Close it there to play here.`))
  const create = () =>
    run(async () => {
      const made = await accounts.create(name.value)
      if (!made.ok) return made.problem
      return (await play(made)) ? null : "The new account could not be opened."
    })
  const remove = (account: AccountSummary) =>
    run(async () => {
      deleting.value = null
      const removed = await accounts.remove(account.id)
      await refresh()
      return removed ? null : `${account.name} could not be deleted.`
    })
  if (list.value === null) return null
  const none = list.value.length === 0
  return <div class="ui-screen">
    <Panel class="accounts in-below" title={none ? "Name your account" : "Choose an account"}>
      {list.value.map((account) =>
        <div class="accounts__row" key={account.id}>
          <Row tall onClick={() => void pick(account)} end={progressOf(account)}>{account.name}</Row>
          <RoundButton icon="close" tone="dark" label={`Delete ${account.name}`} onClick={() => (deleting.value = account)} />
        </div>
      )}
      <form class="accounts__new" onSubmit={(event) => {
        event.preventDefault()
        void create()
      }}>
        <input class="text-input" name="name" placeholder={none ? "Your name" : "A new account's name"} aria-label="Account name" maxLength={accountNameLimit} autocomplete="off" spellcheck={false}
          value={name.value} onInput={(event) => (name.value = event.currentTarget.value)} />
        <button type="submit" class="pill" disabled={busy.value}><span class="pill__label">{none ? "Play" : "New"}</span></button>
      </form>
      {problem.value !== null && <p class="accounts__problem" role="alert">{problem.value}</p>}
    </Panel>
    {deleting.value !== null && <Confirm title={`Delete ${deleting.value.name}?`} confirm="Delete" close={() => (deleting.value = null)} onConfirm={() => void remove(deleting.value!)}>
      All of this account's progress on this device is gone for good.
    </Confirm>}
  </div>
}

/** The account picked, and how to take the loading view away once the game is up. */
export interface Opened extends Picked {
  readonly loaded: () => void
}

/** Shows the accounts over `parent` until one is picked and playing it is held (`hold`), then the loading screen (`progress`, 0 to 1) until `loaded`. */
export const showAccounts = (parent: HTMLElement, accounts: Accounts, hold: (id: string) => Promise<boolean>, progress: ReadonlySignal<number>): Promise<Opened> =>
  new Promise((resolve) => {
    const backdrop = document.createElement("div")
    backdrop.className = "ui-backdrop"
    backdrop.innerHTML = `<div class="backdrop"><div class="backdrop__light"></div><div class="backdrop__light"></div><div class="backdrop__pool"></div></div>`
    const root = document.createElement("div")
    root.className = "ui"
    parent.append(backdrop, root)
    fitToScreen([backdrop, root])
    // The loading screen fades out over the menu, once.
    let closing = false
    const loaded = () => {
      if (closing) return
      closing = true
      backdrop.remove()
      root.classList.add("loading-out")
      setTimeout(() => {
        render(null, root)
        root.remove()
      }, 400)
    }
    render(<AccountPicker accounts={accounts} play={async (account) => {
      if (!(await hold(account.id))) return false
      render(<Loading progress={progress} />, root)
      resolve({ id: account.id, name: account.name, loaded })
      return true
    }} />, root)
  })
