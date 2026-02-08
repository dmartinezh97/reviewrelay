# ReviewRelay

Servicio puente entre **Gitea** y **GitHub** que permite aprovechar **Copilot Code Review** en repositorios alojados en Gitea.

## Qué hace

1. Detecta PRs creadas/actualizadas en Gitea (vía webhook).
2. Crea una PR espejo en GitHub para que Copilot Code Review la analice.
3. Recoge la review de Copilot en GitHub (vía webhook).
4. Publica la review de vuelta como comentario o review inline en la PR original de Gitea.

### Limitaciones

- **MVP:** Asume que las ramas ya existen en GitHub (requiere Push Mirror configurado en Gitea).
- Las reviews se procesan de forma asíncrona dentro del mismo proceso (sin colas externas).
- Solo procesa reviews de los logins configurados en `COPILOT_REVIEWER_LOGINS`.

## Setup

### 1. Requisitos

- Node.js >= 20
- PostgreSQL 16
- Docker (opcional, para PostgreSQL)

### 2. Instalar dependencias

```bash
npm install
```

### 3. Base de datos

```bash
docker compose up -d
cp .env.example .env
# Edita .env con tus valores
npx prisma migrate dev --name init
```

### 4. Variables de entorno

Copia `.env.example` a `.env` y configura:

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto del servidor (default: 3000) |
| `LOG_LEVEL` | Nivel de logs: fatal, error, warn, info, debug, trace |
| `BRIDGE_PROFILE` | `mvp` o `v2` |
| `DATABASE_URL` | URL de conexión a PostgreSQL |
| `GITEA_BASE_URL` | URL base de tu instancia Gitea |
| `GITEA_TOKEN` | Token de API de Gitea |
| `GITEA_WEBHOOK_SECRET` | Secret para verificar webhooks de Gitea |
| `GITHUB_TOKEN` | Token de GitHub con permisos de repo |
| `GITHUB_WEBHOOK_SECRET` | Secret para verificar webhooks de GitHub |
| `REPO_MAP` | JSON array de mapeo de repos (ver ejemplo abajo) |
| `COPILOT_REVIEWER_LOGINS` | Logins de Copilot separados por coma |

**Ejemplo REPO_MAP:**
```json
[{"gitea":"mi-org/mi-repo","github":"mi-org-gh/mi-repo-mirror"}]
```

### 5. Configurar webhooks

**En Gitea** (Settings > Webhooks > Add Webhook > Gitea):
- URL destino: `http://localhost:3000/webhooks/gitea` (o tu URL pública)
- Método: POST
- Content Type: `application/json`
- Secreto: el valor de `GITEA_WEBHOOK_SECRET`
- Eventos: seleccionar "Eventos personalizados" y marcar **Pull Request** + **Pull Request sincronizado**

**En GitHub** (Repo > Settings > Webhooks > Add webhook):
- Payload URL: tu URL pública (ver sección Smee.io para desarrollo local)
- Content Type: `application/json`
- Secret: el valor de `GITHUB_WEBHOOK_SECRET`
- Eventos: seleccionar "Let me select individual events" y marcar **Pull request reviews** (desmarcar Pushes)

**Nota importante:** Para que Copilot haga review automáticamente, el repo de GitHub debe tener rulesets configurados para solicitar Copilot Code Review en cada PR.

### 5.1 Desarrollo local con Smee.io

GitHub no puede enviar webhooks a `localhost`. Para desarrollo local, usa [Smee.io](https://smee.io) como proxy:

1. Ve a https://smee.io/new para crear un canal (o usa uno existente)
2. Configura el webhook de GitHub con la URL de Smee.io como Payload URL
3. Instala y ejecuta el cliente:

```bash
npm install --global smee-client
smee -u https://smee.io/TU_CANAL --target http://localhost:3000/webhooks/github
```

Esto reenviará los webhooks de GitHub a tu servidor local. Mantén el proceso corriendo mientras desarrollas.

### 5.2 Token de GitHub (Fine-grained)

Crea un Fine-grained Personal Access Token en GitHub > Settings > Developer settings > Personal access tokens:

- **Repository access:** Only select repositories (selecciona el repo mirror)
- **Permisos necesarios:**
  - Contents: Read-only
  - Metadata: Read-only (requerido automáticamente)
  - Pull requests: **Read and write**

Copia el token generado (`github_pat_...`) en `GITHUB_TOKEN` del `.env`.

### 6. Ejecutar

```bash
# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

### 7. Verificar

```bash
curl http://localhost:3000/healthz
# {"ok":true,"version":"0.1.0","profile":"mvp"}
```

## Perfiles

### MVP (`BRIDGE_PROFILE=mvp`)

- Publica reviews como comentarios markdown en la PR de Gitea.
- Asume Push Mirror configurado (no sincroniza ramas).
- Robusto y simple.

### V2 (`BRIDGE_PROFILE=v2`)

- Intenta crear reviews con comentarios inline en Gitea.
- Si falla, hace fallback automático al modo MVP (comentario general).
- Opcionalmente sincroniza ramas vía git (`BRANCH_SYNC_STRATEGY=git`).

## Troubleshooting

### "La rama no existe en GitHub"

Si usas el perfil MVP, necesitas configurar **Push Mirror** en Gitea para que las ramas se sincronicen automáticamente. ReviewRelay publicará un comentario en la PR de Gitea indicando el problema.

Alternativamente, usa el perfil V2 con `BRANCH_SYNC_STRATEGY=git` y configura las variables `GIT_*`.

### "Firma inválida" (401)

- Verifica que `GITEA_WEBHOOK_SECRET` y `GITHUB_WEBHOOK_SECRET` coincidan exactamente con los configurados en los webhooks.
- Gitea soporta tanto formato `hex` como `sha256=hex`.

### "No llegan reviews de Copilot"

1. Verifica que el repo de GitHub tenga rulesets que soliciten Copilot Code Review.
2. Verifica que `COPILOT_REVIEWER_LOGINS` incluya el login correcto (por defecto: `github-copilot[bot]`).
3. Revisa los logs del servicio para ver si el webhook de GitHub está llegando correctamente.

## Tests

```bash
npm test
```

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Desarrollo con hot reload |
| `npm run build` | Compilar TypeScript |
| `npm start` | Ejecutar en producción |
| `npm test` | Ejecutar tests |
| `npm run lint` | Lint |
| `npm run format` | Formatear código |
