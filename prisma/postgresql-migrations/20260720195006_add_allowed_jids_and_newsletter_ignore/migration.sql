-- AlterTable
ALTER TABLE "public"."Chatwoot" ADD COLUMN     "allowedJids" JSONB;

-- AlterTable
ALTER TABLE "public"."Setting" ADD COLUMN     "newsletterIgnore" BOOLEAN NOT NULL DEFAULT false;
