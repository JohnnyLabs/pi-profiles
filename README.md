# pi-profiles

Configuration profile manager for [pi](https://pi.dev). Switch between
sets of settings, extensions, skills, themes, and auth with a single command.
Sessions are shared with stock Pi by default so profile switching keeps one
continuous history.

Inspired by [chemacs](https://github.com/plexus/chemacs2) (Emacs profile
switcher) and Neovim's `NVIM_APPNAME`.

## How it works

Pi resolves its configuration directory via `PI_CODING_AGENT_DIR` and its
session storage via `PI_CODING_AGENT_SESSION_DIR`. `ppi` creates and manages
profile directories under `~/.pi/profiles/<name>/`, then launches Pi with both
environment variables pointed at the selected profile. Shared profiles expose
`<profile>/sessions` as a symlink to `~/.pi/agent/sessions`, while
`--own-sessions` creates a real per-profile session directory.

## Install

```bash
npm install -g pi-profiles
```

Requires [pi](https://pi.dev) and Node.js (which you already have if you
have pi).

## Usage

```bash
# Create a profile
ppi create work
ppi create personal --own-auth    # independent API key
ppi create scratch --own-sessions   # independent session history

# Create from your current pi config
ppi create work --from-base

# Copy an existing profile
ppi create experiments --from work

# List profiles
ppi list

# Set a default
ppi set-default work

# Launch pi with a profile
ppi use work
ppi                               # launches the default profile
ppi use work -- -p "fix the bug"  # pass args to pi after --

# Delete a profile
ppi delete experiments            # interactive confirmation
ppi delete experiments --force    # skip confirmation
```

## What a profile looks like

Each profile is a complete pi agentDir:

```
~/.pi/profiles/work/
├── settings.json
├── auth.json → ~/.pi/agent/auth.json  (symlink by default)
├── models.json → ~/.pi/agent/models.json
├── extensions/
├── skills/
├── tools/
├── prompts/
└── sessions → ~/.pi/agent/sessions       (symlink by default)
```

Auth, models, and sessions are shared from the stock Pi config by default, so
one `pi login` and one session history work everywhere. Pass `--own-auth`,
`--own-models`, or `--own-sessions` to `create` when a profile needs its own
copy/store.

Existing profiles created by upstream `ppi` keep their previous behavior:
a real `<profile>/sessions/` directory remains isolated. Newly created profiles
share sessions unless `--own-sessions` is supplied.

## Goals

- **Isolated configuration, shared state by default.** Each profile is its
  own agentDir for settings, extensions, skills, themes, and prompts. Auth,
  models, and sessions are shared unless their corresponding `--own-*` option
  is requested.

- **Zero Pi modifications.** Works through Pi's documented
  `PI_CODING_AGENT_DIR` and `PI_CODING_AGENT_SESSION_DIR` environment
  variables. No Pi patches are required.

- **Zero runtime dependencies.** Pure Node.js filesystem operations.
  Hand-rolled arg parser. Nothing to install beyond this package.

- **Library + CLI.** `ProfileManager` class can be used programmatically
  (e.g., by a future orchestrator calling `createAgentSession({ agentDir })`).
  The CLI is a thin wrapper.

- **Composable.** Profile paths are predictable (`~/.pi/profiles/<name>/`),
  so they work with external tools:
  ```bash
  docker run -v ~/.pi/profiles/work:/root/.pi/agent pi-image
  ```

## Non-goals

- **Process-level sandboxing.** Profiles manage *which config* to use, not
  *where code runs*. Docker, VMs, and bubblewrap are orthogonal
  infrastructure concerns. Pi's built-in sandbox extension handles
  tool-level restrictions within a profile.

- **Agent orchestration.** Spawning multiple concurrent agents with
  different profiles is a motivating future use case, but the orchestrator
  itself is a separate project.

- **Runtime settings patching.** No mid-session model/tool switching.
  Pi's built-in `/model` command handles that.

- **Registry file.** Profiles live at `~/.pi/profiles/<name>/` by
  convention. No mapping file to maintain. The filesystem is the registry.

## Programmatic usage

```typescript
import { ProfileManager } from "pi-profiles";

const pm = new ProfileManager();
const profile = pm.resolve("work");
console.log(profile.path); // ~/.pi/profiles/work

// Use with pi's SDK
import { createAgentSession } from "@mariozechner/pi-coding-agent";
const { session } = await createAgentSession({ agentDir: profile.path });
```
