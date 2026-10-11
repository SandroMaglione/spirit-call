# Local checks, builds, and releases

GitHub runs only `pnpm check` on pull requests: typecheck, lint, and tests.
New pushes cancel superseded check runs. There are no GitHub deployments,
balance audits, native builds, emulator runs, or engine update workflows.
The existing release tests still build temporary bundles to check that
playtest code is absent from the release.

## Day to day

Run `pnpm check` before committing. Run the tools relevant to a change
locally, including the balance audit when changing combat or content:

```sh
pnpm balance --compare test/balance-baseline.json --output /tmp/balance-report.json
```

See [balance.md](balance.md) for broader sweeps and reviewing a changed
baseline. Test gameplay and UI in a browser and on a phone before release.

## Build against the published engine

Day-to-day development links the sibling bevy-ts checkout. For a release,
use a separate clean worktree, so local engine changes cannot enter it:

```sh
git fetch origin main
git worktree add --detach ../spirit-call-release origin/main
cd ../spirit-call-release
node scripts/use-published-bevy-ts.ts
pnpm install --no-frozen-lockfile
pnpm check
```

The swap intentionally changes this worktree's `package.json` and lockfile.
Keep it out of commits. Run the build or deployment commands below from
this worktree. For a newer engine release, change `bevyTsRelease` in the
development checkout, validate against that published version in a clean
worktree, and submit the version change as a normal pull request.

## Web deployment

Install the separate tooling with `pnpm --dir deploy install --frozen-lockfile`
and check it with `pnpm --dir deploy typecheck`. Use your local Alchemy
Cloudflare profile or the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
environment variables. Keep credentials outside the repository.

From `deploy/`, apply the shared database migrations before deploying a
release from main:

```sh
pnpm alchemy deploy --config stacks/database.ts --stage shared
pnpm alchemy deploy --stage prod
```

Use `--stage playtest` instead of `--stage prod` for the testers' game.
Prod sends no runs; playtest does. A personal preview can use the default
stage with `pnpm alchemy deploy`, and `pnpm alchemy destroy` removes it.
You can also deploy a named preview with `--stage pr-<number>`. Its database
belongs to that stage. When finished, destroy it locally with
`pnpm alchemy destroy --stage pr-<number>`, including previews left from the
former GitHub workflow. Closing a PR no longer cleans up a deployed stage.

Verify the deployed game before sharing its address. See
[playtest.md](playtest.md) for the stage and database rules.

## Native builds

See [mobile.md](mobile.md) for the SDK requirements, signing, and store
assets. Build only the platform you need:

```sh
pnpm build
pnpm exec cap sync android
cd android
./gradlew assembleDebug
```

Install `android/app/build/outputs/apk/debug/app-debug.apk` from the
worktree root on a phone or emulator and check that it opens, preserves
saves, and plays correctly. Android Studio can run it on either device.

For iOS, from the worktree root:

```sh
pnpm build
pnpm exec cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

This builds for the simulator without signing. Xcode handles running on a
device and a signed store archive.
