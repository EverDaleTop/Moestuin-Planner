import { GpuCanvas } from "./gpu/GpuCanvas";
import type { Crop, EditorTool, ElementType, GardenElement, CropAssignment } from "./types";

interface Props {
  elements: GardenElement[];
  catalog: Crop[];
  tool: EditorTool;
  frameType: ElementType;
  selectedIds: string[];
  selectedCropId: string | null;
  onSelect: (ids: string[]) => void;
  onSelectCrop: (instanceId: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
  theme: "light" | "dark";
  onApplyChanges: (
    updates: {
      id: string;
      x?: number;
      y?: number;
      widthM?: number;
      heightM?: number;
      crops?: CropAssignment[];
    }[]
  ) => void;
  onAddFrame: (
    type: ElementType,
    x: number,
    y: number,
    widthM: number,
    heightM: number
  ) => string;
  onUpdateCrop: (eId: string, instanceId: string, patch: Partial<CropAssignment>) => void;
}

export function GardenCanvas({
  elements,
  catalog,
  tool,
  frameType,
  selectedIds,
  selectedCropId,
  onSelect,
  onSelectCrop,
  onBusyChange,
  theme,
  onApplyChanges,
  onAddFrame,
  onUpdateCrop,
}: Props) {
  return (
    <GpuCanvas
      elements={elements}
      catalog={catalog}
      tool={tool}
      frameType={frameType}
      selectedIds={selectedIds}
      selectedCropId={selectedCropId}
      theme={theme}
      onSelect={onSelect}
      onSelectCrop={onSelectCrop}
      onApplyChanges={onApplyChanges}
      onAddFrame={onAddFrame}
      onUpdateCrop={onUpdateCrop}
      onBusyChange={onBusyChange}
    />
  );
}