-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NULL,
    `status` ENUM('ACTIVE', 'DISABLED', 'PENDING') NOT NULL DEFAULT 'ACTIVE',
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `profiles` (
    `userId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL DEFAULT 'Creator',
    `avatarUrl` VARCHAR(512) NULL,
    `locale` VARCHAR(16) NOT NULL DEFAULT 'en',
    `localeSource` VARCHAR(16) NOT NULL DEFAULT 'device',
    `localeUpdatedAt` DATETIME(3) NULL,
    `credits` INTEGER NOT NULL DEFAULT 0,
    `referralCode` VARCHAR(32) NULL,
    `referralRewardCredits` INTEGER NOT NULL DEFAULT 0,
    `referralRewardTotalCredits` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `profiles_referralCode_key`(`referralCode`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oauth_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` ENUM('GOOGLE', 'GITHUB', 'APPLE') NOT NULL,
    `providerUserId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `displayName` VARCHAR(191) NULL,
    `avatarUrl` VARCHAR(512) NULL,
    `accessTokenEnc` TEXT NULL,
    `refreshTokenEnc` TEXT NULL,
    `expiresAt` DATETIME(3) NULL,
    `raw` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `oauth_accounts_userId_idx`(`userId`),
    UNIQUE INDEX `oauth_accounts_provider_providerUserId_key`(`provider`, `providerUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(128) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `group` VARCHAR(64) NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `permissions_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `roleId` VARCHAR(191) NOT NULL,
    `permissionId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `userId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `delta` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `refType` VARCHAR(64) NULL,
    `refId` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `credit_ledger_idempotencyKey_key`(`idempotencyKey`),
    INDEX `credit_ledger_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `referral_invitations` (
    `id` VARCHAR(191) NOT NULL,
    `inviterId` VARCHAR(191) NOT NULL,
    `inviteeId` VARCHAR(191) NOT NULL,
    `inviterCodeSnapshot` VARCHAR(32) NOT NULL,
    `rewardCredits` INTEGER NOT NULL DEFAULT 0,
    `rewardedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `referral_invitations_inviteeId_key`(`inviteeId`),
    INDEX `referral_invitations_inviterId_createdAt_idx`(`inviterId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `referral_reward_transfers` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `requestedCredits` INTEGER NOT NULL,
    `transferredCredits` INTEGER NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `autoApproved` BOOLEAN NOT NULL DEFAULT false,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `referral_reward_transfers_userId_status_idx`(`userId`, `status`),
    INDEX `referral_reward_transfers_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `referral_reward_transfers_reviewedById_idx`(`reviewedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_models` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `displayNameEn` VARCHAR(191) NULL,
    `category` ENUM('TEXT', 'TEXT2IMAGE', 'IMAGE2VIDEO') NOT NULL,
    `accessLevel` ENUM('FREE', 'PAID') NOT NULL DEFAULT 'FREE',
    `providerId` VARCHAR(191) NULL,
    `baseUrl` VARCHAR(512) NOT NULL,
    `apiKeyEnc` TEXT NOT NULL,
    `modelName` VARCHAR(128) NOT NULL,
    `defaultParams` JSON NOT NULL,
    `costCredits` INTEGER NOT NULL DEFAULT 1,
    `rateLimitPerMinute` INTEGER NOT NULL DEFAULT 60,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `description` VARCHAR(191) NULL,
    `supportsReferenceImages` BOOLEAN NOT NULL DEFAULT false,
    `requiresReferenceImages` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_models_code_key`(`code`),
    INDEX `ai_models_providerId_idx`(`providerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `generation_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `modelId` VARCHAR(191) NOT NULL,
    `modelCode` VARCHAR(64) NOT NULL,
    `type` ENUM('TEXT2IMAGE', 'IMAGE2VIDEO', 'IMAGE_EDIT') NOT NULL,
    `status` ENUM('queued', 'running', 'succeeded', 'failed', 'canceled') NOT NULL DEFAULT 'queued',
    `prompt` TEXT NOT NULL,
    `params` JSON NOT NULL,
    `inputAssetKey` VARCHAR(512) NULL,
    `outputAssetIds` JSON NOT NULL,
    `providerOutputUrls` JSON NULL,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `costCredits` INTEGER NOT NULL DEFAULT 0,
    `errorMessage` TEXT NULL,
    `providerJobId` VARCHAR(191) NULL,
    `providerIdSnapshot` VARCHAR(191) NULL,
    `providerBaseUrlSnapshot` VARCHAR(512) NULL,
    `providerApiStyleSnapshot` ENUM('OPENAI', 'CREX', 'VOLCENGINE') NULL,
    `providerStatusUrlSnapshot` VARCHAR(512) NULL,
    `providerModelNameSnapshot` VARCHAR(128) NULL,
    `providerParamsSnapshot` JSON NULL,
    `chatSessionId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `generation_jobs_userId_idx`(`userId`),
    INDEX `generation_jobs_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `generation_jobs_status_idx`(`status`),
    INDEX `generation_jobs_chatSessionId_idx`(`chatSessionId`),
    INDEX `generation_jobs_providerIdSnapshot_idx`(`providerIdSnapshot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL DEFAULT 'New chat',
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `chat_sessions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_messages` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(16) NOT NULL,
    `content` TEXT NOT NULL,
    `generationJobId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_messages_sessionId_idx`(`sessionId`),
    INDEX `chat_messages_generationJobId_idx`(`generationJobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prompt_templates` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('TEXT2IMAGE', 'IMAGE2VIDEO', 'IMAGE_EDIT') NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `textPrompt` TEXT NOT NULL,
    `materialPrompt` TEXT NULL,
    `referenceAssetKeys` JSON NOT NULL,
    `exampleAssetKey` VARCHAR(512) NULL,
    `modelCode` VARCHAR(64) NULL,
    `params` JSON NOT NULL,
    `tags` JSON NOT NULL,
    `category` VARCHAR(64) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `sourceChatSessionId` VARCHAR(191) NULL,
    `sourceGenerationJobId` VARCHAR(191) NULL,
    `sourceMessageId` VARCHAR(191) NULL,
    `createdByAdminId` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `prompt_templates_type_status_idx`(`type`, `status`),
    INDEX `prompt_templates_category_idx`(`category`),
    INDEX `prompt_templates_sourceChatSessionId_idx`(`sourceChatSessionId`),
    INDEX `prompt_templates_sourceGenerationJobId_idx`(`sourceGenerationJobId`),
    INDEX `prompt_templates_sourceMessageId_idx`(`sourceMessageId`),
    INDEX `prompt_templates_createdByAdminId_idx`(`createdByAdminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prompt_template_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prompt_template_categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prompt_template_category_assignments` (
    `templateId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `prompt_template_category_assignments_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`templateId`, `categoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `model_provider_configs` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `baseUrl` VARCHAR(512) NOT NULL DEFAULT 'https://api.magickapi.com',
    `apiStyle` ENUM('OPENAI', 'CREX', 'VOLCENGINE') NOT NULL DEFAULT 'OPENAI',
    `statusUrl` VARCHAR(512) NULL,
    `maxPollDurationMs` INTEGER NOT NULL DEFAULT 900000,
    `pollIntervalMs` INTEGER NOT NULL DEFAULT 5000,
    `maxPollAttempts` INTEGER NOT NULL DEFAULT 180,
    `apiKeyEnc` TEXT NOT NULL,
    `extra` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `model_provider_configs_code_key`(`code`),
    INDEX `model_provider_configs_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_image_edit_modes` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NULL,
    `modelName` VARCHAR(128) NOT NULL,
    `requiresMask` BOOLEAN NOT NULL DEFAULT false,
    `defaultParams` JSON NOT NULL,
    `costCredits` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_image_edit_modes_code_key`(`code`),
    INDEX `ai_image_edit_modes_providerId_idx`(`providerId`),
    INDEX `ai_image_edit_modes_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oauth_provider_configs` (
    `id` VARCHAR(191) NOT NULL,
    `provider` ENUM('GOOGLE', 'GITHUB', 'APPLE') NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `clientSecretEnc` TEXT NOT NULL,
    `redirectUri` VARCHAR(512) NOT NULL,
    `scopes` JSON NOT NULL,
    `extra` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `oauth_provider_configs_provider_key`(`provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `smtp_configs` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(64) NOT NULL DEFAULT 'default',
    `configEnc` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `smtp_configs_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `showcase_items` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('TEXT2IMAGE', 'IMAGE2VIDEO') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `prompt` TEXT NOT NULL,
    `beforeAssetKey` VARCHAR(512) NULL,
    `afterAssetKey` VARCHAR(512) NOT NULL,
    `durationMs` INTEGER NULL,
    `source` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `navigation_menu_items` (
    `id` VARCHAR(191) NOT NULL,
    `area` ENUM('HEADER', 'DASHBOARD_SIDEBAR') NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `labelEn` VARCHAR(191) NULL,
    `description` VARCHAR(255) NULL,
    `descriptionEn` VARCHAR(255) NULL,
    `href` VARCHAR(512) NOT NULL,
    `icon` VARCHAR(64) NULL,
    `requiresAuth` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `navigation_menu_items_area_isActive_sortOrder_idx`(`area`, `isActive`, `sortOrder`),
    UNIQUE INDEX `navigation_menu_items_area_code_key`(`area`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oss_assets` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `bucket` VARCHAR(128) NOT NULL,
    `key` VARCHAR(512) NOT NULL,
    `contentType` VARCHAR(128) NOT NULL,
    `sizeBytes` INTEGER NOT NULL DEFAULT 0,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `durationMs` INTEGER NULL,
    `sha256` VARCHAR(64) NULL,
    `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL DEFAULT 'PRIVATE',
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `oss_assets_key_key`(`key`),
    INDEX `oss_assets_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_center_items` (
    `id` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` ENUM('IMAGE', 'VIDEO', 'AUDIO', 'FILE') NOT NULL,
    `source` ENUM('GENERATION', 'USER_UPLOAD', 'STUDIO_EDIT', 'STUDIO_MEDIA', 'IMPORT') NOT NULL,
    `status` ENUM('UPLOADING', 'READY', 'PROCESSING', 'FAILED', 'DELETED', 'ARCHIVED') NOT NULL DEFAULT 'READY',
    `ossAssetId` VARCHAR(191) NULL,
    `bucket` VARCHAR(128) NOT NULL,
    `ossKey` VARCHAR(512) NOT NULL,
    `originalOssUrl` TEXT NULL,
    `signedUrl` TEXT NULL,
    `signedUrlExpiresAt` DATETIME(3) NULL,
    `watermarkedUrl` TEXT NULL,
    `watermarkedUrlExpiresAt` DATETIME(3) NULL,
    `watermarkProcess` VARCHAR(191) NULL,
    `requiresWatermark` BOOLEAN NOT NULL DEFAULT false,
    `providerSourceUrl` TEXT NULL,
    `prompt` TEXT NULL,
    `jobId` VARCHAR(191) NULL,
    `outputIndex` INTEGER NULL,
    `chatSessionId` VARCHAR(191) NULL,
    `messageId` VARCHAR(191) NULL,
    `contentType` VARCHAR(128) NOT NULL,
    `sizeBytes` INTEGER NOT NULL DEFAULT 0,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `durationMs` INTEGER NULL,
    `sha256` VARCHAR(64) NULL,
    `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL DEFAULT 'PRIVATE',
    `metadata` JSON NULL,
    `sourceParams` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `media_center_items_ossAssetId_key`(`ossAssetId`),
    INDEX `media_center_items_userId_kind_status_createdAt_idx`(`userId`, `kind`, `status`, `createdAt`),
    INDEX `media_center_items_userId_source_createdAt_idx`(`userId`, `source`, `createdAt`),
    INDEX `media_center_items_ossKey_idx`(`ossKey`),
    INDEX `media_center_items_chatSessionId_idx`(`chatSessionId`),
    INDEX `media_center_items_messageId_idx`(`messageId`),
    UNIQUE INDEX `media_center_items_jobId_outputIndex_key`(`jobId`, `outputIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `generation_output_media` (
    `id` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `outputIndex` INTEGER NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `generation_output_media_userId_idx`(`userId`),
    INDEX `generation_output_media_assetId_idx`(`assetId`),
    UNIQUE INDEX `generation_output_media_jobId_outputIndex_key`(`jobId`, `outputIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `site_settings` (
    `key` VARCHAR(128) NOT NULL,
    `value` JSON NOT NULL,
    `scope` VARCHAR(64) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cloud_r2_configs` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(64) NOT NULL DEFAULT 'default',
    `accountId` VARCHAR(128) NULL,
    `endpoint` VARCHAR(512) NOT NULL,
    `bucket` VARCHAR(128) NOT NULL,
    `accessKeyId` VARCHAR(191) NOT NULL,
    `secretAccessKeyEnc` TEXT NOT NULL,
    `publicBaseUrl` VARCHAR(512) NULL,
    `publicDevelopmentUrl` VARCHAR(512) NULL,
    `keyPrefix` VARCHAR(191) NOT NULL DEFAULT 'desktop-installers',
    `presignExpiresSeconds` INTEGER NOT NULL DEFAULT 3600,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cloud_r2_configs_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oss_configs` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(64) NOT NULL DEFAULT 'default',
    `region` VARCHAR(128) NOT NULL,
    `endpoint` VARCHAR(512) NULL,
    `bucket` VARCHAR(128) NOT NULL,
    `accessKeyId` VARCHAR(191) NOT NULL,
    `accessKeySecretEnc` TEXT NOT NULL,
    `domain` VARCHAR(512) NULL,
    `publicBaseUrl` VARCHAR(512) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `oss_configs_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `desktop_releases` (
    `id` VARCHAR(191) NOT NULL,
    `platform` ENUM('MAC', 'WIN') NOT NULL,
    `version` VARCHAR(64) NOT NULL,
    `downloadUrl` VARCHAR(1024) NOT NULL,
    `r2ObjectKey` VARCHAR(512) NULL,
    `fileName` VARCHAR(255) NULL,
    `fileSizeBytes` BIGINT NULL,
    `sha256` VARCHAR(64) NULL,
    `sha512` VARCHAR(128) NULL,
    `releaseNotes` TEXT NULL,
    `isLatest` BOOLEAN NOT NULL DEFAULT false,
    `forceUpdate` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `desktop_releases_platform_isLatest_idx`(`platform`, `isLatest`),
    INDEX `desktop_releases_platform_isActive_createdAt_idx`(`platform`, `isActive`, `createdAt`),
    UNIQUE INDEX `desktop_releases_platform_version_key`(`platform`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NULL,
    `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'EXEC') NOT NULL,
    `targetType` VARCHAR(64) NOT NULL,
    `targetId` VARCHAR(128) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_audit_logs_adminId_idx`(`adminId`),
    INDEX `admin_audit_logs_targetType_idx`(`targetType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `profiles` ADD CONSTRAINT `profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauth_accounts` ADD CONSTRAINT `oauth_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_ledger` ADD CONSTRAINT `credit_ledger_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referral_invitations` ADD CONSTRAINT `referral_invitations_inviterId_fkey` FOREIGN KEY (`inviterId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referral_invitations` ADD CONSTRAINT `referral_invitations_inviteeId_fkey` FOREIGN KEY (`inviteeId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referral_reward_transfers` ADD CONSTRAINT `referral_reward_transfers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referral_reward_transfers` ADD CONSTRAINT `referral_reward_transfers_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_models` ADD CONSTRAINT `ai_models_providerId_fkey` FOREIGN KEY (`providerId`) REFERENCES `model_provider_configs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_jobs` ADD CONSTRAINT `generation_jobs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_jobs` ADD CONSTRAINT `generation_jobs_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `ai_models`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_jobs` ADD CONSTRAINT `generation_jobs_chatSessionId_fkey` FOREIGN KEY (`chatSessionId`) REFERENCES `chat_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_sessions` ADD CONSTRAINT `chat_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `chat_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_generationJobId_fkey` FOREIGN KEY (`generationJobId`) REFERENCES `generation_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_templates` ADD CONSTRAINT `prompt_templates_sourceChatSessionId_fkey` FOREIGN KEY (`sourceChatSessionId`) REFERENCES `chat_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_templates` ADD CONSTRAINT `prompt_templates_sourceGenerationJobId_fkey` FOREIGN KEY (`sourceGenerationJobId`) REFERENCES `generation_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_templates` ADD CONSTRAINT `prompt_templates_sourceMessageId_fkey` FOREIGN KEY (`sourceMessageId`) REFERENCES `chat_messages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_templates` ADD CONSTRAINT `prompt_templates_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_templates` ADD CONSTRAINT `prompt_templates_category_fkey` FOREIGN KEY (`category`) REFERENCES `prompt_template_categories`(`name`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_template_category_assignments` ADD CONSTRAINT `prompt_template_category_assignments_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `prompt_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_template_category_assignments` ADD CONSTRAINT `prompt_template_category_assignments_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `prompt_template_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_image_edit_modes` ADD CONSTRAINT `ai_image_edit_modes_providerId_fkey` FOREIGN KEY (`providerId`) REFERENCES `model_provider_configs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oss_assets` ADD CONSTRAINT `oss_assets_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_center_items` ADD CONSTRAINT `media_center_items_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_center_items` ADD CONSTRAINT `media_center_items_ossAssetId_fkey` FOREIGN KEY (`ossAssetId`) REFERENCES `oss_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_center_items` ADD CONSTRAINT `media_center_items_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `generation_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_output_media` ADD CONSTRAINT `generation_output_media_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_output_media` ADD CONSTRAINT `generation_output_media_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `generation_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_output_media` ADD CONSTRAINT `generation_output_media_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `oss_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_audit_logs` ADD CONSTRAINT `admin_audit_logs_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
