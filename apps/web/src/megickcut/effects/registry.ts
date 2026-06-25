import { DefinitionRegistry } from "@/megickcut/params/registry";
import type { EffectDefinition } from "@/megickcut/effects/types";

export class EffectsRegistry extends DefinitionRegistry<string, EffectDefinition> {
	constructor() {
		super("effect");
	}
}

export const effectsRegistry = new EffectsRegistry();
