declare module "soundtouchjs" {
	export class PitchShifter {
		constructor(
			context: BaseAudioContext,
			buffer: AudioBuffer,
			bufferSize: number,
		);
		tempo: number;
		pitch: number;
		rate: number;
		on(eventName: string, callback: (detail?: unknown) => void): void;
		connect(destination: AudioNode): void;
		disconnect(): void;
	}
}
