#!/usr/bin/env sh
# Convenience wrapper for macOS, Linux and Git Bash. All logic lives in the Node script.
exec node "$(dirname "$0")/read-trace.mjs" "$@"
