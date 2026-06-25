import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";
import type { AIImageEditMode, Prisma } from "@prisma/client";
import {
  ModelProvidersService,
  type ResolvedModelProvider,
} from "../model-providers/model-providers.service";

export interface ImageEditModeUpsertInput {
  id?: string;
  code: string;
  name: string;
  providerId?: string | null;
  modelName: string;
  requiresMask?: boolean;
  defaultParams?: Record<string, unknown>;
  costCredits?: number;
  isActive?: boolean;
  sortOrder?: number;
  description?: string;
}

export interface ResolvedImageEditMode {
  id: string;
  code: string;
  name: string;
  modelName: string;
  requiresMask: boolean;
  defaultParams: Record<string, unknown>;
  costCredits: number;
  provider: ResolvedModelProvider;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function containsCjk(value: unknown) {
  return typeof value === "string" && /[\u4e00-\u9fff]/u.test(value);
}

function fieldsContainCjk(value: unknown) {
  return Array.isArray(value) && containsCjk(JSON.stringify(value));
}

function outpaintFields() {
  return [
    {
      name: "prompt",
      label: "Outpaint prompt",
      type: "textarea",
      required: false,
      placeholder: "Describe the extended area, lighting, and style",
    },
    {
      name: "aspect_ratio",
      label: "Target ratio",
      type: "select",
      required: false,
      defaultValue: "1:1",
      options: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"],
    },
    {
      name: "direction",
      label: "Direction",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        "all",
        "left",
        "right",
        "top",
        "bottom",
        "horizontal",
        "vertical",
      ],
    },
    {
      name: "padding_percent",
      label: "Expansion (%)",
      type: "number",
      required: false,
      defaultValue: 30,
      placeholder: "10-100",
    },
    {
      name: "seed",
      label: "Seed",
      type: "number",
      required: false,
      placeholder: "Empty = random",
    },
  ];
}

function defaultParamsForMode(code: string) {
  if (code === "smart-erase") {
    return {
      apiStyle: "bfl-erase",
      requestModelName: "flux-erase",
      promptRequired: false,
      maskRequired: true,
      fields: [],
      output_format: "png",
      response_format: "url",
      dilate_pixels: 10,
      safety_tolerance: 4,
      maxInputMegapixels: 4,
      maxInputSide: 2048,
      normalizeMask: true,
      pollAttempts: 180,
      pollIntervalMs: 2000,
    };
  }
  if (code === "local-replace") {
    return {
      apiStyle: "bfl-fill",
      requestModelName: "flux-pro-1.0-fill",
      promptRequired: true,
      maskRequired: true,
      fields: [
        {
          name: "prompt",
          label: "Replacement prompt",
          type: "textarea",
          required: true,
          placeholder: "Describe what should replace the selected area",
        },
      ],
      output_format: "png",
      response_format: "url",
      steps: 15,
      guidance: 30,
      safety_tolerance: 4,
      maxInputMegapixels: 4,
      maxInputSide: 2048,
      normalizeMask: true,
      pollAttempts: 180,
      pollIntervalMs: 2000,
    };
  }
  if (code === "outpaint") {
    return {
      apiStyle: "flux2-edit",
      requestModelName: "flux-2-pro-preview",
      promptRequired: false,
      defaultPrompt:
        "Extend the image naturally while preserving the original style.",
      maskRequired: false,
      fields: outpaintFields(),
      output_format: "png",
      response_format: "url",
      pollAttempts: 180,
      pollIntervalMs: 2000,
    };
  }
  return {
    apiStyle: "flux2-edit",
    requestModelName: "flux-2-pro-preview",
    promptRequired: true,
    maskRequired: false,
    fields: [
      {
        name: "prompt",
        label: "Edit prompt",
        type: "textarea",
        required: true,
        placeholder: "Describe how to change this image",
      },
    ],
    output_format: "png",
    pollAttempts: 180,
    pollIntervalMs: 2000,
  };
}

const DEFAULT_IMAGE_EDIT_MODES = [
  {
    code: "smart-erase",
    name: "Smart erase",
    modelName: "flux-erase",
    requiresMask: true,
    defaultParams: defaultParamsForMode("smart-erase"),
    sortOrder: 10,
    description: "Use Model to erase selected regions.",
  },
  {
    code: "local-replace",
    name: "Local replace",
    modelName: "flux-pro-1.0-fill",
    requiresMask: true,
    defaultParams: defaultParamsForMode("local-replace"),
    sortOrder: 20,
    description: "Use Model to replace selected regions from a prompt.",
  },
  {
    code: "outpaint",
    name: "Outpaint",
    modelName: "flux-2-pro-preview",
    requiresMask: false,
    defaultParams: defaultParamsForMode("outpaint"),
    sortOrder: 30,
    description: "Use Image Pro Preview for prompt-guided outpainting.",
  },
  {
    code: "text-edit",
    name: "Text edit",
    modelName: "flux-2-pro-preview",
    requiresMask: false,
    defaultParams: defaultParamsForMode("text-edit"),
    sortOrder: 40,
    description: "Use Image Pro Preview for prompt-only image editing.",
  },
];

@Injectable()
export class AiImageEditModesService implements OnModuleInit {
  private readonly logger = new Logger(AiImageEditModesService.name);
  private defaultsSynced = false;
  private defaultsSyncPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ModelProvidersService,
  ) {}

  onModuleInit() {
    void this.ensureDefaults();
  }

  async listPublic() {
    await this.ensureDefaults();
    const modes = await this.prisma.aIImageEditMode.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        modelName: true,
        requiresMask: true,
        defaultParams: true,
        costCredits: true,
        sortOrder: true,
        description: true,
      },
    });
    return modes.map((mode) => ({
      ...mode,
      defaultParams: asRecord(mode.defaultParams),
    }));
  }

  async listAdmin() {
    await this.ensureDefaults();
    const modes = await this.prisma.aIImageEditMode.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        provider: {
          select: {
            id: true,
            code: true,
            name: true,
            baseUrl: true,
            apiStyle: true,
            statusUrl: true,
            maxPollDurationMs: true,
            pollIntervalMs: true,
            maxPollAttempts: true,
            isActive: true,
          },
        },
      },
    });
    return modes.map((mode) => ({
      ...mode,
      defaultParams: asRecord(mode.defaultParams),
    }));
  }

  async upsert(input: ImageEditModeUpsertInput) {
    await this.ensureDefaults();
    const data = {
      code: input.code.trim(),
      name: input.name.trim(),
      providerId: input.providerId || null,
      modelName: input.modelName.trim(),
      requiresMask: input.requiresMask ?? false,
      defaultParams: (input.defaultParams ?? {}) as Prisma.InputJsonValue,
      costCredits: Math.max(0, Math.round(input.costCredits ?? 1)),
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
      description: input.description,
    };
    const mode = input.id
      ? await this.prisma.aIImageEditMode.update({
          where: { id: input.id },
          data,
          include: { provider: true },
        })
      : await this.prisma.aIImageEditMode.upsert({
          where: { code: data.code },
          update: data,
          create: data,
          include: { provider: true },
        });
    return {
      ...mode,
      defaultParams: asRecord(mode.defaultParams),
    };
  }

  async delete(code: string) {
    const mode = await this.prisma.aIImageEditMode.delete({ where: { code } });
    return {
      ...mode,
      defaultParams: asRecord(mode.defaultParams),
    };
  }

  async resolve(code: string): Promise<ResolvedImageEditMode> {
    await this.ensureDefaults();
    const mode = await this.prisma.aIImageEditMode.findUnique({
      where: { code },
    });
    if (!mode || !mode.isActive) throw new NotFoundException();
    const provider = await this.providers.resolve(mode.providerId);
    if (!provider)
      throw new NotFoundException("IMAGE_EDIT_PROVIDER_NOT_CONFIGURED");
    return {
      id: mode.id,
      code: mode.code,
      name: mode.name,
      modelName: mode.modelName,
      requiresMask: mode.requiresMask,
      defaultParams: asRecord(mode.defaultParams),
      costCredits: mode.costCredits,
      provider,
    };
  }

  private async ensureDefaults() {
    if (this.defaultsSynced) return;
    if (!this.defaultsSyncPromise) {
      this.defaultsSyncPromise = this.syncDefaults()
        .then(() => {
          this.defaultsSynced = true;
        })
        .catch((err) => {
          this.logger.error(
            `Failed to sync default AI image edit modes: ${(err as Error).message}`,
          );
        })
        .finally(() => {
          this.defaultsSyncPromise = null;
        });
    }
    await this.defaultsSyncPromise;
  }

  private async syncDefaults() {
    const providers = await this.providers.listAdmin();
    const magickProviderId = providers.find(
      (provider) => provider.code === "magickapi",
    )?.id;
    for (const definition of DEFAULT_IMAGE_EDIT_MODES) {
      const existing = await this.prisma.aIImageEditMode.findUnique({
        where: { code: definition.code },
        select: {
          id: true,
          name: true,
          description: true,
          providerId: true,
          modelName: true,
          requiresMask: true,
          defaultParams: true,
        },
      });
      if (existing) {
        const current = asRecord(existing.defaultParams);
        const data: Prisma.AIImageEditModeUpdateInput = {};
        if (containsCjk(existing.name)) {
          data.name = definition.name;
        }
        if (containsCjk(existing.description)) {
          data.description = definition.description;
        }
        if (!existing.providerId && magickProviderId) {
          data.provider = { connect: { id: magickProviderId } };
        }
        if (existing.modelName !== definition.modelName) {
          data.modelName = definition.modelName;
        }
        if (existing.requiresMask !== definition.requiresMask) {
          data.requiresMask = definition.requiresMask;
        }
        if (definition.code === "smart-erase") {
          const defaults = defaultParamsForMode("smart-erase");
          const {
            defaultPrompt: _defaultPrompt,
            guidance: _guidance,
            steps: _steps,
            ...rest
          } = current;
          data.defaultParams = {
            ...rest,
            apiStyle: defaults.apiStyle,
            requestModelName: defaults.requestModelName,
            promptRequired: defaults.promptRequired,
            maskRequired: defaults.maskRequired,
            fields: defaults.fields,
            output_format: current.output_format ?? defaults.output_format,
            response_format:
              current.response_format ?? defaults.response_format,
            dilate_pixels: current.dilate_pixels ?? defaults.dilate_pixels,
            safety_tolerance:
              current.safety_tolerance ?? defaults.safety_tolerance,
            maxInputMegapixels:
              current.maxInputMegapixels ?? defaults.maxInputMegapixels,
            maxInputSide: current.maxInputSide ?? defaults.maxInputSide,
            normalizeMask: current.normalizeMask ?? defaults.normalizeMask,
            pollAttempts: current.pollAttempts ?? defaults.pollAttempts,
            pollIntervalMs: current.pollIntervalMs ?? defaults.pollIntervalMs,
          } as Prisma.InputJsonValue;
        }
        if (definition.code === "local-replace") {
          const defaults = defaultParamsForMode("local-replace");
          data.defaultParams = {
            ...current,
            apiStyle: defaults.apiStyle,
            requestModelName: defaults.requestModelName,
            promptRequired: defaults.promptRequired,
            maskRequired: defaults.maskRequired,
            fields: fieldsContainCjk(current.fields) || !Array.isArray(current.fields)
              ? defaults.fields
              : current.fields,
            output_format: current.output_format ?? defaults.output_format,
            response_format:
              current.response_format ?? defaults.response_format,
            steps: current.steps ?? defaults.steps,
            guidance: current.guidance ?? defaults.guidance,
            safety_tolerance:
              current.safety_tolerance ?? defaults.safety_tolerance,
            maxInputMegapixels:
              current.maxInputMegapixels ?? defaults.maxInputMegapixels,
            maxInputSide: current.maxInputSide ?? defaults.maxInputSide,
            normalizeMask: current.normalizeMask ?? defaults.normalizeMask,
            pollAttempts: current.pollAttempts ?? defaults.pollAttempts,
            pollIntervalMs: current.pollIntervalMs ?? defaults.pollIntervalMs,
          } as Prisma.InputJsonValue;
        }
        if (definition.code === "outpaint") {
          const fields = Array.isArray(current.fields) ? current.fields : [];
          const hasPadding = fields.some(
            (field) => asRecord(field).name === "padding_percent",
          );
          const hasPrompt = fields.some(
            (field) => asRecord(field).name === "prompt",
          );
          if (!hasPadding || !hasPrompt || fieldsContainCjk(current.fields)) {
            data.defaultParams = {
              ...current,
              fields: outpaintFields(),
            } as Prisma.InputJsonValue;
          }
        }
        if (definition.code === "text-edit" && fieldsContainCjk(current.fields)) {
          data.defaultParams = {
            ...current,
            fields: defaultParamsForMode("text-edit").fields,
          } as Prisma.InputJsonValue;
        }
        if (Object.keys(data).length > 0) {
          await this.prisma.aIImageEditMode.update({
            where: { id: existing.id },
            data,
          });
        }
        continue;
      }
      await this.prisma.aIImageEditMode.create({
        data: {
          code: definition.code,
          name: definition.name,
          providerId: magickProviderId ?? null,
          modelName: definition.modelName,
          requiresMask: definition.requiresMask,
          defaultParams: definition.defaultParams as Prisma.InputJsonValue,
          costCredits: 1,
          isActive: Boolean(magickProviderId),
          sortOrder: definition.sortOrder,
          description: definition.description,
        },
      });
    }
  }
}
