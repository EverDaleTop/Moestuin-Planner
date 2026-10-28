import { GpuCanvas } from "./gpu/GpuCanvas";
import type { Crop, EditorTool, GardenElement, CropAssignment, GardenObjectKey } from "./types";
import type { LiveCursor, PreviewPayload } from "./realtime";

interface Props {
  elements: GardenElement[];
  catalog: Crop[];
  tool: EditorTool;
  frameType: "bed" | "path" | "veld";
  selectedIds: string[];
  selectedCropId: string | null;
  onSelect: (ids: string[]) => void;
  /** Ctrl/Cmd+klik: ids aan de selectie toevoegen ("add") of togglen ("toggle") */
  onToggleSelect: (ids: string[], mode?: "toggle" | "add") => void;
  onSelectCrop: (instanceId: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
  /** eenmalig zodra het eerste frame echt getekend is */
  onFirstPaint?: () => void;
  theme: "light" | "dark";
  locked?: boolean;
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
  /** eigen muis + selectie live delen */
  onLiveCursor?: (cursor: { x: number; y: number } | null, selection: string[]) => void;
  /** live muizen + selecties van de andere editors */
  liveCursors?: { current: Map<string, LiveCursor> };
  currentUserId?: string;
  onAddFrame: (
    type: "bed" | "path" | "veld",
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
  onToggleSelect,
  onSelectCrop,
  onBusyChange,
  onFirstPaint,
  theme,
  onApplyChanges,
  onLiveMove,
  onLivePreview,
  livePreview,
  onLiveCursor,
  liveCursors,
  currentUserId,
  onAddFrame,
  onAddObject,
  objectMenuOpen,
  onObjectMenuOpenChange,
  onUpdateCrop,
  snap,
  onAddCropAt,
  activeCropId,
  focusSignal,
locked,
}: Props) {
  return (
    <GpuCanvas
      locked={locked}
      elements={elements}
      catalog={catalog}
      tool={tool}
      frameType={frameType}
      selectedIds={selectedIds}
      selectedCropId={selectedCropId}
      theme={theme}
      onSelect={onSelect}
      onToggleSelect={onToggleSelect}
      onSelectCrop={onSelectCrop}
      onApplyChanges={onApplyChanges}
      onLiveMove={onLiveMove}
      onLivePreview={onLivePreview}
      livePreview={livePreview}
      onLiveCursor={onLiveCursor}
      liveCursors={liveCursors}
      currentUserId={currentUserId}
      onAddFrame={onAddFrame}
      onAddObject={onAddObject}
      objectMenuOpen={objectMenuOpen}
      onObjectMenuOpenChange={onObjectMenuOpenChange}
      onUpdateCrop={onUpdateCrop}
      onBusyChange={onBusyChange}
      onFirstPaint={onFirstPaint}
      snap={snap}
      onAddCropAt={onAddCropAt}
      activeCropId={activeCropId}
      focusSignal={focusSignal}
    />
  );
}