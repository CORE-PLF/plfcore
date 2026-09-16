# syntax=docker/dockerfile:1
# RESYNC WEB — a MESMA imagem serve o site (npm start) e o worker
# (custom start command no Coolify: npm run worker).

# ===== deps: npm ci COMPLETO =====
# devDependencies ficam de propósito: tsx roda o worker e os scripts
# (admin:create, seed) e o prisma CLI roda o migrate deploy no release.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts pula o postinstall (prisma generate) — o schema ainda não
# está no contexto; a geração acontece explicitamente no stage de build.
# --include=dev é obrigatório, não enfeite: o Coolify injeta as variáveis da
# aplicação no build, e com NODE_ENV=production o npm ci pula devDependencies.
# Sem isso o next build morre em '@tailwindcss/postcss' — que é devDependency.
RUN npm ci --include=dev --ignore-scripts

# ===== build: prisma generate + next build =====
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# src/lib/env.ts valida no boot e o next build importa esses módulos.
# Placeholders de build — óbvios de propósito, nunca chegam ao runtime
# (as variáveis reais do Coolify sobrescrevem tudo).
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="mysql://build:build@localhost:3306/build" \
    AUTH_SECRET="build-placeholder-16ch" \
    ENCRYPTION_KEY="build-placeholder-32-chars-00000" \
    PAYMENT_WEBHOOK_SECRET="build-placeholder"
RUN npx prisma generate \
  && npm run build \
  && rm -rf .next/cache

# ===== runner =====
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    PROCESS=start \
    INSTALLERS_DIR=/data/installers
# su-exec: o volume do instalador é montado em runtime pertencendo ao root —
# só dá para ajustar o dono na largada, e aí sim descer para o usuário node.
RUN apk add --no-cache su-exec
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json next.config.ts tsconfig.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node public ./public
# scripts/ vai junto: admin:create e register-discord-commands rodam no container
COPY --chown=node:node scripts ./scripts
# src do contexto NÃO inclui src/generated (.dockerignore) — o client gerado
# vem do stage de build, logo abaixo.
COPY --chown=node:node src ./src
COPY --from=build --chown=node:node /app/src/generated ./src/generated
COPY --from=build --chown=node:node /app/.next ./.next
EXPOSE 3000
# alpine traz wget (busybox), não curl — mesmo efeito no /api/health.
# O worker não serve HTTP: nele o healthcheck passa direto.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD sh -c '[ "$PROCESS" != start ] || wget -qO- "http://127.0.0.1:${PORT}/api/health"' || exit 1
# PROCESS=worker sobe a fila na MESMA imagem — o Coolify não sobrescreve o CMD
# de imagens com Dockerfile, então o processo é escolhido por variável.
# O processo em si NUNCA roda como root: su-exec troca para node no exec final.
CMD ["sh", "-c", "mkdir -p \"$INSTALLERS_DIR\" && chown node:node \"$INSTALLERS_DIR\" && exec su-exec node npm run $PROCESS"]
