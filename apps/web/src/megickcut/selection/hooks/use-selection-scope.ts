import { useEffect, useState } from "react";
import { useCommittedRef } from "@/megickcut/hooks/use-committed-ref";
import { useSelectionContext } from "@/megickcut/selection/context";
import { activateScope, type ScopeEntry } from "@/megickcut/selection/scope";

export function useSelectionScope() {
	const { selectedIds, clearSelection } = useSelectionContext();
	const hasSelection = selectedIds.length > 0;
	const hasSelectionRef = useCommittedRef(hasSelection);
	const clearSelectionRef = useCommittedRef(clearSelection);
	const [entry] = useState<ScopeEntry>(() => ({
		hasSelection: () => hasSelectionRef.current,
		clear: () => {
			clearSelectionRef.current();
		},
	}));

	useEffect(() => {
		if (!hasSelection) {
			return;
		}

		return activateScope({ entry });
	}, [entry, hasSelection]);
}
