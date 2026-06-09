-- Replace CaseIssueType with the consolidated set of issue types.
ALTER TYPE "CaseIssueType" RENAME TO "CaseIssueType_old";

CREATE TYPE "CaseIssueType" AS ENUM (
  'NON_PAYMENT',
  'DEPOSIT_NOT_CREDITED',
  'FROZEN_FUNDS',
  'KYC_DEMAND',
  'ACCOUNT_CLOSURE',
  'SCAM_ALLEGATION',
  'RATE_OR_FEE_DISPUTE',
  'CHARGEBACK',
  'PLATFORM_OUTAGE',
  'LEGAL_SEIZURE',
  'UNRESPONSIVE_SUPPORT',
  'OTHER'
);

ALTER TABLE "Case"
  ALTER COLUMN "issueType" TYPE "CaseIssueType"
  USING ("issueType"::text::"CaseIssueType");

DROP TYPE "CaseIssueType_old";
