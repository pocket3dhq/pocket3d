-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "allowDownload" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AssetDailyStat" (
    "assetId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssetDailyStat_pkey" PRIMARY KEY ("assetId","day")
);

-- AddForeignKey
ALTER TABLE "AssetDailyStat" ADD CONSTRAINT "AssetDailyStat_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
