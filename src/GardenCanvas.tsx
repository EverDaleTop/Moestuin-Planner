import { GpuCanvas } from "./gpu/GpuCanvas";
import type { EditorTool, ElementType, GardenElement } from "./types";

interface Props {
  elements: GardenElement[];
  tool: EditorTool;
  frameType: ElementType;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  theme: "light" | "dark";
  onApplyChanges: (
    updates: { id: string; x?: number; y?: number; widthM?: number; heightM?: number }[]
  ) => void;
  onAddFrame: (
    type: ElementType,
    x: number,
    y: number,
    widthM: number,
    heightM: number
  ) => string;
}

export function GardenCanvas({
  elements,
  tool,
  frameType,
  selectedIds,
  onSelect,
  onBusyChange,
  theme,
  onApplyChanges,
  onAddFrame,
}: Props) {
  return (
    <GpuCanvas
      elements={elements}
      tool={tool}
      frameType={frameType}
      selectedIds={selectedIds}
      theme={theme}
      onSelect={onSelect}
      onApplyChanges={onApplyChanges}
      onAddFrame={onAddFrame}
      onBusyChange={onBusyChange}
    />
  );
}