import { GpuCanvas } from "./gpu/GpuCanvas";
import type { Crop, EditorTool, GardenElement, CropAssignment, GardenObjectKey } from "./types";
import type { PreviewPayload } from "./realtime";

interface Props {
  elements: GardenElement[];
  catalog: Crop[];
  tool: EditorTool;
  frameType: "bed" | "path";
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
      gaas?: import("./types").GaasData;
    }[]
  ) => void;
  onLiveMove?: (updates: { id: string; x?: number; y?: number; widthM?: number; heightM?: number; crops?: CropAssignment[] }[]) => void;
  onLivePreview?: (preview: PreviewPayload) => void;
  livePreview?: PreviewPayload | null;
  onAddFrame: (
    type: "bed" | "path",
    x: number,
    y: number,
    widthM: number,
    heightM: number
  ) => string;
  onAddObject: (
    key: GardenObjectKey,
    x: number,
    y: number,
    gaas?: import("./types").GaasData
  ) => string;
  objectMenuOpen: boolean;
  onObjectMenuOpenChange: (open: boolean) => void;
  onUpdateCrop: (eId: string, instanceId: string, patch: Partial<CropAssignment>) => void;
  /** magnetisch uitlijnen aan/uit */
  snap: boolean;
  /** tekent een nieuw stuk gewas in een bed (wereld-px) */
  onAddCropAt: (bedId: string, wx: number, wy: number, w: number, h: number) => void;
  /** gewas dat voor nieuwe stukken gebruikt wordt */
  activeCropId: string | null;
  /** centreer de camera op een wereldpunt (bv. na "toon in tuin") */
  focusSignal?: { x: number; y: number; n: number } | null;
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
  onLiveMove,
  onLivePreview,
  livePreview,
  onAddFrame,
  onAddObject,
  objectMenuOpen,
  onObjectMenuOpenChange,
  onUpdateCrop,
  snap,
  onAddCropAt,
  activeCropId,
  focusSignal,
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
      onLiveMove={onLiveMove}
      onLivePreview={onLivePreview}
      livePreview={livePreview}
      onAddFrame={onAddFrame}
      onAddObject={onAddObject}
      objectMenuOpen={objectMenuOpen}
      onObjectMenuOpenChange={onObjectMenuOpenChange}
      onUpdateCrop={onUpdateCrop}
      onBusyChange={onBusyChange}
      snap={snap}
      onAddCropAt={onAddCropAt}
      activeCropId={activeCropId}
      focusSignal={focusSignal}
    />
  );
}