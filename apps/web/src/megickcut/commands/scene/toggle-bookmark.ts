import { Command, type CommandResult } from "@/megickcut/commands/base-command";
import { EditorCore } from "@/megickcut/core";
import type { TScene } from "@/megickcut/timeline";
import { updateSceneInArray } from "@/megickcut/timeline/scenes";
import {
	getFrameTime,
	toggleBookmarkInArray,
} from "@/megickcut/timeline/bookmarks/index";
import { type MediaTime, ZERO_MEDIA_TIME } from "@/megickcut/wasm";

export class ToggleBookmarkCommand extends Command {
	private savedScenes: TScene[] | null = null;
	private frameTime: MediaTime = ZERO_MEDIA_TIME;

	constructor(private time: MediaTime) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const activeScene = editor.scenes.getActiveScene();
		const activeProject = editor.project.getActive();

		if (!activeScene || !activeProject) {
			return;
		}

		const scenes = editor.scenes.getScenes();
		this.savedScenes = [...scenes];

		this.frameTime = getFrameTime({
			time: this.time,
			fps: activeProject.settings.fps,
		});

		const updatedBookmarks = toggleBookmarkInArray({
			bookmarks: activeScene.bookmarks,
			frameTime: this.frameTime,
		});

		const updatedScenes = updateSceneInArray({
			scenes,
			sceneId: activeScene.id,
			updates: { bookmarks: updatedBookmarks },
		});

		editor.scenes.setScenes({ scenes: updatedScenes });
	}

	undo(): void {
		if (this.savedScenes) {
			const editor = EditorCore.getInstance();
			editor.scenes.setScenes({ scenes: this.savedScenes });
		}
	}
}
