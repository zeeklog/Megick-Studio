# Megick Studio
[Megick Video generate Examples](./examples/video-examples.mp4)
Megick Studio 是面向自托管场景的开源 AI 图像与视频创作平台。

- Website: https://megick.com
- GitHub: https://github.com/zeeklog/megick-studio

[Megick Home](./examples/home.png)
[Megick Image Generate](./examples/image-ai-gen.png)
[Megick Video generate](./examples/video-ai-gen.png)
[Megick Video Edit](./examples/video-edit.png)

## Features

- AI image Studio: text-to-image, reference image generation, image editing workflows.
- AI video Studio: text-to-video and image-to-video workflows, controlled by site settings.
- Template center: public templates, categories, admin moderation and publishing.
- Media center: generated outputs, uploads and OSS-backed media references.
- MegickCut: browser video editor with timeline editing, subtitles and export.
- Admin console: users, roles, models, providers, templates, OSS/R2 config, queues, audit logs and site settings.
- Credits: open-source credits are adjusted manually from the admin user detail page.

## Removed From Open Source Edition

The open-source package intentionally excludes commercial/private modules and related resources:

- Online credit purchase flows and third-party payment providers.
- Plans, recharge packs, customer orders, payment webhooks and payment SDKs.
- E-commerce suite, blog CMS, tutorial/guide pages and related assets.
- User brands and prompt enhancement modes.
- Stripe, Alipay, WeChat Pay and WeChat integration code.

## Tech Stack

| Layer | Stack |
| --- | --- |
| Web | TanStack Start, React 19, Tailwind CSS 4, shadcn/ui |
| API | NestJS 11, Prisma, MySQL 8, BullMQ, Redis |
| Storage | Aliyun OSS by default; Cloudflare R2 is available only where explicitly configured |
| Desktop | Electron wrapper for Megick Studio |
| Package manager | pnpm workspaces |

## Repository Layout

```text
megick-studio/
├── apps/
│   ├── api/          # NestJS API, Prisma schema, workers
│   ├── web/          # TanStack Start frontend and /admin
│   └── desktop/      # Desktop shell
├── packages/
│   └── api-types/    # Shared API types generated from OpenAPI
├── .env.example
├── ecosystem.config.cjs
└── pnpm-workspace.yaml
```

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Copy environment examples and fill local values:

```bash
cp .env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

3. Configure the required local services:

- `DATABASE_URL`: MySQL connection string.
- `REDIS_HOST` / `REDIS_PORT`: Redis for sessions and queues.
- `APP_ENCRYPTION_KEY`: generate with `openssl rand -base64 32`.
- `SESSION_SECRET`: generate with `openssl rand -base64 32`.
- `OSS_*`: Aliyun OSS bucket configuration.

4. Initialize Prisma and seed demo data:

```bash
pnpm prisma:generate
pnpm --filter @megick/api prisma:migrate:dev
pnpm prisma:seed
```

Default seeded admin:

```text
Email: administrator@megick.com
Password: PleaseChangeMe!2026
```

Change this password immediately after first login.

5. Start development servers:

```bash
pnpm dev:api
pnpm dev:web
```

- API: `http://localhost:3001`
- Web: `http://localhost:8080`
- Admin: `http://localhost:8080/admin`

## Seed Data

Seed data is intentionally minimal and desensitized:

- One super admin using the credentials above.
- Core roles and permissions.
- A small set of default model/provider/template examples for local verification.

No real business records, private customer data, online purchase records or third-party credentials are included.

## Production Build

```bash
pnpm build
pnpm prisma:migrate
pm2 start ecosystem.config.cjs
```

The NestJS API can serve the built web app behind Nginx. Configure `client_max_body_size` high enough for media and desktop installer uploads.

## Common Commands

```bash
pnpm typecheck
pnpm lint
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm openapi:emit
pnpm openapi:types
```

When changing Prisma schema or migrations, run Prisma generate, apply/check migrations for the active database, and verify the affected endpoint or query before shipping.

## Security Notes

- Do not commit `.env`, real database credentials, OSS keys, API keys or production secrets.
- `.env.example` only contains placeholders and safe Megick defaults.
- Runtime secrets for OAuth/model providers can be configured through admin panels and are encrypted with AES-256-GCM before storage.
- `megick.com`, `administrator@megick.com` and https://github.com/zeeklog/megick-studio are public project identity values, not sensitive secrets.

## Contributing

Issues and pull requests are welcome at https://github.com/zeeklog/megick-studio.

Before opening a PR, run the relevant typechecks and include Prisma/OpenAPI regeneration when your change affects database or API shape.
