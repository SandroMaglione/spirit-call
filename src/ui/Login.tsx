/**
 * The way in: log in, create an account (a username and a password), or set
 * a new password with the recovery code. Creating an account or recovering
 * shows the recovery code once, to write down: nobody else can give a
 * player her account back. It shows before the game loads, over the
 * backdrop, until the server accepts; then it goes and the game starts with
 * that player's account.
 */
import { render } from "preact"
import { useSignal } from "@preact/signals"

import { Pill } from "./kit/controls.tsx"
import { fitToScreen } from "./kit/scale.ts"
import "./kit/kit.css"
import "./screens.css"

/** What the login asks the server: the player's username (and a recovery code to keep), or what went wrong, in words. */
export type SignIn = (mode: "signUp" | "logIn" | "recover", username: string, password: string, code?: string) => Promise<{ readonly ok: true; readonly username: string; readonly recoveryCode?: string } | { readonly ok: false; readonly problem: string }>

const titles = { logIn: "Log in", signUp: "Create an account", recover: "Set a new password" } as const
const submits = { logIn: "Log in", signUp: "Create", recover: "Set it" } as const

const Login = ({ signIn, done }: { readonly signIn: SignIn; readonly done: (username: string) => void }) => {
  const mode = useSignal<"logIn" | "signUp" | "recover">("logIn")
  const username = useSignal("")
  const password = useSignal("")
  const code = useSignal("")
  const problem = useSignal<string | null>(null)
  const busy = useSignal(false)
  /** A recovery code to show once, and the player it is for. */
  const keep = useSignal<{ readonly username: string; readonly code: string } | null>(null)
  const submit = async () => {
    if (busy.value) return
    busy.value = true
    problem.value = null
    const result = await signIn(mode.value, username.value.trim(), password.value, code.value)
    busy.value = false
    if (!result.ok) problem.value = result.problem
    else if (result.recoveryCode !== undefined) keep.value = { username: result.username, code: result.recoveryCode }
    else done(result.username)
  }
  const switchTo = (next: "logIn" | "signUp" | "recover") => {
    mode.value = next
    problem.value = null
  }
  if (keep.value !== null) {
    const kept = keep.value
    return <div class="ui-screen">
      <div class="login panel in-below">
        <h1 class="login__title">Your recovery code</h1>
        <p class="login__note">Write it down and keep it safe. It is the only way to set a new password if you forget yours: nobody else can give your account back. It is shown only now.</p>
        <p class="login__code" aria-label="Recovery code">{kept.code}</p>
        <div class="login__actions">
          <button type="button" class="pill" onClick={() => done(kept.username)}><span class="pill__label">I wrote it down</span></button>
        </div>
      </div>
    </div>
  }
  const current = mode.value
  return <div class="ui-screen">
    <form class="login panel in-below" onSubmit={(event) => {
      event.preventDefault()
      void submit()
    }}>
      <h1 class="login__title">{titles[current]}</h1>
      <label class="login__field">
        <span class="login__label">Username</span>
        <input class="text-input" name="username" autocomplete="username" autocapitalize="none" spellcheck={false} required value={username.value} onInput={(event) => (username.value = event.currentTarget.value)} />
      </label>
      {current === "recover" && <label class="login__field">
        <span class="login__label">Recovery code</span>
        <input class="text-input" name="code" autocomplete="off" autocapitalize="characters" spellcheck={false} required value={code.value} onInput={(event) => (code.value = event.currentTarget.value)} />
      </label>}
      <label class="login__field">
        <span class="login__label">{current === "recover" ? "New password" : "Password"}</span>
        <input class="text-input" name="password" type="password" autocomplete={current === "logIn" ? "current-password" : "new-password"} required value={password.value} onInput={(event) => (password.value = event.currentTarget.value)} />
      </label>
      {problem.value !== null && <p class="login__problem" role="alert">{problem.value}</p>}
      <div class="login__actions">
        <Pill tone="dark" size="small" onClick={() => switchTo(current === "logIn" ? "signUp" : "logIn")}>{current === "logIn" ? "New here? Create one" : "I have an account"}</Pill>
        {current === "logIn" && <Pill tone="dark" size="small" onClick={() => switchTo("recover")}>Forgot it?</Pill>}
        <button type="submit" class="pill" disabled={busy.value}><span class="pill__label">{submits[current]}</span></button>
      </div>
    </form>
  </div>
}

/** Shows the login over `parent` until the server accepts the player: her username. */
export const showLogin = (parent: HTMLElement, signIn: SignIn): Promise<string> =>
  new Promise((resolve) => {
    const backdrop = document.createElement("div")
    backdrop.className = "ui-backdrop"
    backdrop.innerHTML = `<div class="backdrop"><div class="backdrop__light"></div><div class="backdrop__light"></div><div class="backdrop__pool"></div></div>`
    const root = document.createElement("div")
    root.className = "ui"
    parent.append(backdrop, root)
    fitToScreen([backdrop, root])
    render(<Login signIn={signIn} done={(username) => {
      render(null, root)
      backdrop.remove()
      root.remove()
      resolve(username)
    }} />, root)
  })
