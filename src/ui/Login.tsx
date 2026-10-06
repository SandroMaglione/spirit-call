/**
 * The way in: log in, or create an account (a username and a password).
 * It shows before the game loads, over the backdrop, until the server
 * accepts; then it goes and the game starts with that player's account.
 */
import { render } from "preact"
import { useSignal } from "@preact/signals"

import { Pill } from "./kit/controls.tsx"
import { fitToScreen } from "./kit/scale.ts"
import "./kit/kit.css"
import "./screens.css"

/** What the login asks the server: the player's username, or what went wrong, in words. */
export type SignIn = (mode: "signUp" | "logIn", username: string, password: string) => Promise<{ readonly ok: true; readonly username: string } | { readonly ok: false; readonly problem: string }>

const Login = ({ signIn, done }: { readonly signIn: SignIn; readonly done: (username: string) => void }) => {
  const mode = useSignal<"logIn" | "signUp">("logIn")
  const username = useSignal("")
  const password = useSignal("")
  const problem = useSignal<string | null>(null)
  const busy = useSignal(false)
  const submit = async () => {
    if (busy.value) return
    busy.value = true
    problem.value = null
    const result = await signIn(mode.value, username.value.trim(), password.value)
    busy.value = false
    if (result.ok) done(result.username)
    else problem.value = result.problem
  }
  const creating = mode.value === "signUp"
  return <div class="ui-screen">
    <form class="login panel in-below" onSubmit={(event) => {
      event.preventDefault()
      void submit()
    }}>
      <h1 class="login__title">{creating ? "Create an account" : "Log in"}</h1>
      <label class="login__field">
        <span class="login__label">Username</span>
        <input class="text-input" name="username" autocomplete="username" autocapitalize="none" spellcheck={false} required value={username.value} onInput={(event) => (username.value = event.currentTarget.value)} />
      </label>
      <label class="login__field">
        <span class="login__label">Password</span>
        <input class="text-input" name="password" type="password" autocomplete={creating ? "new-password" : "current-password"} required value={password.value} onInput={(event) => (password.value = event.currentTarget.value)} />
      </label>
      {problem.value !== null && <p class="login__problem" role="alert">{problem.value}</p>}
      <div class="login__actions">
        <Pill tone="dark" size="small" onClick={() => {
          mode.value = creating ? "logIn" : "signUp"
          problem.value = null
        }}>{creating ? "I have an account" : "New here? Create one"}</Pill>
        <button type="submit" class="pill" disabled={busy.value}><span class="pill__label">{creating ? "Create" : "Log in"}</span></button>
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
