# ReviewRelay (Gitea ⇄ GitHub) — Prompt para Claude Code

## Rol (Claude Code)
Eres **Claude Code** y debes **crear un proyecto completo en Node.js (TypeScript)** que actúe como un puente entre **Gitea** (fuente de verdad) y **GitHub** (satélite de revisión) para:

1) Detectar PRs creadas/actualizadas en Gitea (por webhook).
2) Crear o actualizar una PR “gemela” en GitHub (misma base/head).
3) Recoger la *review* que hace **Copilot Code Review** en GitHub.
4) Publicar esa review de vuelta como comentario/review en la PR original de Gitea.

El proyecto debe poder funcionar con un “perfil” configurable: **MVP** o **V2** (feature flags).  
**Importante:** implementa ambas rutas (MVP y V2) en el mismo codebase y permite elegir por configuración.

---

## Nombre del proyecto
- Repo / package name: `review-relay` (puedes usar este nombre por defecto).
- Servicio: “ReviewRelay”.

---

## Requisitos funcionales

### A) Webhooks entrantes
Implementa un servidor HTTP con 2 endpoints:

1) `POST /webhooks/gitea`
   - Recibe webhooks de Gitea (principalmente PR).
   - Lee cabecera `X-Gitea-Event` y `X-Gitea-Delivery`.
   - Verifica firma HMAC si está configurada (ver “Seguridad”).

2) `POST /webhooks/github`
   - Recibe webhooks de GitHub.
   - Lee cabecera `X-GitHub-Event` y `X-GitHub-Delivery`.
   - Verifica `X-Hub-Signature-256` (ver “Seguridad”).

Además:
- `GET /healthz` devuelve 200 con JSON `{ ok: true, version: "...", profile: "mvp|v2" }`.

### B) Flujo principal: PR Gitea → PR GitHub
Cuando llegue un webhook de Gitea que indique que una PR se abrió o se sincronizó (push a la rama de la PR):

1) Resolver mapeo de repos (`REPO_MAP`) para saber a qué repo de GitHub corresponde ese repo de Gitea.
2) Obtener datos reales de la PR llamando a **Gitea API** (no confíes ciegamente en el payload del webhook):
   - título, descripción, head branch, base branch, etc.
3) Asegurar que existe PR “gemela” en GitHub:
   - Si no existe, crearla.
   - Si existe, no recrear; opcionalmente actualizar título/body si cambia.
4) Guardar el mapping `gitea_pr → github_pr` en la DB.

**Nota sobre ramas/commits**
- **MVP por defecto asume que ya existe la rama en GitHub** porque has configurado **Push Mirror** en Gitea.
- Si la rama no existe en GitHub (al crear la PR gemela), el servicio debe:
  - Registrar error,
  - Y publicar un comentario en la PR de Gitea indicando que falta sincronización de ramas (y que se configure mirror o se active V2 con git-sync).

### C) Flujo secundario: Review Copilot en GitHub → comentario/review en Gitea
Cuando llegue un webhook de GitHub indicando actividad de review en una PR:

1) Usar el mapping para encontrar la PR original en Gitea.
2) Detectar si la review es de Copilot (ver “Detección Copilot”).
3) Recuperar:
   - Review “general” (body)
   - Comentarios inline (si existen)
   usando GitHub API (no confíes sólo en el payload).
4) Publicar en Gitea:
   - **MVP:** un único comentario general (markdown) en la PR.
   - **V2:** intentar crear una “review” con comentarios inline (best-effort) y si falla, caer al comentario general.

---

## Perfiles / Feature flags (MVP vs V2)

### Perfil MVP (objetivo: valor rápido, simple, robusto)
- `PUBLISH_MODE = "comment"` (solo comentario general en Gitea)
- `BRANCH_SYNC_STRATEGY = "mirror"` (no hace git push; asume mirror)
- Idempotencia fuerte para no duplicar comentarios
- Formato del comentario en Gitea: markdown con:
  - Encabezado “Copilot Code Review (GitHub)”
  - Resumen (review.body)
  - Lista de inline notes (si hay) como bullets `path:line`

### Perfil V2 (objetivo: UX mejor)
- `PUBLISH_MODE = "review"` (intenta review + inline comments en Gitea)
- `BRANCH_SYNC_STRATEGY = "git"` opcional (si se activa, sincroniza refs con git)
- Si falla el inline mapping o la API responde error:
  - fallback automático al modo MVP (comentario general)
- Evitar spam: si ya existe comentario “Copilot Code Review”, edítalo/actualízalo si la API lo permite; si no, crea uno nuevo pero con dedupe.

---

## Configuración (env + defaults)

Crea:
- `.env.example`
- Un loader de config con **zod** (o similar) que valide todo al arrancar.

Variables mínimas:

### Server
- `PORT=3000`
- `LOG_LEVEL=info`
- `APP_VERSION` (opcional)

### Perfil
- `BRIDGE_PROFILE=mvp`  # `mvp` o `v2`
- `PUBLISH_MODE=`       # opcional: `comment` o `review` (si no se setea, depende del perfil)
- `BRANCH_SYNC_STRATEGY=` # opcional: `mirror` o `git` (si no se setea, depende del perfil)

### Database
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reviewrelay`
  - Usa Prisma.
  - Incluye `docker-compose.yml` con Postgres.

### Gitea
- `GITEA_BASE_URL=https://gitea.tu-dominio.local`
- `GITEA_TOKEN=...`
- `GITEA_WEBHOOK_SECRET=...`  # para verificar `X-Gitea-Signature` (si se usa)
- `GITEA_WEBHOOK_AUTH_HEADER=` # opcional: si configuras “Authorization header” en Gitea, valida que coincida exactamente

### GitHub
- `GITHUB_TOKEN=...`
- `GITHUB_WEBHOOK_SECRET=...`

### Repos mapping (multi-repo)
- `REPO_MAP=[{"gitea":"org1/repo1","github":"org2/repo1-mirror"},{"gitea":"org1/repo2","github":"org2/repo2"}]`
  - Parsear como JSON.
  - Si no hay match, log y responde 202 (no error).

### Detección Copilot
- `COPILOT_REVIEWER_LOGINS=github-copilot[bot],copilot`
  - Lista separada por comas; configurable para evitar hardcode.
  - El bridge considera “review Copilot” si `review.user.login` está en esa lista **o** si el texto del review contiene un marcador típico (best-effort).

### Git sync (sólo si `BRANCH_SYNC_STRATEGY=git`)
- `GIT_CACHE_DIR=/var/lib/reviewrelay/git-cache`
- `GITEA_GIT_URL_TEMPLATE=https://{token}@gitea.tu-dominio.local/{owner}/{repo}.git`
- `GITHUB_GIT_URL_TEMPLATE=https://{token}@github.com/{owner}/{repo}.git`
- `GITEA_GIT_TOKEN=` (puede ser el mismo que `GITEA_TOKEN` si aplica)
- `GITHUB_GIT_TOKEN=` (puede ser el mismo que `GITHUB_TOKEN` si aplica)

**Importante de seguridad:** nunca loguees URLs con tokens. Redacta credenciales en logs.

---

## Seguridad

### Verificación de firma (GitHub)
- Si `GITHUB_WEBHOOK_SECRET` existe, verificar `X-Hub-Signature-256`.
- Implementa comparación en tiempo constante.

### Verificación de firma (Gitea)
- Si `GITEA_WEBHOOK_SECRET` existe, verificar `X-Gitea-Signature`.
- Acepta ambos formatos por compatibilidad:
  - `hex` a secas
  - o `sha256=<hex>`
- Implementa comparación en tiempo constante.

### Authorization header (Gitea opcional)
- Si `GITEA_WEBHOOK_AUTH_HEADER` existe, exigir que `Authorization` sea exactamente ese valor.

---

## Idempotencia y dedupe (CRÍTICO)

Webhooks pueden reintentarse o llegar duplicados.

1) Tabla `webhook_deliveries`:
   - `source` = `gitea|github`
   - `delivery_id` = `X-Gitea-Delivery` o `X-GitHub-Delivery`
   - unique `(source, delivery_id)`
   - Si ya existe, responder 200/202 y no reprocesar.

2) Tabla `pr_map`:
   - unique `(gitea_repo, gitea_pr_number)`

3) Tabla `processed_reviews`:
   - unique por `(github_repo, github_pr_number, github_review_id)`  
   - Para evitar repostear la misma review.

---

## Persistencia (Prisma)

Usa Prisma con Postgres.

Modelos sugeridos (ajusta si quieres, pero mantén funcionalidad):

- `WebhookDelivery`
- `PrMap`
- `ProcessedReview`

---

## APIs a usar (alto nivel)

### Gitea API (mínimo)
- Obtener PR por número (para extraer head/base/title/body).
- Crear comentario en la PR (como issue comment).
- (V2) Crear una review en PR con `comments[]` (inline) **best-effort**.

### GitHub API (mínimo)
- Crear PR.
- Obtener PR.
- Listar reviews de PR.
- Obtener una review concreta y sus comentarios (review comments) si aplica.

---

## Formato del comentario (MVP)

Publica un comentario Markdown en la PR de Gitea parecido a:

- Título: `## 🤖 Copilot Code Review (GitHub)`
- Luego:
  - `**GitHub PR:** owner/repo#123`
  - `**Review ID:** 456`
  - `### Resumen`
  - bloque de texto del body de la review
  - `### Comentarios inline`
    - `- path/to/file.ts:123 — <comentario>`

Incluye un separador y un “footer” con:
- `Generated by ReviewRelay`
- timestamp ISO

---

## V2: Inline comments (best-effort)

Objetivo:
- Si GitHub review tiene comentarios inline, intenta crear review en Gitea con `comments[]`:
  - `path`
  - `body`
  - `new_position`/`old_position` derivado de `side` y `line`

Reglas:
- Si el mapping falla o la API devuelve error, fallback automático al comentario general (MVP).

---

## Stack y decisiones técnicas

### Lenguaje
- Node.js 20+
- TypeScript (strict)

### Framework
- Fastify
- Plugin para obtener raw body (necesario para firmas)
- Logger pino

### HTTP clients
- GitHub: Octokit
- Gitea: `fetch` nativo (Node) con wrapper propio

### Calidad
- eslint + prettier
- tests con vitest (mínimo: firma HMAC + parsing config + dedupe delivery)

---

## Estructura de carpetas (sugerida)

Crea algo así:

- `src/`
  - `index.ts`
  - `server.ts`
  - `config/`
    - `env.ts` (zod schema + loader)
  - `db/`
    - `prisma.ts`
  - `integrations/`
    - `github/`
      - `octokit.ts`
      - `githubApi.ts`
    - `gitea/`
      - `giteaApi.ts`
  - `webhooks/`
    - `giteaWebhook.ts`
    - `githubWebhook.ts`
    - `verifyHmac.ts`
  - `services/`
    - `prMirrorService.ts`
    - `reviewIngestService.ts`
    - `reviewPublishService.ts`
    - `gitSyncService.ts` (sólo V2 / estrategia git)
  - `utils/`
    - `redact.ts`
    - `sleep.ts` (si necesitas)
- `prisma/schema.prisma`
- `docker-compose.yml`
- `.env.example`
- `README.md`

---

## Reglas de implementación (importantes)
- Responde rápido a webhooks (200/202) y procesa con cuidado:
  - Puedes procesar en “background” dentro del mismo proceso Node (sin colas externas) pero evitando bloquear demasiado.
- Maneja rate limits y errores transitorios con reintentos simples (p.ej. 3 intentos con backoff).
- Nunca publiques secretos en logs.
- Mantén el código modular y testeable.

---

## README (en español)
Incluye:
1) Qué hace ReviewRelay y limitaciones
2) Setup paso a paso:
   - Variables env
   - Postgres con docker-compose
   - Configurar webhooks en Gitea y GitHub
   - Nota: para que Copilot haga review automáticamente, el repo de GitHub debe tener reglas/rulesets configuradas para solicitar Copilot code review automáticamente.
3) Cómo elegir perfil:
   - `BRIDGE_PROFILE=mvp|v2`
4) Troubleshooting:
   - “La rama no existe en GitHub”
   - “Firma inválida”
   - “No llegan reviews de Copilot”

---

## Criterios de aceptación (lo mínimo para considerar DONE)

1) Arranca con `npm i && npm run dev` y expone `/healthz`.
2) Con un webhook de PR de Gitea (opened/sync):
   - crea PR en GitHub (si repo mapping existe)
   - guarda mapping en DB
3) Con un webhook de review en GitHub:
   - detecta que es Copilot (si `user.login` coincide con config)
   - publica comentario en PR de Gitea
   - dedupe por `github_review_id`
4) `BRIDGE_PROFILE` cambia el comportamiento:
   - MVP → comentario general
   - V2 → intenta review inline y hace fallback si falla

---

## Entregables
Genera todos los archivos del proyecto, listos para commit, incluyendo:
- Código fuente completo
- Prisma schema + migración inicial
- docker-compose
- scripts npm
- tests básicos
- README

Fin.
