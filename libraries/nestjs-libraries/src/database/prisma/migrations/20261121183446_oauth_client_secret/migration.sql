-- AlterTable
ALTER TABLE "OAuthClient" ADD COLUMN     "clientSecretHash" TEXT,
ADD COLUMN     "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'none';
