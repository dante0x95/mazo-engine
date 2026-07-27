# template-node

Este repositorio es un **GitHub Template**. Pulsa **"Use this template"** para crear un proyecto nuevo con toda la infraestructura ya montada: TypeScript estricto, ESLint como formateador único, validación de entorno, git hooks, releases automáticas y CI.

![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![CI](https://github.com/dante0x95/template-node/actions/workflows/ci.yml/badge.svg)

---

## Qué incluye

| Pieza | Herramienta | Rol |
|---|---|---|
| Runtime | **Node 24+**, ESM (`"type": "module"`) | `--env-file` nativo, sin dotenv |
| Versión de Node | **`.node-version`** (fuente única) | La leen el version manager local y el CI |
| Lenguaje | **TypeScript estricto**, `module: NodeNext` | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` |
| Dev runner | **`tsx watch`** | Ejecuta sin compilar; producción corre `dist/` |
| Lint + Format | **ESLint flat config** (typescript-eslint typeChecked + @stylistic + perfectionist + unicorn) | ESLint formatea todo. **Sin Prettier** |
| Git hooks | **Husky** + lint-staged + commitlint | Commit barato, push tolerante, CI exhaustivo |
| Commits | **Conventional Commits** | Base para versionado y changelog |
| Releases | **commit-and-tag-version** | Deduce la versión de los commits |
| Validación de entorno | **Zod v4** | Valida `process.env` al arranque, falla rápido |
| Testing | **Vitest** | `vitest run` en CI, watch en dev |
| Logs | **pino** (+ pino-pretty en dev) | JSON a stdout, 12-factor |
| CI | **GitHub Actions** | Un job: typecheck → lint → test → build |
| Deps automáticas | **Dependabot** | Minors/patches agrupados, majors sueltos |

---

## Requisitos

- **Node 24.** La versión exacta vive en `.node-version`. Con un version manager (`fnm`, `nvm`, `volta`) basta con entrar a la carpeta para que use la correcta.

```bash
node --version   # debe empezar por v24
```

---

## Cómo usar este template

Pulsa **"Use this template" → "Create a new repository"** en GitHub (deja el default: solo la rama `main`). Clona tu nuevo repo y sigue **3 pasos**:

### 1. Instalar dependencias

```bash
npm install
```

Esto instala todo **y activa los git hooks** automáticamente (el script `prepare` corre `husky`). A partir de aquí tus commits y pushes ya pasan por las validaciones.

### 2. Renombrar el proyecto

Edita `package.json` y ajusta al menos:

```jsonc
{
  "name": "mi-proyecto",       // el nombre real
  "version": "0.1.0",          // arranca en 0.1.0 (SemVer: 0.x = en desarrollo)
  "description": "...",
  "repository": { "url": "..." } // apunta a tu repo nuevo
}
```

Aprovecha para actualizar el título y los badges de este README.

### 3. Crear tu archivo `.env`

```bash
cp .env.example .env
```

Rellena los valores (por ejemplo `DATABASE_URL`). El `.env` **nunca** se commitea; `.env.example` es la plantilla versionada con las claves esperadas.


Listo. Arranca en modo desarrollo:

```bash
npm run dev
```

---

## Scripts disponibles

| Script | Comando | Para qué |
|---|---|---|
| `npm run dev` | `tsx watch --env-file=.env src/index.ts` | Desarrollo con recarga, sin compilar |
| `npm run build` | `tsc` | Compila TypeScript a `dist/` |
| `npm start` | `node --env-file=.env dist/index.js` | Ejecuta el build de producción |
| `npm run typecheck` | `tsc --noEmit` | Solo verifica tipos |
| `npm run lint` | `eslint src` | Reporta problemas de lint/formato (añade `--fix` para arreglar) |
| `npm test` | `vitest run` | Corre los tests una vez (usado en CI) |
| `npm run test:watch` | `vitest` | Tests en modo watch |
| `npm run test:coverage` | `vitest run --coverage` | Tests con reporte de cobertura |
| `npm run release` | `commit-and-tag-version` | Bump de versión + tag + changelog |

> El entorno se carga con `--env-file=.env` (nativo de Node), no con dotenv.

---

## Estructura del proyecto

```
.
├── .github/
│   ├── dependabot.yml          # actualizaciones automáticas de deps
│   └── workflows/ci.yml        # pipeline de CI
├── .husky/                     # pre-commit, commit-msg, pre-push
├── .vscode/settings.json       # formatOnSave off + fixAll de ESLint
├── scripts/
│   └── check-env.js            # compara claves .env vs .env.example
├── src/
│   ├── config/
│   │   ├── env.schema.ts       # solo definición del schema (puro, testeable)
│   │   ├── env.schema.test.ts  # tests del schema
│   │   └── env.ts              # valida process.env y exporta `env`
│   ├── lib/logger.ts           # instancia de pino
│   └── index.ts                # punto de entrada
├── .env.example                # plantilla de variables (versionada)
├── .node-version               # versión de Node (fuente única)
├── commitlint.config.js
├── eslint.config.js
├── tsconfig.json
├── vitest.config.mts
└── package.json
```

---

## Cómo funciona cada pieza

### Validación de entorno

`src/config/env.schema.ts` define un schema de Zod; `src/config/env.ts` lo ejecuta contra `process.env` al arranque. Si algo falta o es inválido, imprime un error legible y hace `process.exit(1)` — **falla rápido**, antes de que la app arranque a medias.

La definición y la ejecución están separadas a propósito: el schema es un módulo puro y testeable, sin efectos secundarios al importarlo. Regla del proyecto: **los módulos que definen no ejecutan.**

Variables actuales: `NODE_ENV`, `PORT`, `DATABASE_URL`, `LOG_LEVEL`.

### Git hooks (Husky)

La filosofía es **coste creciente**: cuanto más tarde la validación, más completa.

| Hook | Corre | Coste objetivo |
|---|---|---|
| `pre-commit` | lint-staged (`eslint --fix` solo en archivos staged) + check de `.env` | segundos |
| `commit-msg` | commitlint (formato del mensaje) | instantáneo |
| `pre-push` | typecheck + tests | 1–2 min tolerables |
| **CI** | typecheck + lint + test + build (todo, en limpio) | lo que haga falta |

Así el commit no molesta en el día a día y el trabajo pesado se reparte hacia el push y el CI.

### Commits convencionales

Los mensajes siguen [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `ci:`…), validados por commitlint. De ahí salen el versionado y el changelog automáticos.

### Releases

```bash
npm run release
```

`commit-and-tag-version` lee los commits desde el último tag, deduce el bump de versión (SemVer), actualiza `package.json`, genera changelog y crea el tag. Luego:

```bash
git push --follow-tags
```

> Los commits `ci:`, `chore:` y `docs:` no disparan bump de versión. Cuando el proyecto tenga equipo, conviene migrar a **release-please** y proteger `main` con PRs.

### CI (GitHub Actions)

`.github/workflows/ci.yml` corre en push y PR a `main`, en un solo job sobre `ubuntu-latest`. Los pasos van en **orden fail-fast por coste**:

```
checkout → setup-node (.node-version, cache npm) → npm ci → typecheck → lint → test → build
```

Usa `npm ci` (determinista, respeta el lockfile) y `concurrency` con `cancel-in-progress` para que un push nuevo cancele el run anterior. No necesita `.env`: los tests del schema son puros y el build no ejecuta `env.ts`.

### Dependabot

Semanal. Agrupa **minors y patches** en un solo PR; los **majors** llegan sueltos para revisarse uno a uno (suelen traer breaking changes). También vigila las versiones de las GitHub Actions del CI.

### Lint y formato

ESLint es el **único** formateador — no hay Prettier. La config (`eslint.config.js`, flat config) combina typescript-eslint con chequeo de tipos, `@stylistic` (formato), `perfectionist` (orden de imports) y una selección de reglas de `unicorn`. En VS Code, `formatOnSave` está desactivado y el guardado dispara `source.fixAll.eslint`.

### Logs

`src/lib/logger.ts` exporta una instancia de **pino** que escribe JSON a stdout (compatible con 12-factor). En desarrollo se embellece con `pino-pretty`. Sin capa de abstracción extra: se usa pino directamente a propósito (YAGNI).

---

## Mantener el template vivo

Los templates envejecen. Este intenta mantenerse solo:

- **`.node-version`** centraliza la versión de Node en un único lugar.
- **Dependabot** propone actualizaciones cada semana; tú solo revisas y apruebas.
- **El CI** garantiza que nada se rompa en silencio.

Cuando arregles algo en un proyecto derivado que también aplique aquí, **portéalo de vuelta** a este template para que el próximo proyecto ya nazca con el fix.

---

## Licencia

[MIT](LICENSE).
