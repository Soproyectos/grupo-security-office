#!/usr/bin/env bash
set -euo pipefail

# Starts the shared bridge for local and Tailnet browsers. MCP clients connect
# through the Tailnet hostname, avoiding competing port bindings.
export AGENTATION_CORS_ORIGINS="${AGENTATION_CORS_ORIGINS:-http://localhost:5173,http://100.87.48.41:5173,http://srv-soporte.taila71364.ts.net:5173}"
exec npx -y agentation-mcp server --host 0.0.0.0
