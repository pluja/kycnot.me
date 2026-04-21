-- Migrate KycLevelClarification data into the attribute system before dropping the enum.
-- Services currently set to DEPENDS_ON_PARTNERS get a new "KYC depends on partners"
-- attribute linked to them so their score (-5 privacy) and their displayed chip both
-- continue to work through the attribute-based UI.

INSERT INTO "Attribute" ("slug", "title", "description", "category", "type", "privacyPoints", "trustPoints", "updatedAt")
VALUES (
  'depends-on-partners',
  'KYC depends on partners',
  'This service routes through partner providers whose KYC policies vary. Your actual experience depends on which partner is used for a given swap.',
  'KYC',
  'WARNING',
  -5,
  0,
  NOW()
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "ServiceAttribute" ("serviceId", "attributeId", "createdAt")
SELECT s."id", a."id", NOW()
FROM "Service" s
CROSS JOIN (SELECT "id" FROM "Attribute" WHERE "slug" = 'depends-on-partners' LIMIT 1) a
WHERE s."kycLevelClarification" = 'DEPENDS_ON_PARTNERS'
ON CONFLICT ("serviceId", "attributeId") DO NOTHING;

-- Drop the column and the enum.
ALTER TABLE "Service" DROP COLUMN "kycLevelClarification";
DROP TYPE "KycLevelClarification";
