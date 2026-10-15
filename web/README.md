# KYCnot.me website

[KYCnot.me](https://kycnot.me)

## Commands

Run these commands from `web/`:

| Command                   | Action                                                              |
| :------------------------ | :------------------------------------------------------------------ |
| `nvm install`             | Installs and uses the correct version of node                       |
| `npm install`             | Installs dependencies                                               |
| `npm run patch-deps`      | Applies the fixes in `patches/` to dependencies, after each install |
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

## Local development with existing data

`just dev-database` starts PostgreSQL and Redis. It does not apply migrations, and `npm run dev` does not apply them either. After pulling database changes, stop the dev server, back up your database, and run these commands from the project root:

```sh
cd web
npx prisma migrate deploy
npm run db-gen
cd ..
just import-triggers
cd web
npm run dev
```

This applies existing migrations without resetting the database. A missing column such as `Comment.kind` means the database still needs a migration. Restart the dev server after generating the Prisma client.

The swap backend is separate from PostgreSQL. If it is not running, `listSupportedProviders` can log a connection error on port 50051. Comments do not depend on that backend.

## User experiences rollout

The migration keeps old post IDs, replies, text, dates, ratings and moderation decisions. Public stars and averages are retired. Private order references move into evidence records; imported checks have no invented check date. The service comments summary job is retired.

1. Back up PostgreSQL and the uploads directory. Pause the old web app and worker so old code cannot write legacy proof fields during migration.
2. Build both updated images. Apply `prisma migrate deploy`, import the SQL files in `prisma/triggers/`, then start the updated web app and worker together. Generate the Prisma client during the web build.
3. Check `/admin/comments` and its edits/evidence queues. Confirm a pending post is private, evidence is visible only to its author and comment moderators, and an author receives a moderation notification.
4. Keep the server-init process running. It retries queued evidence file deletions every minute. The database removes access and clears raw evidence immediately on deletion.
5. Optionally classify older unrated posts with `uv run -m pyworker classify-experiences --limit 100 --after-id 0` from `pyworker/`. This sends only public text to AI. It does not change publication status, dates, karma or notifications. Resume using the last ID printed in the log. Unclear posts stay unclassified.

For a migration test, create an empty disposable local database whose name ends in `_legacy`, set `EXPERIENCE_TEST_DATABASE_URL`, then run `node --import tsx scripts/test-experience-migration.ts` from `web/`. It replays the historical schema and tests preservation, privacy, notifications and deletion against sample reviews. It refuses a non-local or nonempty database.

Run `npm run db-drift` with a separate disposable shadow database. Never point its shadow URL at the primary database. Rollback requires restoring the backup and old application together; running the old app against the migrated schema would lose access to migrated evidence.
