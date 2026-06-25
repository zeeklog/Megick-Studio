# Persistent Project Rules

- When changing Prisma schema or adding database migrations, always run the relevant Prisma follow-up commands before handing the task back: generate the Prisma client, apply/check migrations for the active database, and verify the affected API endpoint or query. Do not treat typecheck alone as sufficient for database shape changes.
- For local development database operations, use the `DATABASE_URL` from `apps/api/.env.development.local`. Do not commit real database credentials; keep production secrets in deployment environment variables only.
- This project supports two storage buckets: Aliyun OSS and Cloudflare R2. The global default storage bucket is Aliyun OSS. Use Cloudflare R2 only when the user or product requirement explicitly says to use CF R2; otherwise all uploads, generated media persistence, user assets, product materials, and admin media should use the project OSS flow.

## Model Provider API Styles

- Model providers are configured with an explicit `apiStyle`, which describes the provider interface contract, not just the vendor name.
- The current persisted provider styles are `OPENAI` and `CREX` in `model_provider_configs.apiStyle`, with generation jobs snapshotting `providerApiStyleSnapshot`, `providerBaseUrlSnapshot`, `providerStatusUrlSnapshot`, `providerModelNameSnapshot`, and `providerParamsSnapshot`.
- Per-model or per-mode `defaultParams.apiStyle` may further select a sub-adapter such as `dpi-chat-completions`, `bfl-fill`, `flux2-edit`, or video-specific styles. Treat those as request protocol selectors and do not collapse them into the provider enum.
- For text-to-image, adapter selection lives in `apps/api/src/modules/generation/text2image.adapters.ts`. When fixing reference image behavior, verify the selected adapter, request URL, and payload shape together.
- CREX image generation compatible with `../chatgpt2api` expects `/v1/images/generations` style requests with `reference_images: string[]`; do not send reference images only as chat-completion `messages[].content[].image_url` unless the model is explicitly configured for a chat-completions style adapter.
- If introducing a new provider protocol, add or update the adapter explicitly and document how it maps reference images, async task polling, output parsing, and OSS persistence.

## Performance Optimization Rules

- Treat Lighthouse report issues by priority and keep the scope tight. For homepage performance work, optimize the public/homepage path first; do not change admin/back-office routes unless the task explicitly includes admin performance.
- Never introduce a new performance regression to improve a metric. After optimization, verify that the initial client entry bundle, LCP assets, and generated build artifacts did not grow unexpectedly.
- Keep route files lightweight because TanStack route tree imports route modules eagerly. Heavy page UI, dashboard panels, billing/history tables, editors, modals, markdown renderers, charts, QR code generation, and large data catalogs should live behind `lazy(() => import(...))` or route/component splitting. Route modules should keep only metadata, search validation, loaders that are required for the route, and a small Suspense shell.
- Avoid top-level imports of heavy libraries from homepage or route modules unless they are required for first paint. Examples to avoid in entry-facing modules include `zod`, `qrcode.react`, markdown renderers, editor/runtime bundles, complex Radix menus/selects/dialogs, large locale dictionaries, and long AI tool catalogs.
- For URL search validation in route modules, prefer small local validators from `apps/web/src/lib/search-params.ts` instead of `zod` when the validation is simple strings/enums/booleans/numbers. Keep behavior equivalent and type it explicitly.
- Homepage LCP images must be production-sized assets, not original PNGs. Prefer WebP/AVIF with responsive `srcSet` and preload only the exact first-viewport LCP image. Do not globally preload large legacy images.
- Task-list and history-list previews must use thumbnails, not original generated images. Prefer API-provided `thumbnailUrl`; otherwise use `/api/generation/jobs/:jobId/output/:index/content?variant=thumbnail` for generation outputs or Aliyun OSS `x-oss-process` thumbnails through `ossThumbnailUrl`. Full-resolution URLs should be reserved for explicit preview/download actions, not list thumbnails.
- Thumbnail image elements should use `loading="lazy"`, `decoding="async"`, and `referrerPolicy="no-referrer"` unless there is a clear reason not to. Do not fall back from a thumbnail preview to the full image in a list, because a failed thumbnail should not trigger a multi-MB image download.
- Do not add runtime server-side image resizing with `sharp` in hot request paths unless the requirement explicitly calls for it and caching/backpressure are designed. Prefer OSS image processing or precomputed thumbnails.
- Large locale dictionaries and long marketing/content catalogs must not be statically imported by the root entry. Keep a small app-shell locale subset for first paint and dynamically import full locale content after hydration/idle when needed.
- Third-party analytics, one-tap login, toasts, non-critical overlays, desktop-only chrome, and similar non-critical UI should load after `load`, `requestIdleCallback`, or route-specific need. Do not block FCP/LCP with these features.
- After performance changes, always run `pnpm --filter @megick/web typecheck` and a normal production build with `NODE_ENV=production pnpm exec vite build --mode production` from `apps/web`. If API thumbnail/output contracts changed, also run `pnpm --filter @megick/api typecheck`.
- If a sourcemap build is used for analysis, run a normal production build afterward and verify no `.map` files remain in `apps/web/dist/client/assets` or `apps/web/dist/server/assets`.
- Record bundle evidence after optimization: identify the main `index-*.js` size and gzip size, check for forbidden strings such as old LCP images or accidentally bundled heavy libraries, and confirm thumbnail URLs contain `variant=thumbnail` or OSS thumbnail processing where expected.
