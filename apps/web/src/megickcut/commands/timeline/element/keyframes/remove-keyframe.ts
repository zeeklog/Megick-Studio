import { EditorCore } from "@/megickcut/core";
import {
	hasKeyframesForPath,
	removeElementKeyframe,
} from "@/megickcut/animation";
import { Command, type CommandResult } from "@/megickcut/commands/base-command";
import { updateElementInSceneTracks } from "@/megickcut/timeline";
import type { AnimationPath } from "@/megickcut/animation/types";
import type { ParamValue } from "@/megickcut/params";
import type { SceneTracks, TimelineElement } from "@/megickcut/timeline";
import { resolveAnimationTarget } from "@/megickcut/timeline/animation-targets";

function removeKeyframeAndPersist({
	element,
	propertyPath,
	keyframeId,
	valueAtPlayhead,
}: {
	element: TimelineElement;
	propertyPath: AnimationPath;
	keyframeId: string;
	valueAtPlayhead: ParamValue | null;
}): TimelineElement {
	const target = resolveAnimationTarget({ element, path: propertyPath });
	if (!target) {
		return element;
	}

	const nextAnimations = removeElementKeyframe({
		animations: element.animations,
		propertyPath,
		keyframeId,
	});

	const isChannelNowEmpty = !hasKeyframesForPath({
		animations: nextAnimations,
		propertyPath,
	});

	// When clearing all keyframes, preserve the value at the playhead (what the user was seeing)
	const shouldPersistToBase = isChannelNowEmpty && valueAtPlayhead !== null;

	const baseElement = shouldPersistToBase
		? target.setBaseValue({ value: valueAtPlayhead })
		: element;

	return { ...baseElement, animations: nextAnimations };
}

export class RemoveKeyframeCommand extends Command {
	private savedState: SceneTracks | null = null;
	private readonly trackId: string;
	private readonly elementId: string;
	private readonly propertyPath: AnimationPath;
	private readonly keyframeId: string;
	private readonly valueAtPlayhead: ParamValue | null;

	constructor({
		trackId,
		elementId,
		propertyPath,
		keyframeId,
		valueAtPlayhead,
	}: {
		trackId: string;
		elementId: string;
		propertyPath: AnimationPath;
		keyframeId: string;
		valueAtPlayhead: ParamValue | null;
	}) {
		super();
		this.trackId = trackId;
		this.elementId = elementId;
		this.propertyPath = propertyPath;
		this.keyframeId = keyframeId;
		this.valueAtPlayhead = valueAtPlayhead;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;

		const updatedTracks = updateElementInSceneTracks({
			tracks: this.savedState,
			trackId: this.trackId,
			elementId: this.elementId,
			update: (element) =>
				removeKeyframeAndPersist({
					element,
					propertyPath: this.propertyPath,
					keyframeId: this.keyframeId,
					valueAtPlayhead: this.valueAtPlayhead,
				}),
		});

		editor.timeline.updateTracks(updatedTracks);
		return undefined;
	}

	undo(): void {
		if (!this.savedState) {
			return;
		}

		const editor = EditorCore.getInstance();
		editor.timeline.updateTracks(this.savedState);
	}
}
