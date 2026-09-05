-- AlterTable
ALTER TABLE "Category" ADD COLUMN "holdsFunds" BOOLEAN NOT NULL DEFAULT false;

-- Categories where the service takes custody of the visitor's money at some
-- point in the flow, even briefly.
UPDATE "Category"
SET "holdsFunds" = true
WHERE "slug" IN (
  'aggregator',
  'atm',
  'cards',
  'dex',
  'exchange',
  'gift-cards',
  'goods',
  'indie-exchange',
  'marketplace',
  'p2p',
  'proxy-store'
);
