# .platform Hooks

This directory contains deployment hooks that are executed during the deployment process. The structure follows AWS Elastic Beanstalk's `.platform` hooks pattern, although we are not using AWS we think it is a good practice to use this standard.

## Directory Structure

```
.platform/
├── hooks/
│   ├── predeploy/     # Scripts executed before staging deployment
│   └── postdeploy/    # Scripts executed after successful production deployment
```

## Hook Execution

- Scripts in each hook directory are executed in alphabetical order
- If any hook fails (returns non-zero), the deployment process is aborted
- Hook failures are reported through the notification system

## Available Hooks

### Predeploy Hooks

Located in `.platform/hooks/predeploy/`

- Executed before the staging deployment starts
- Use for tasks like:
  - Environment validation
  - Resource preparation
  - Database migrations
  - Asset compilation

### Postdeploy Hooks

Located in `.platform/hooks/postdeploy/`

- Executed after successful production deployment
- Use for tasks like:
  - Cache warming
  - Service notifications
  - Cleanup operations
  - Import triggers (current implementation)

## Example Hook

```bash
#!/bin/bash
# .platform/hooks/postdeploy/01_import_triggers.sh

cd ../../../
just import-triggers
```

## Environment

Hooks have access to all environment variables available to the deployment script, including:

- `HOOK_PUSHER`
- `HOOK_MESSAGE`
- `GITEA_USERNAME`
- `GITEA_TOKEN`
- `GITEA_SERVER`
- `GITEA_REPO_USERNAME`
- `GITEA_REPO_NAME`
