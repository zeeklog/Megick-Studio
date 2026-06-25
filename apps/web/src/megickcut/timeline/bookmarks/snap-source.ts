import type { Bookmark } from "@/megickcut/timeline";
import type { SnapPoint } from "@/megickcut/timeline/snapping";
import type { MediaTime } from "@/megickcut/wasm";

export function getBookmarkSnapPoints({
	bookmarks,
	excludeBookmarkTime,
}: {
	bookmarks: Bookmark[];
	excludeBookmarkTime?: MediaTime;
}): SnapPoint[] {
	return bookmarks.flatMap((bookmark) => {
		if (excludeBookmarkTime != null && bookmark.time === excludeBookmarkTime) {
			return [];
		}

		return [
			{ time: bookmark.time, type: "bookmark" satisfies SnapPoint["type"] },
		];
	});
}
