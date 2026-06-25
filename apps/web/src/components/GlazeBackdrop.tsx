import { Shader, ChromaFlow, FilmGrain, FlutedGlass, Swirl } from "shaders/react";
import { useAppTheme, type AppTheme } from "@/lib/theme";

const SHADER_COLORS: Record<
  AppTheme,
  {
    swirlA: string;
    swirlB: string;
    chromaBase: string;
    chromaAccent: string;
  }
> = {
  light: {
    swirlA: "#ffffff",
    swirlB: "#f0f0f0",
    chromaBase: "#ffffff",
    chromaAccent: "#ff5f03",
  },
  dark: {
    swirlA: "#1a160b",
    swirlB: "#0e0b05",
    chromaBase: "#151107",
    chromaAccent: "#f6c330",
  },
};

export function GlazeBackdrop({ className = "pointer-events-none absolute inset-0" }: { className?: string }) {
  const { effectiveTheme } = useAppTheme();
  const shaderColors = SHADER_COLORS[effectiveTheme];

  return (
    <Shader className={className}>
      <Swirl colorA={shaderColors.swirlA} colorB={shaderColors.swirlB} detail={1.7} />
      <ChromaFlow
        baseColor={shaderColors.chromaBase}
        downColor={shaderColors.chromaAccent}
        leftColor={shaderColors.chromaAccent}
        momentum={13}
        radius={3.5}
        rightColor={shaderColors.chromaAccent}
        upColor={shaderColors.chromaAccent}
      />
      <FlutedGlass
        aberration={0.61}
        angle={31}
        frequency={8}
        highlight={0.12}
        highlightSoftness={0}
        lightAngle={-90}
        refraction={4}
        shape="rounded"
        softness={1}
        speed={0.15}
      />
      <FilmGrain strength={0.05} />
    </Shader>
  );
}
