-- CreateTable
CREATE TABLE "UploadTicket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "title" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthGrant" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeChallenge" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "accessTokenHash" TEXT,
    "accessExpiresAt" TIMESTAMP(3),
    "refreshTokenHash" TEXT,
    "refreshExpiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadTicket_tokenHash_key" ON "UploadTicket"("tokenHash");

-- CreateIndex
CREATE INDEX "UploadTicket_organizationId_idx" ON "UploadTicket"("organizationId");

-- CreateIndex
CREATE INDEX "UploadTicket_expiresAt_idx" ON "UploadTicket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClient_clientId_key" ON "OAuthClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthGrant_codeHash_key" ON "OAuthGrant"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthGrant_accessTokenHash_key" ON "OAuthGrant"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthGrant_refreshTokenHash_key" ON "OAuthGrant"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "OAuthGrant_userId_idx" ON "OAuthGrant"("userId");

-- CreateIndex
CREATE INDEX "OAuthGrant_organizationId_idx" ON "OAuthGrant"("organizationId");

-- AddForeignKey
ALTER TABLE "UploadTicket" ADD CONSTRAINT "UploadTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthGrant" ADD CONSTRAINT "OAuthGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthGrant" ADD CONSTRAINT "OAuthGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthGrant" ADD CONSTRAINT "OAuthGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
