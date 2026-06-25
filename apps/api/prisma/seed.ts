import { Prisma, PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import * as crypto from "node:crypto";
import * as dotenv from "dotenv";
import { getBuiltInDpiModels } from "../src/modules/ai-models/dpi-model-catalog";

dotenv.config();

const prisma = new PrismaClient();

const SEEDREAM_MAX_REFERENCE_IMAGES = 14;

const PERMISSIONS: Array<{ code: string; name: string; group: string }> = [
  {
    code: "admin.dashboard.view",
    name: "View admin dashboard",
    group: "admin",
  },
  { code: "admin.users.read", name: "Read users", group: "users" },
  { code: "admin.users.write", name: "Write users", group: "users" },
  { code: "admin.ai_models.read", name: "Read AI models", group: "ai" },
  { code: "admin.ai_models.write", name: "Write AI models", group: "ai" },
  {
    code: "admin.oauth_providers.write",
    name: "Configure OAuth providers",
    group: "auth",
  },
  {
    code: "admin.showcase.write",
    name: "Configure homepage showcase",
    group: "content",
  },
  {
    code: "admin.templates.write",
    name: "Configure prompt templates",
    group: "content",
  },
  {
    code: "admin.chats.review",
    name: "Review user chat sessions",
    group: "content",
  },
  {
    code: "admin.site_settings.write",
    name: "Configure site settings",
    group: "content",
  },
  { code: "admin.audit_log.read", name: "Read audit log", group: "admin" },
  { code: "admin.queues.view", name: "View task queues", group: "ops" },
  {
    code: "admin.generation.monitor",
    name: "Monitor generation jobs",
    group: "ops",
  },
  {
    code: "admin.credit_ledger.read",
    name: "Read credit ledger",
    group: "credits",
  },
  {
    code: "admin.credit_ledger.adjust",
    name: "Manually adjust credits",
    group: "credits",
  },
];

const PROMPT_TEMPLATE_CATEGORIES = [
  "穿搭配色（个人色彩测试）",
  "品牌设计",
  "海报与广告",
  "插画",
  "UI设计",
  "角色设计",
  "影片与分镜",
  "产品设计",
  "建筑设计",
  "园艺设计",
  "3D设计",
] as const;

function encryptPlaceholder(value: string): string {
  // Use a deterministic placeholder encryption marker for seed.
  // Real encryption happens via CryptoService at runtime when admin saves config.
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) {
    return `plain:${value}`;
  }
  const buf = Buffer.from(key, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", buf.subarray(0, 32), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

async function main() {
  // ----- Permissions -----
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, group: p.group },
      create: p,
    });
  }

  // ----- Roles -----
  const superAdminRole = await prisma.role.upsert({
    where: { code: "SUPER_ADMIN" },
    update: { name: "Super Admin", isSystem: true },
    create: {
      code: "SUPER_ADMIN",
      name: "Super Admin",
      isSystem: true,
      description: "Full access",
    },
  });

  const userRole = await prisma.role.upsert({
    where: { code: "USER" },
    update: { name: "User", isSystem: true },
    create: {
      code: "USER",
      name: "User",
      isSystem: true,
      description: "Default user role",
    },
  });

  // Wire all permissions to SUPER_ADMIN
  const allPerms = await prisma.permission.findMany();
  for (const p of allPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: superAdminRole.id, permissionId: p.id },
      },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: p.id },
    });
  }

  // ----- Default AI models -----
  const defaultText2Image = process.env.DEFAULT_AI_TEXT2IMAGE_API_KEY ?? "";
  const defaultText2ImageBase =
    process.env.DEFAULT_AI_TEXT2IMAGE_BASE_URL ??
    process.env.BPI_TEXT2IMAGE_BASE_URL ??
    "";
  const defaultVideoKey =
    process.env.DEFAULT_AI_VIDEO_API_KEY ??
    process.env.DEFAULT_AI_IMAGE2VIDEO_API_KEY ??
    defaultText2Image;
  const defaultVideoBase =
    process.env.DEFAULT_AI_VIDEO_BASE_URL ??
    process.env.DEFAULT_AI_IMAGE2VIDEO_BASE_URL ??
    "https://seedanceapi.org/v2";

  await prisma.aIModel.upsert({
    where: { code: "default-text2image" },
    update: {
      displayName: "Default Image Model",
      isActive: true,
      baseUrl: defaultText2ImageBase,
      apiKeyEnc: encryptPlaceholder(defaultText2Image),
      modelName: "stable-diffusion-xl",
      defaultParams: { size: "1024x1024", n: 1 },
      costCredits: 1,
      accessLevel: "FREE",
      isDefault: true,
      supportsReferenceImages: false,
      requiresReferenceImages: false,
    },
    create: {
      code: "default-text2image",
      displayName: "Default Image Model",
      category: "TEXT2IMAGE",
      baseUrl: defaultText2ImageBase,
      apiKeyEnc: encryptPlaceholder(defaultText2Image),
      modelName: "stable-diffusion-xl",
      defaultParams: { size: "1024x1024", n: 1 },
      costCredits: 1,
      accessLevel: "FREE",
      isDefault: true,
      supportsReferenceImages: false,
      requiresReferenceImages: false,
      sortOrder: 0,
    },
  });

  await prisma.aIModel.upsert({
    where: { code: "default-image2video" },
    update: {
      displayName: "Seedance 2.0 Video",
      isActive: true,
      baseUrl: defaultVideoBase,
      apiKeyEnc: encryptPlaceholder(defaultVideoKey),
      modelName: "seedance-2.0",
      defaultParams: {
        apiStyle: "seedance-v2",
        duration: 5,
        aspect_ratio: "16:9",
        pollAttempts: 72,
        pollIntervalMs: 5000,
      },
      costCredits: 28,
      accessLevel: "FREE",
      isDefault: true,
    },
    create: {
      code: "default-image2video",
      displayName: "Seedance 2.0 Video",
      category: "IMAGE2VIDEO",
      baseUrl: defaultVideoBase,
      apiKeyEnc: encryptPlaceholder(defaultVideoKey),
      modelName: "seedance-2.0",
      defaultParams: {
        apiStyle: "seedance-v2",
        duration: 5,
        aspect_ratio: "16:9",
        pollAttempts: 72,
        pollIntervalMs: 5000,
      },
      costCredits: 28,
      accessLevel: "FREE",
      isDefault: true,
      sortOrder: 1,
    },
  });

  const volcengineKey =
    process.env.VOLCENGINE_API_KEY ??
    process.env.ARK_API_KEY ??
    process.env.DEFAULT_VOLCENGINE_API_KEY ??
    "";
  const volcengineProvider = await prisma.modelProviderConfig.upsert({
    where: { code: "volcengine" },
    update: {
      name: "Volcengine Ark",
      baseUrl: "https://ark.cn-beijing.volces.com",
      apiStyle: "VOLCENGINE",
      maxPollDurationMs: 30 * 60_000,
      pollIntervalMs: 5000,
      maxPollAttempts: 360,
      extra: { apiStyle: "volcengine-video" },
      isActive: true,
      sortOrder: 10,
      ...(volcengineKey ? { apiKeyEnc: encryptPlaceholder(volcengineKey) } : {}),
    },
    create: {
      code: "volcengine",
      name: "Volcengine Ark",
      baseUrl: "https://ark.cn-beijing.volces.com",
      apiStyle: "VOLCENGINE",
      statusUrl: null,
      maxPollDurationMs: 30 * 60_000,
      pollIntervalMs: 5000,
      maxPollAttempts: 360,
      apiKeyEnc: encryptPlaceholder(volcengineKey),
      extra: { apiStyle: "volcengine-video" },
      isActive: true,
      sortOrder: 10,
    },
  });

  const seedanceDefaults = {
    apiStyle: "volcengine-video",
    duration: 4,
    ratio: "adaptive",
    resolution: "720p",
    generate_audio: false,
    watermark: false,
    pollAttempts: 360,
    pollIntervalMs: 5000,
    maxPollDurationMs: 30 * 60_000,
  };
  const seedreamDefaults = {
    apiStyle: "volcengine-seedream",
    imageInputMode: "I2I",
    size: "2048x2048",
    sequential_image_generation: "disabled",
    stream: true,
    response_format: "url",
    watermark: false,
    minReferenceImages: 0,
    maxReferenceImages: SEEDREAM_MAX_REFERENCE_IMAGES,
    requestTimeoutMs: 15 * 60_000,
  };
  const seedreamModels = [
    [
      "volc-seedream-5-0-lite",
      "Seedream 5.0 Lite",
      "doubao-seedream-5-0-260128",
      { ...seedreamDefaults, resolutionOptions: ["2K", "3K", "4K"], output_format: "jpeg" },
      8,
      10,
      "Volcengine Doubao Seedream 5.0 Lite text/reference image generation.",
    ],
    [
      "volc-seedream-4-5",
      "Seedream 4.5",
      "doubao-seedream-4-5-251128",
      { ...seedreamDefaults, resolutionOptions: ["2K", "4K"] },
      6,
      11,
      "Volcengine Doubao Seedream 4.5 text/reference image generation.",
    ],
    [
      "volc-seedream-4-0",
      "Seedream 4.0",
      "doubao-seedream-4-0-250828",
      { ...seedreamDefaults, resolutionOptions: ["1K", "2K", "4K"] },
      4,
      12,
      "Volcengine Doubao Seedream 4.0 text/reference image generation.",
    ],
  ] as const;
  const seedanceModels = [
    ["volc-seedance-2-0-t2v", "Seedance 2.0 Text to Video", "doubao-seedance-2-0-260128", "T2V", 28, 20],
    ["volc-seedance-2-0-i2v", "Seedance 2.0 Image to Video", "doubao-seedance-2-0-260128", "I2V", 28, 21],
    ["volc-seedance-2-0-r2v", "Seedance 2.0 Reference Video", "doubao-seedance-2-0-260128", "R2V", 28, 22],
    ["volc-seedance-2-0-fast-t2v", "Seedance 2.0 Fast Text to Video", "doubao-seedance-2-0-fast-260128", "T2V", 24, 23],
    ["volc-seedance-2-0-fast-i2v", "Seedance 2.0 Fast Image to Video", "doubao-seedance-2-0-fast-260128", "I2V", 24, 24],
    ["volc-seedance-2-0-fast-r2v", "Seedance 2.0 Fast Reference Video", "doubao-seedance-2-0-fast-260128", "R2V", 24, 25],
    ["volc-seedance-1-5-pro-t2v", "Seedance 1.5 Pro Text to Video", "doubao-seedance-1-5-pro-251215", "T2V", 28, 26],
    ["volc-seedance-1-5-pro-i2v", "Seedance 1.5 Pro Image to Video", "doubao-seedance-1-5-pro-251215", "I2V", 28, 27],
    ["volc-seedance-1-5-pro-r2v", "Seedance 1.5 Pro First/Last Frame Video", "doubao-seedance-1-5-pro-251215", "R2V", 28, 28],
  ] as const;

  for (const [code, displayName, modelName, defaultParams, costCredits, sortOrder, description] of seedreamModels) {
    await prisma.aIModel.upsert({
      where: { code },
      update: {
        displayName,
        category: "TEXT2IMAGE",
        providerId: volcengineProvider.id,
        baseUrl: "",
        modelName,
        defaultParams,
        costCredits,
        accessLevel: "FREE",
        supportsReferenceImages: true,
        requiresReferenceImages: false,
        sortOrder,
        description,
      },
      create: {
        code,
        displayName,
        category: "TEXT2IMAGE",
        providerId: volcengineProvider.id,
        baseUrl: "",
        apiKeyEnc: encryptPlaceholder(""),
        modelName,
        defaultParams,
        costCredits,
        accessLevel: "FREE",
        isActive: Boolean(volcengineKey.trim()),
        isDefault: false,
        supportsReferenceImages: true,
        requiresReferenceImages: false,
        sortOrder,
        description,
      },
    });
  }

  for (const [code, displayName, modelName, videoInputMode, costCredits, sortOrder] of seedanceModels) {
    await prisma.aIModel.upsert({
      where: { code },
      update: {
        displayName,
        category: "IMAGE2VIDEO",
        providerId: volcengineProvider.id,
        baseUrl: "",
        modelName,
        defaultParams: {
          ...seedanceDefaults,
          videoInputMode,
        },
        costCredits,
        accessLevel: "FREE",
        sortOrder,
      },
      create: {
        code,
        displayName,
        category: "IMAGE2VIDEO",
        providerId: volcengineProvider.id,
        baseUrl: "",
        apiKeyEnc: encryptPlaceholder(""),
        modelName,
        defaultParams: {
          ...seedanceDefaults,
          videoInputMode,
        },
        costCredits,
        accessLevel: "FREE",
        isActive: Boolean(volcengineKey.trim()),
        isDefault: false,
        sortOrder,
      },
    });
  }

  for (const model of getBuiltInDpiModels()) {
    await prisma.aIModel.upsert({
      where: { code: model.code },
      update: {
        displayName: model.displayName,
        category: model.category,
        baseUrl: model.baseUrl,
        apiKeyEnc: encryptPlaceholder(model.apiKey),
        modelName: model.modelName,
        defaultParams: model.defaultParams as Prisma.InputJsonValue,
        costCredits: model.costCredits,
        accessLevel: "FREE",
        description: model.description,
      },
      create: {
        code: model.code,
        displayName: model.displayName,
        category: model.category,
        baseUrl: model.baseUrl,
        apiKeyEnc: encryptPlaceholder(model.apiKey),
        modelName: model.modelName,
        defaultParams: model.defaultParams as Prisma.InputJsonValue,
        costCredits: model.costCredits,
        accessLevel: "FREE",
        isActive: Boolean(model.apiKey.trim()),
        isDefault: false,
        sortOrder: model.sortOrder,
        description: model.description,
      },
    });
  }

  // ----- Super admin user -----
  const adminEmail = process.env.SUPER_ADMIN_EMAIL ?? "administrator@megick.com";
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD ?? "PleaseChangeMe!2026";
  const passwordHash = await argon2.hash(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, status: "ACTIVE" },
    create: {
      email: adminEmail,
      passwordHash,
      status: "ACTIVE",
      profile: {
        create: {
          displayName: "Super Admin",
          credits: 100000,
        },
      },
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: superAdminRole.id },
  });

  // Prompt template categories shared by admin template CRUD and the user template center.
  for (const [sortOrder, name] of PROMPT_TEMPLATE_CATEGORIES.entries()) {
    await prisma.promptTemplateCategory.upsert({
      where: { name },
      update: { sortOrder, isActive: true },
      create: { name, sortOrder, isActive: true },
    });
  }

  // SiteSettings defaults
  await prisma.siteSetting.upsert({
    where: { key: "homepage.heroTitle" },
    update: {},
    create: {
      key: "homepage.heroTitle",
      value: { from: "magic", to: "megick" },
      scope: "homepage",
    },
  });
  await prisma.siteSetting.upsert({
    where: { key: "auth.passwordLoginEnabled" },
    update: {},
    create: { key: "auth.passwordLoginEnabled", value: true, scope: "auth" },
  });
  await prisma.siteSetting.upsert({
    where: { key: "auth.registrationEnabled" },
    update: {},
    create: { key: "auth.registrationEnabled", value: true, scope: "auth" },
  });
  await prisma.siteSetting.upsert({
    where: { key: "auth.registrationEmailVerificationEnabled" },
    update: {},
    create: {
      key: "auth.registrationEmailVerificationEnabled",
      value: false,
      scope: "auth",
    },
  });
  await prisma.siteSetting.upsert({
    where: { key: "auth.defaultRegistrationCredits" },
    update: {},
    create: { key: "auth.defaultRegistrationCredits", value: 80, scope: "auth" },
  });
  await prisma.siteSetting.upsert({
    where: { key: "features.videoGenerationEnabled" },
    update: {},
    create: { key: "features.videoGenerationEnabled", value: false, scope: "features" },
  });

  console.log("✓ Seed complete.");
  console.log(`  Super admin: ${adminEmail} / (env SUPER_ADMIN_PASSWORD)`);
  console.log(`  Roles: SUPER_ADMIN, USER  (and ${userRole.code})`);
  console.log("  Open-source edition uses manual admin credit adjustments; no online purchase seed data is included.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
