import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type Layout,
  type PanelProps,
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

type ResizablePanelGroupProps = Omit<GroupProps, "orientation" | "onLayoutChange"> & {
  direction?: GroupProps["orientation"];
  onLayout?: (sizes: number[]) => void;
};

function legacyPercentSize(size: number | string | undefined) {
  if (typeof size === "number") return `${size}%`;
  return size;
}

const ResizablePanelGroup = ({
  className,
  direction,
  onLayout,
  ...props
}: ResizablePanelGroupProps) => (
  <Group
    orientation={direction}
    onLayoutChange={onLayout ? (layout: Layout) => onLayout(Object.values(layout)) : undefined}
    className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
    {...props}
  />
);

const ResizablePanel = ({
  collapsedSize,
  defaultSize,
  maxSize,
  minSize,
  ...props
}: PanelProps) => (
  <Panel
    collapsedSize={legacyPercentSize(collapsedSize)}
    defaultSize={legacyPercentSize(defaultSize)}
    maxSize={legacyPercentSize(maxSize)}
    minSize={legacyPercentSize(minSize)}
    {...props}
  />
);

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      "relative flex w-px cursor-col-resize items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:cursor-row-resize data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
