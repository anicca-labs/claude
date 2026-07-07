# claude

Mariano Ksairi's Claude Code configuration — marketplace plugins, global hooks, and tooling.

## Plugins

| Plugin                                    | Description                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| [expo-rn-plugin](plugins/expo-rn-plugin/) | Claude Code plugin for React Native / Expo projects (Supabase, Firebase, REST) |

## Reference implementation

[virtual-wallet](https://github.com/ksairi-org/virtual-wallet) is the canonical example app that exercises the `expo-rn-plugin`. It's a production React Native / Expo project (Supabase auth, REST SDK, Firebase push) and serves as the integration test bed for this plugin.

Shared libraries extracted from it live in [anicca-labs/libs](https://github.com/anicca-labs/libs) — a Turborepo + Changesets monorepo publishing 18 packages under the `@anicca-labs/*` npm scope. New projects that adopt the plugin can install any of these packages independently.

## Contributing

After cloning, install the git hooks:

```bash
bash scripts/install-hooks.sh
```

This installs a pre-push hook that rebuilds MCP server `dist/` before every push and keeps CI green.
