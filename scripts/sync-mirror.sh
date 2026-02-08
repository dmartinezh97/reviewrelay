#!/usr/bin/env bash
# Sincroniza el repo de Gitea (evidevs/herma) → GitHub (dmartinezh97/herma)
# Uso: ./scripts/sync-mirror.sh [branch]
#   Sin argumentos: sincroniza todas las ramas y tags
#   Con argumento:  sincroniza solo la rama especificada
#
# Lee GITEA_TOKEN y GITHUB_TOKEN del .env automáticamente.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

# Cargar tokens del .env si no están ya en el entorno
if [ -f "$ENV_FILE" ]; then
  GITEA_TOKEN="${GITEA_TOKEN:-$(grep '^GITEA_TOKEN=' "$ENV_FILE" | cut -d= -f2-)}"
  GITHUB_TOKEN="${GITHUB_TOKEN:-$(grep '^GITHUB_TOKEN=' "$ENV_FILE" | cut -d= -f2-)}"
fi

if [ -z "${GITEA_TOKEN:-}" ] || [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "Error: GITEA_TOKEN y GITHUB_TOKEN son necesarios. Configúralos en .env" >&2
  exit 1
fi

GITEA_REPO="https://${GITEA_TOKEN}@code.evicertia.net/evidevs/herma.git"
GITHUB_REPO="https://github.com/dmartinezh97/herma.git"
CACHE_DIR="${GIT_CACHE_DIR:-/tmp/reviewrelay-mirror}"

if [ ! -d "$CACHE_DIR" ]; then
  echo ">> Clonando bare desde Gitea..."
  git clone --bare "$GITEA_REPO" "$CACHE_DIR"
  cd "$CACHE_DIR"
  git remote add github "$GITHUB_REPO"
else
  cd "$CACHE_DIR"
  # Actualizar URL de Gitea por si el token cambió
  git remote set-url origin "$GITEA_REPO"
  git remote set-url github "$GITHUB_REPO" 2>/dev/null || git remote add github "$GITHUB_REPO"
  echo ">> Fetching desde Gitea..."
  git fetch origin --prune
fi

# Usar gh CLI credential helper para push a GitHub (ya autenticado)
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="credential.https://github.com.helper"
export GIT_CONFIG_VALUE_0="!gh auth git-credential"

if [ -n "${1:-}" ]; then
  echo ">> Pushing rama '$1' a GitHub..."
  git push github "refs/heads/$1:refs/heads/$1" --force
else
  echo ">> Pushing todas las ramas y tags a GitHub..."
  git push github --mirror
fi

echo ">> Sync completado."
