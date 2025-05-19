# KYCnot.me

[KYCnot.me](https://kycnot.me)

## Development

### Installations

Install the following tools:

- [nvm](https://github.com/nvm-sh/nvm) (or [node](https://nodejs.org/en/download/))
- [docker](https://docs.docker.com/get-docker/)
- [just](https://just.systems)

### Initialization

Run this the first time you setup the project:

```zsh
# you can alternatively use `just dev-database`
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait database redis
cd web
nvm install
npm i
cp -n .env.example .env
npm run db-push
npm run db-fill-clean
```

Now open the [.env](web/.env) file and fill in the missing values.

> Default users are created with tokens: `admin`, `verifier`, `verified`, `normal` (configurable via env vars)

### Running the project

In separate terminals, run the following commands:

- Database

  ```zsh
  # you can alternatively use `just dev-database`
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait database redis
  ```

- Website <http://localhost:4321>

  ```zsh
  cd web
  nvm use
  npm run dev
  ```

- Database Admin (Optional) <http://localhost:5555>

  ```zsh
  cd web
  nvm use
  npm run db-admin
  ```

> [!TIP]
> VS Code will run the project in development mode automatically when you open the project.
