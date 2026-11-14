-- Fix the misspelled "other-sevices" category slug. Guarded so it is a no-op
-- where the typo is absent or the correct slug already exists.
UPDATE "Category"
SET "slug" = 'other-services'
WHERE "slug" = 'other-sevices'
  AND NOT EXISTS (SELECT 1 FROM "Category" WHERE "slug" = 'other-services');
