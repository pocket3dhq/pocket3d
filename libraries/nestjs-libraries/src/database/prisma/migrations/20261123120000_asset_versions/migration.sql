-- CreateEnum
CREATE TYPE "VersionSource" AS ENUM ('DASHBOARD', 'API', 'MCP');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "activityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastNumber" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "liveVersionId" TEXT,
ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "path" DROP NOT NULL,
ALTER COLUMN "fileSize" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UploadTicket" ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "draft" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "source" "VersionSource" NOT NULL DEFAULT 'MCP',
ADD COLUMN     "sourceName" TEXT;

-- CreateTable
CREATE TABLE "AssetVersion" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "coverName" TEXT,
    "coverPath" TEXT,
    "coverSize" INTEGER,
    "note" TEXT,
    "status" "VersionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "publishedAt" TIMESTAMP(3),
    "source" "VersionSource",
    "sourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetVersion_assetId_deletedAt_status_number_idx" ON "AssetVersion"("assetId", "deletedAt", "status", "number");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_assetId_number_key" ON "AssetVersion"("assetId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_liveVersionId_key" ON "Asset"("liveVersionId");

-- CreateIndex
CREATE INDEX "Asset_organizationId_deletedAt_activityAt_idx" ON "Asset"("organizationId", "deletedAt", "activityAt");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_liveVersionId_fkey" FOREIGN KEY ("liveVersionId") REFERENCES "AssetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: every existing model (deleted ones included) gets its file as
-- v1, published, which becomes its live version. The model's own file
-- columns stay as they are (now nullable, no longer read) until a later
-- migration drops them. Postgres runs this whole file as one transaction, so
-- a failure here leaves the database as it was
INSERT INTO "AssetVersion" ("id", "assetId", "number", "name", "path", "fileSize", "coverName", "coverPath", "coverSize", "status", "publishedAt", "createdAt", "deletedAt")
SELECT gen_random_uuid()::text, a."id", 1, a."name", a."path", a."fileSize", a."coverName", a."coverPath", a."coverSize", 'PUBLISHED', a."createdAt", a."createdAt", a."deletedAt"
FROM "Asset" a;

UPDATE "Asset" a
SET "liveVersionId" = v."id", "lastNumber" = 1, "activityAt" = a."createdAt"
FROM "AssetVersion" v
WHERE v."assetId" = a."id" AND v."number" = 1;
