import type { SnapPoint } from "@/megickcut/timeline/snapping";
import type { MediaTime } from "@/megickcut/wasm";

export function getPlayheadSnapPoints({
	playheadTime,
}: {
	playheadTime: MediaTime;
}): SnapPoint[] {
	return [{ time: playheadTime, type: "playhead" }];
}
