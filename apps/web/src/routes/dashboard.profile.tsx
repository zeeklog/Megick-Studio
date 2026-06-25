import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { Bell, Download, Image as ImageIcon, Lock, Loader2, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/useAuth";
import { apiPost, apiPatch } from "@/lib/api-client";
import { uploadDirectOssAsset } from "@/lib/oss-upload";
import type { MeResponse } from "@megick/api-types";
import { ProfileField } from "./-dashboard-components";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  clearPendingExplicitLocaleSync,
  getInitialLocale,
  localeLabels,
  normalizeLocale,
  persistExplicitLocalePreference,
  supportedLocales,
  translate,
  useI18n,
  type AppLocale,
} from "@/lib/i18n";

const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const AVATAR_EXPORT_SIZE = 512;
const AVATAR_UPLOAD_PREFIX = "avatars";
const AVATAR_ACCEPT = ".png,.jpg,.jpeg,image/png,image/jpeg";

type AvatarContentType = "image/png" | "image/jpeg";
type PasswordForm = { currentPassword: string; newPassword: string; confirmPassword: string };
type ProfileForm = { displayName: string; avatarUrl: string; locale: AppLocale };
type AvatarCropImage = {
  file: File;
  url: string;
  width: number;
  height: number;
  contentType: AvatarContentType;
};
type AvatarCrop = { x: number; y: number; size: number };

export const Route = createFileRoute("/dashboard/profile")({
  head: () => ({
    meta: [
      { title: translate(getInitialLocale(), "profile.meta.title") },
      { name: "description", content: translate(getInitialLocale(), "profile.meta.description") },
    ],
  }),
  component: ProfileRoute,
});

function ProfileRoute() {
  const { t, locale, setLocale } = useI18n();
  const { user } = useAuth();
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordLoading, setPasswordLoading] = useState(false);
  
  const queryClient = useQueryClient();
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    displayName: user?.displayName || "", 
    avatarUrl: user?.avatarUrl || "", 
    locale,
  });
  const [localeDirty, setLocaleDirty] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifLowCredit, setNotifLowCredit] = useState(true);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      displayName: user.displayName || "",
      avatarUrl: user.avatarUrl || "",
      locale,
    });
    setLocaleDirty(false);
  }, [user, locale]);

  const handleUpdateProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileLoading(true);
    try {
      const updatedProfile = await apiPatch<{
        displayName?: string;
        avatarUrl?: string | null;
        locale?: AppLocale;
        localeSource?: "device" | "explicit";
        localeUpdatedAt?: string | null;
      }>("/api/users/me", {
        displayName: profileForm.displayName,
        ...(localeDirty ? { locale: profileForm.locale } : {}),
        ...(profileForm.avatarUrl !== (user?.avatarUrl || "") ? { avatarUrl: profileForm.avatarUrl } : {}),
      });
      if (localeDirty) setLocale(profileForm.locale, { explicit: true });
      if (localeDirty && updatedProfile.localeUpdatedAt) {
        persistExplicitLocalePreference(profileForm.locale, updatedProfile.localeUpdatedAt);
        clearPendingExplicitLocaleSync(profileForm.locale);
      }
      queryClient.setQueryData<MeResponse>(["auth", "me"], (current) => {
        if (!current?.user) return current;
        return {
          ...current,
          user: {
            ...current.user,
            displayName: updatedProfile.displayName ?? current.user.displayName,
            avatarUrl: "avatarUrl" in updatedProfile ? (updatedProfile.avatarUrl ?? undefined) : current.user.avatarUrl,
            locale: updatedProfile.locale ?? current.user.locale,
            localeSource: updatedProfile.localeSource ?? current.user.localeSource,
            localeUpdatedAt: updatedProfile.localeUpdatedAt ?? current.user.localeUpdatedAt,
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setLocaleDirty(false);
      toast.success(t("profile.updated"));
    } catch (err) {
      toast.error(t("profile.updateFailed"), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setProfileLoading(false);
    }
  };
  
  const handleExportData = async () => {
    try {
      await apiPost("/api/users/me/export");
    } catch (err) {
      toast.error(t("profile.exportFailed"), { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordForm.newPassword.length < 8) {
      toast.error(t("profile.passwordTooShort"));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error(t("profile.passwordMismatch"));
      return;
    }
    setPasswordLoading(true);
    try {
      await apiPost("/api/auth/password", { currentPassword: passwordForm.currentPassword || undefined, newPassword: passwordForm.newPassword });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success(t("profile.passwordUpdated"));
    } catch (err) {
      toast.error(t("profile.passwordUpdateFailed"), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!user) return null;

  return (
    <ProfilePanel
      user={user}
      passwordForm={passwordForm}
      setPasswordForm={setPasswordForm}
      passwordLoading={passwordLoading}
      onSubmit={handleChangePassword}
      profileForm={profileForm}
      setProfileForm={setProfileForm}
      profileLoading={profileLoading}
      onUpdateProfile={handleUpdateProfile}
      onExportData={handleExportData}
      notifEmail={notifEmail}
      setNotifEmail={setNotifEmail}
      notifLowCredit={notifLowCredit}
      setNotifLowCredit={setNotifLowCredit}
      setLocaleDirty={setLocaleDirty}
    />
  );
}

function ProfilePanel({
  user,
  passwordForm,
  setPasswordForm,
  passwordLoading,
  onSubmit,
  profileForm,
  setProfileForm,
  profileLoading,
  onUpdateProfile,
  onExportData,
  notifEmail,
  setNotifEmail,
  notifLowCredit,
  setNotifLowCredit,
  setLocaleDirty,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  passwordForm: PasswordForm;
  setPasswordForm: Dispatch<SetStateAction<PasswordForm>>;
  passwordLoading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  profileForm: ProfileForm;
  setProfileForm: Dispatch<SetStateAction<ProfileForm>>;
  profileLoading: boolean;
  onUpdateProfile: (event: FormEvent<HTMLFormElement>) => void;
  onExportData: () => void;
  notifEmail: boolean;
  setNotifEmail: (v: boolean) => void;
  notifLowCredit: boolean;
  setNotifLowCredit: (v: boolean) => void;
  setLocaleDirty: (v: boolean) => void;
}) {
  const { t, formatNumber } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarCropImage, setAvatarCropImage] = useState<AvatarCropImage | null>(null);
  const [avatarCrop, setAvatarCrop] = useState<AvatarCrop | null>(null);
  const profileName = profileForm.displayName || user.displayName || user.email;
  const avatarInitials = initialsForAvatar(profileName);
  const avatarSrc = profileForm.avatarUrl || user.avatarUrl || undefined;

  useEffect(() => {
    return () => {
      if (avatarCropImage?.url) URL.revokeObjectURL(avatarCropImage.url);
    };
  }, [avatarCropImage?.url]);

  const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const contentType = avatarContentTypeFromFile(file);
    if (!contentType) {
      toast.error(t("profile.avatarInvalidType"));
      return;
    }
    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      toast.error(t("profile.avatarTooLarge"));
      return;
    }

    try {
      const nextImage = await readAvatarImage(file, contentType);
      setAvatarCropImage(nextImage);
      setAvatarCrop(defaultAvatarCrop(nextImage));
      setAvatarDialogOpen(true);
    } catch (err) {
      toast.error(t("profile.avatarSelectFailed"), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleAvatarUpload = async () => {
    if (!avatarCropImage || !avatarCrop) return;
    setAvatarUploading(true);
    try {
      const cropped = await cropAvatarToBlob(avatarCropImage, avatarCrop);
      if (cropped.size > AVATAR_MAX_SIZE_BYTES) throw new Error(t("profile.avatarTooLarge"));
      const uploaded = await uploadDirectOssAsset({
        file: cropped,
        name: `avatar.${avatarCropImage.contentType === "image/png" ? "png" : "jpg"}`,
        prefix: AVATAR_UPLOAD_PREFIX,
        maxSizeBytes: AVATAR_MAX_SIZE_BYTES,
      });
      if (!uploaded) throw new Error(t("profile.ossMissing"));
      setProfileForm((current) => ({ ...current, avatarUrl: uploaded.signedUrl }));
      setAvatarDialogOpen(false);
      setAvatarCropImage(null);
      setAvatarCrop(null);
      toast.success(t("profile.avatarUploaded"), {
        description: t("profile.avatarUploadSuccessDesc"),
      });
    } catch (err) {
      toast.error(t("profile.avatarUploadFailed"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">{t("profile.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("profile.description")}
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ProfileField label={t("profile.email")} value={user.email} />
          <ProfileField label={t("profile.displayName")} value={user.displayName || "-"} />
          <ProfileField label={t("profile.role")} value={user.role} />
          <ProfileField label={t("profile.creditMode")} value={t("profile.creditModeManual")} />
          <ProfileField label={t("profile.credits")} value={formatNumber(user.credits)} />
        </div>
        <Separator className="my-6" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col rounded-lg border border-border bg-background/35 p-4">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">{t("profile.dataExport")}</p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground flex-1">
              {t("profile.dataExportDescription")}
            </p>
            <Button onClick={onExportData} variant="outline" size="sm" className="mt-4 w-full">
              {t("profile.exportData")}
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-background/35 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">{t("profile.notifications")}</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground" htmlFor="notif-email">
                  {t("profile.emailAlerts")}
                </Label>
                <Switch id="notif-email" checked={notifEmail} onCheckedChange={setNotifEmail} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground" htmlFor="notif-low-credit">
                  {t("profile.lowCredit")}
                </Label>
                <Switch id="notif-low-credit" checked={notifLowCredit} onCheckedChange={setNotifLowCredit} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-6">
        <form className="rounded-lg border border-border bg-card p-5" onSubmit={onUpdateProfile}>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{t("profile.updateDetails")}</h2>
          </div>
          <div className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>{t("profile.avatar")}</Label>
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20 rounded-lg">
                  <AvatarImage src={avatarSrc} alt={t("profile.avatarPreview")} />
                  <AvatarFallback className="rounded-lg bg-primary/10 text-base font-semibold text-primary">
                    {avatarInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <input
                    ref={fileInputRef}
                    className="sr-only"
                    type="file"
                    accept={AVATAR_ACCEPT}
                    onChange={handleAvatarFileChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading || profileLoading}
                  >
                    {avatarUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {avatarSrc ? t("profile.avatarReplace") : t("profile.avatarUpload")}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("profile.avatarRequirements")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="display-name">{t("profile.displayName")}</Label>
              <Input
                id="display-name"
                maxLength={80}
                value={profileForm.displayName}
                onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="locale">{t("profile.language")}</Label>
              <Select
                value={profileForm.locale}
                onValueChange={(value) =>
                  {
                    setLocaleDirty(true);
                    setProfileForm({ ...profileForm, locale: normalizeLocale(value) });
                  }
                }
              >
                <SelectTrigger id="locale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedLocales.map((item) => (
                    <SelectItem key={item} value={item}>
                      {localeLabels[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={profileLoading}>
              {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("profile.saveChanges")}
            </Button>
          </div>
        </form>

        <form className="rounded-lg border border-border bg-card p-5" onSubmit={onSubmit}>
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">{t("profile.changePassword")}</h2>
        </div>
        <div className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">{t("profile.currentPassword")}</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={passwordForm.currentPassword}
              onChange={(event) =>
                setPasswordForm({ ...passwordForm, currentPassword: event.target.value })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">{t("profile.newPassword")}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">{t("profile.confirmPassword")}</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={passwordForm.confirmPassword}
              onChange={(event) =>
                setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })
              }
            />
          </div>
          <Button type="submit" disabled={passwordLoading}>
            {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {t("profile.updatePassword")}
          </Button>
        </div>
        </form>
      </div>

      <AvatarCropDialog
        crop={avatarCrop}
        image={avatarCropImage}
        open={avatarDialogOpen}
        uploading={avatarUploading}
        onCropChange={setAvatarCrop}
        onOpenChange={setAvatarDialogOpen}
        onReset={() => avatarCropImage && setAvatarCrop(defaultAvatarCrop(avatarCropImage))}
        onUpload={handleAvatarUpload}
      />
    </div>
  );
}

function AvatarCropDialog({
  crop,
  image,
  open,
  uploading,
  onCropChange,
  onOpenChange,
  onReset,
  onUpload,
}: {
  crop: AvatarCrop | null;
  image: AvatarCropImage | null;
  open: boolean;
  uploading: boolean;
  onCropChange: Dispatch<SetStateAction<AvatarCrop | null>>;
  onOpenChange: (open: boolean) => void;
  onReset: () => void;
  onUpload: () => void;
}) {
  const { t } = useI18n();
  const zoom = useMemo(() => {
    if (!image || !crop) return 1;
    return Math.min(3, Math.max(1, Math.min(image.width, image.height) / crop.size));
  }, [crop, image]);
  const maxX = image && crop ? Math.max(0, image.width - crop.size) : 0;
  const maxY = image && crop ? Math.max(0, image.height - crop.size) : 0;
  const previewStyle = useMemo(() => {
    if (!image || !crop) return undefined;
    const previewSize = 288;
    const scale = previewSize / crop.size;
    return {
      height: `${image.height * scale}px`,
      transform: `translate(${-crop.x * scale}px, ${-crop.y * scale}px)`,
      width: `${image.width * scale}px`,
    };
  }, [crop, image]);

  const updateCrop = (patch: Partial<AvatarCrop>) => {
    if (!image) return;
    onCropChange((current) => clampAvatarCrop({ ...(current ?? defaultAvatarCrop(image)), ...patch }, image));
  };

  const updateZoom = (value: number[]) => {
    if (!image || !crop) return;
    const nextZoom = value[0] ?? 1;
    const nextSize = Math.min(image.width, image.height) / nextZoom;
    const centerX = crop.x + crop.size / 2;
    const centerY = crop.y + crop.size / 2;
    onCropChange(
      clampAvatarCrop(
        { size: nextSize, x: centerX - nextSize / 2, y: centerY - nextSize / 2 },
        image,
      ),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("profile.avatarCropTitle")}</DialogTitle>
          <DialogDescription>{t("profile.avatarRequirements")}</DialogDescription>
        </DialogHeader>

        {image && crop ? (
          <div className="space-y-5">
            <div className="mx-auto aspect-square w-full max-w-72 overflow-hidden rounded-lg border border-border bg-muted">
              <img
                src={image.url}
                alt={t("profile.avatarPreview")}
                className="max-w-none select-none"
                draggable={false}
                style={previewStyle}
              />
            </div>

            <div className="space-y-4">
              <AvatarSlider
                label={t("profile.cropZoom")}
                max={3}
                min={1}
                step={0.01}
                value={zoom}
                onChange={updateZoom}
              />
              <AvatarSlider
                disabled={maxX === 0}
                label={t("profile.cropHorizontal")}
                max={maxX}
                min={0}
                step={1}
                value={Math.min(crop.x, maxX)}
                onChange={(value) => updateCrop({ x: value[0] ?? 0 })}
              />
              <AvatarSlider
                disabled={maxY === 0}
                label={t("profile.cropVertical")}
                max={maxY}
                min={0}
                step={1}
                value={Math.min(crop.y, maxY)}
                onChange={(value) => updateCrop({ y: value[0] ?? 0 })}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={onReset} disabled={uploading || !image}>
            <RotateCcw className="h-4 w-4" />
            {t("profile.cropReset")}
          </Button>
          <Button type="button" onClick={onUpload} disabled={uploading || !image || !crop}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            {t("profile.cropAndUpload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AvatarSlider({
  disabled,
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: number[]) => void;
  step: number;
  value: number;
}) {
  const safeMax = Math.max(max, min);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs text-muted-foreground">{label}</Label>
      </div>
      <Slider
        disabled={disabled}
        max={safeMax}
        min={min}
        onValueChange={onChange}
        step={step}
        value={[Math.min(Math.max(value, min), safeMax)]}
      />
    </div>
  );
}

function avatarContentTypeFromFile(file: File): AvatarContentType | null {
  const lowerName = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type === "image/png" || lowerName.endsWith(".png")) return "image/png";
  if (type === "image/jpeg" || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return null;
}

function defaultAvatarCrop(image: AvatarCropImage): AvatarCrop {
  const size = Math.min(image.width, image.height);
  return {
    size,
    x: Math.round((image.width - size) / 2),
    y: Math.round((image.height - size) / 2),
  };
}

function clampAvatarCrop(crop: AvatarCrop, image: AvatarCropImage): AvatarCrop {
  const minSize = Math.max(64, Math.min(image.width, image.height) / 3);
  const maxSize = Math.min(image.width, image.height);
  const size = Math.min(maxSize, Math.max(minSize, crop.size));
  return {
    size,
    x: Math.round(Math.min(Math.max(0, crop.x), Math.max(0, image.width - size))),
    y: Math.round(Math.min(Math.max(0, crop.y), Math.max(0, image.height - size))),
  };
}

async function readAvatarImage(file: File, contentType: AvatarContentType): Promise<AvatarCropImage> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    return {
      file,
      url,
      width: image.naturalWidth,
      height: image.naturalHeight,
      contentType,
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error("Invalid image"));
        return;
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error("Image could not be loaded"));
    image.src = src;
  });
}

async function cropAvatarToBlob(imageInfo: AvatarCropImage, crop: AvatarCrop) {
  const image = await loadImage(imageInfo.url);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_EXPORT_SIZE;
  canvas.height = AVATAR_EXPORT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.size,
    crop.size,
    0,
    0,
    AVATAR_EXPORT_SIZE,
    AVATAR_EXPORT_SIZE,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image export failed"))),
      imageInfo.contentType,
      imageInfo.contentType === "image/jpeg" ? 0.9 : undefined,
    );
  });
}

function initialsForAvatar(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "U";
  const letters = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return letters || trimmed.slice(0, 2).toUpperCase();
}
