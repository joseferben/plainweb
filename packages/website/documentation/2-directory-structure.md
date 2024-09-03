# Directory Structure

Running `npx create-plainweb` will create a starter project with the following structure:

```bash
├── Dockerfile
├── app
│   ├── cli
│   ├── components
│   ├── config
│   ├── root.tsx
│   ├── routes
│   ├── schema.ts
│   ├── services
│   └── styles.css
├── fly.toml
├── migrations
├── package.json
├── plainweb.config.ts
├── public
│   └── output.css
├── tailwind.config.ts
└── tsconfig.json
```

## `app`

This directory contains the main application code and everything that doesn't need to be in the root.

### `cli`

One-off scripts that are aliased in `package.json`. This provides a low-overhead, simple convention for adding CLI entry points such as `pnpm db:gen`, `pnpm run start`, or `pnpm run dev`.

### `components`

Contains React-like components used in the application. While plainweb doesn't use React directly, it employs type-safe `.tsx` components that behave like server-side rendered React components.

### `config`

Houses configuration files, such as database connection strings and mailer settings.

### `env.ts`

Manages type-safe environment variables using zod and dotenv.

### `root.tsx`

The root layout used for all pages. It's a simple wrapper around the `<html>` tag where you can add global styles and scripts.

### `routes`

plainweb uses file-based routing with a convention similar to Next.js Pages Router. Routes are defined in `.tsx` files and are converted to express routes at startup.

### `schema.ts`

Type-safe drizzle database schema definitions.

### `services`

This directory is for your business logic. Often called `features` or `utils` in other frameworks, feel free to rename it as you see fit.

### `styles.css`

The input file for Tailwind CSS.

### `tasks`

Defines background tasks that are stored in the simple SQLite-based task queue.

## `migrations`

Running `pnpm db:gen` creates new migration files in this directory. Use `pnpm db:apply` to apply all migrations stored here.

## `plainweb.config.ts`

Contains the central plainweb configuration for the project.

```typescript
import { env } from "app/config/env";
import middleware from "app/config/middleware";
import * as schema from "app/schema";
import { defineConfig } from "plainstack";

export default defineConfig({
  nodeEnv: env.NODE_ENV,
  http: {
    port: env.PORT ?? 3000,
    redirects: {
      "/docs/environmet-variables": "/docs/environment-variables",
      "/docs": "/docs/getting-started",
    },
    staticPath: "/public",
    middleware,
  },
  database: {
    dbUrl: env.DB_URL ?? "db.sqlite3",
    schema: schema,
    pragma: {
      journal_mode: "WAL",
    },
  },
  mail: {
    default: {
      host: env.SMTP_HOST,
      port: 587,
      secure: false,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    },
  },
});
```

## `public`

Stores static files that are served directly by the server.

## Other Files

- `Dockerfile`: Used for containerizing the application.
- `fly.toml`: Configuration file for deployment on Fly.io.
- `package.json`: Defines project dependencies and scripts.
- `tailwind.config.ts`: Configuration file for Tailwind CSS.
- `tsconfig.json`: TypeScript compiler options and project settings.