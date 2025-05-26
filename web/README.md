# KYCnot.me website

[KYCnot.me](https://kycnot.me)

## Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                                              |
| :------------------------ | :------------------------------------------------------------------ |
| `nvm install`             | Installs and uses the correct version of node                       |
| `npm install`             | Installs dependencies                                               |
| `npm run dev`             | Starts local dev server at `localhost:4321`                         |
| `npm run build`           | Build your production site to `./dist/`                             |
| `npm run preview`         | Preview your build locally, before deploying                        |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check`                    |
| `npm run astro -- --help` | Get help using the Astro CLI                                        |
| `npm run db-admin`        | Runs Prisma Studio (database admin)                                 |
| `npm run db-gen`          | Generates the Prisma client without running migrations              |
| `npm run db-push`         | Updates the database schema with latest changes (development mode). |
| `npm run db-seed`         | Seeds the database with fake data (development mode)                |
| `npm run format`          | Formats the code with Prettier                                      |
| `npm run lint`            | Lints the code with ESLint                                          |
| `npm run lint-fix`        | Lints the code with ESLint and fixes the issues                     |

> **Note**: `db-seed` support the `-- --services=n` flag, where n is the number of fake services to add. It defaults to 10. For example, `npm run db-seed -- --services=5` will add 5 fake services.

> **Note**: `db-seed` create default users with tokens: `admin`, `moderator`, `verified`, `normal` (override with `DEV_*****_USER_SECRET_TOKEN` env vars)
