# KYC Not Worker

A Python worker for processing and analyzing data for the KYC Not project.

## Features

- TOS (Terms of Service) text retrieval and analysis
- User sentiment analysis from comments
- Comment moderation
- Service score recalculation
- Database trigger maintenance
- Scheduled task execution
- Database operations for services and comments

## Installation

1. Clone the repository
2. Sync dependencies with [uv](https://docs.astral.sh/uv/):

   ```bash
   uv sync
   ```

## Configuration

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

Required environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `OPENAI_API_KEY`: OpenAI API key for AI tasks
- `CRON_TOSREVIEW_TASK`: Cron expression for TOS review task
- `CRON_SENTIMENT_TASK`: Cron expression for user sentiment analysis task
- `CRON_MODERATION_TASK`: Cron expression for comment moderation task
- `CRON_FORCE_TRIGGERS_TASK`: Cron expression for force triggers task
- `CRON_SERVICE_SCORE_RECALC_TASK`: Cron expression for service score recalculation task
- `CRON_INACTIVE_USERS_TASK`: Cron expression for inactive users cleanup task

## Usage

### Command Line Interface

Run tasks directly:

```bash
# Run TOS review task
uv run -m pyworker tos [--service-id ID]

# Run user sentiment analysis task
uv run -m pyworker sentiment [--service-id ID]

# Run comment moderation task
uv run -m pyworker moderation [--service-id ID]

# Run force triggers task
uv run -m pyworker force-triggers

# Run service score recalculation task
uv run -m pyworker service-score-recalc [--service-id ID]

# Run inactive users cleanup task
uv run -m pyworker inactive-users
```

### Worker Mode

Run in worker mode to execute tasks on a schedule:

```bash
uv run -m pyworker --worker
```

Tasks will run according to their configured cron schedules.

## Tasks

### TOS Review Task

- Retrieves and analyzes Terms of Service documents
- Updates service records with TOS information
- Scheduled via `CRON_TOSREVIEW_TASK`

### User Sentiment Task

- Analyzes user comments to determine overall sentiment
- Updates service records with sentiment analysis
- Scheduled via `CRON_SENTIMENT_TASK`

### Comment Moderation Task

- Makes a basic first moderation of comments
- Flags comments as needed
- Adds content if needed
- Scheduled via `CRON_MODERATION_TASK`

### Force Triggers Task

- Maintains database triggers by forcing them to run under certain conditions
- Currently handles updating the "isRecentlyApproved" flag for services after 15 days
- Scheduled via `CRON_FORCE-TRIGGERS_TASK`

### Service Score Recalculation Task

- Recalculates service scores based on attribute changes
- Processes jobs from the ServiceScoreRecalculationJob table
- Calculates privacy, trust, and overall scores
- Scheduled via `CRON_SERVICE-SCORE-RECALC_TASK`

### Inactive Users Task

- Handles cleanup of inactive user accounts
- Identifies users who have been inactive for 1 year (no comments, votes, suggestions, and 0 karma)
- Sends deletion warning notifications at 30, 15, 5, and 1 day intervals
- Deletes accounts that remain inactive after the warning period
- Cancels deletion for users who become active again
- Scheduled via `CRON_INACTIVE_USERS_TASK`

## Development

### Project Structure

```text
pyworker/
├── pyworker/
│   ├── __init__.py
│   ├── __main__.py
│   ├── cli.py
│   ├── config.py
│   ├── database.py
│   ├── scheduler.py
│   ├── tasks/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── comment_moderation.py
│   │   ├── force_triggers.py
│   │   ├── inactive_users.py
│   │   ├── service_score_recalc.py
│   │   ├── tos_review.py
│   │   └── user_sentiment.py
│   └── utils/
│       ├── __init__.py
│       ├── ai.py
│       └── logging.py
├── tests/
├── setup.py
├── requirements.txt
└── README.md
```

### Adding New Tasks

1. Create a new task class in `pyworker/tasks/`
2. Implement the `run` method
3. Add the task to `pyworker/tasks/__init__.py`
4. Update the CLI and scheduler to handle the new task

## License

MIT
