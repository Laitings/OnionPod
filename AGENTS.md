# OnionPod contributor instructions

## Product and current state

OnionPod is a podcast player targeting Android and the web. Both platforms are required. This repository currently contains planning and contributor documentation only; the framework, package manager, backend, and hosting have not been selected.

The proposed first release includes podcast search, RSS subscriptions, episode browsing, playback and speed controls, a queue, and saved listening progress. Android background playback, lock-screen controls, and offline downloads are proposed platform features. Account-based cross-device sync is a later candidate. These are planning targets, not implemented features or a mandate to build everything in one task.

## Before changing code

- Read this file, README.md, and any instructions nearer the files being changed.
- Inspect the current code and Git status. Preserve existing user and contributor changes.
- Keep changes within the assigned task. State assumptions and resolve routine choices independently.
- Do not invent setup commands or describe planned features as working.
- When selecting the initial stack, explain how it supports both platforms and document the choice and tradeoffs in README.md or a short architecture decision under docs/decisions/.

## Working with other AI and human contributors

- Use one focused branch per task, with names such as feature/episode-player, fix/queue-order, or docs/setup.
- For simultaneous work, use separate Git worktrees or clones. Do not let multiple contributors change branches in the same checkout.
- Agree on ownership before editing shared interfaces, dependency manifests, or lockfiles concurrently.
- Read the latest changes before editing. Do not overwrite, revert, or discard another contributor's work to make your task easier.
- Keep pull requests focused and explain the behavior changed, checks performed, and remaining limitations.
- In handoffs, include the branch, files changed, decisions, verification results, and the next concrete step. Put lasting decisions in repository documentation rather than relying on chat history.
- Do not force-push, rewrite shared history, or merge another contributor's work without task authorization.

## Implementation principles

- Share domain models and application logic where practical; isolate platform playback, storage, download, and notification behavior behind clear interfaces.
- Keep playback state consistent across episode views, the player, and the queue. Handle interrupted playback and restore progress deliberately.
- Treat RSS feeds and episode metadata as untrusted input. Handle malformed feeds, missing fields, network failures, and unsafe markup.
- Never put private API keys, signing keys, or other secrets in the repository or client bundles. Document required configuration with placeholder values.
- Account for browser CORS and autoplay restrictions when implementing web feed loading and playback. Document actual supported behavior.
- Make controls accessible with labels, keyboard support on the web, readable contrast, and suitable touch targets.
- Do not add accounts, analytics, paid services, or a backend solely for speculative future needs.

## Verification and completion

- No build, test, or lint commands exist yet. Add exact setup and verification commands to README.md when the application is scaffolded.
- Run checks appropriate to the change. Add meaningful tests for playback state, queue behavior, progress persistence, and feed parsing as those features are implemented.
- Verify shared changes on both platforms when tooling is available. Clearly identify any untested platform; never imply that a web build verifies native Android behavior.
- Verify Android background playback, media controls, and downloads on an emulator or device when implementing those features.
- Before finishing, review the diff for unrelated edits and secrets, and report what changed, what was checked, and what remains.
