import { createContext, useContext, type ReactNode } from "react";

export interface MegickEditorContextValue {
	sessionId: string;
	sessionTitle: string;
	sourceMessageId?: string;
	sourceResultId?: string;
	returnToStudio?: () => void;
}

const MegickEditorContext = createContext<MegickEditorContextValue | null>(null);

export function MegickEditorContextProvider({
	value,
	children,
}: {
	value: MegickEditorContextValue;
	children: ReactNode;
}) {
	return (
		<MegickEditorContext.Provider value={value}>
			{children}
		</MegickEditorContext.Provider>
	);
}

export function useMegickEditorContext() {
	const context = useContext(MegickEditorContext);
	if (!context) {
		throw new Error("Megick editor context is unavailable");
	}
	return context;
}
