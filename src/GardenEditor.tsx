import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import type {
	Crop,
	EditorTool,
	Garden,
	GardenElement,
	GardenObjectKey,
	HarvestEntry,
	Expense,
	Income,
	ShoppingItem,
} from './types'
import { GardenCanvas } from './GardenCanvas'
import type { PreviewPayload } from './realtime'
import { Inspector } from './Inspector'
import type { PresenceMember } from './realtime'
import { PresenceModal } from './PresenceModal'
import { HarvestView } from './HarvestExpenseView'
import { ExpensesView } from './ExpensesView'
import { ShoppingListView } from './ShoppingListView'
import { PlantCatalog } from './PlantDatabase'
import type { Theme } from './useTheme'
import { ThemeToggle } from './ThemeToggle'

const FaIcon = ({ cls }: { cls: string }) => (
	<i className={cls} style={{ fontSize: 16 }} aria-hidden='true' />
)

const IconSelect = () => <FaIcon cls='fa-solid fa-arrow-pointer' />
const IconMove = () => <FaIcon cls='fa-solid fa-arrows-up-down-left-right' />
const IconFrame = () => <FaIcon cls='fa-solid fa-draw-polygon' />
const IconBed = () => <FaIcon cls='fa-solid fa-table-cells-large' />
const IconPath = () => <FaIcon cls='fa-solid fa-road' />
const IconGaas = () => <FaIcon cls='fa-solid fa-table-cells' />
const IconTrash = () => <FaIcon cls='fa-solid fa-trash' />
const IconCopy = () => <FaIcon cls='fa-solid fa-copy' />
const IconUndo = () => <FaIcon cls='fa-solid fa-rotate-left' />
const IconRedo = () => <FaIcon cls='fa-solid fa-rotate-right' />
const IconObject = () => <FaIcon cls='fa-solid fa-shapes' />

interface Props {
	garden: Garden
	catalog: Crop[]
	theme: Theme
	presence?: number
	presenceMembers?: PresenceMember[]
	currentUserId: string
	userNames: Record<string, string>
	onUnshareMember: (userId: string) => Promise<void>
	onToggleTheme: () => void
	onNameChange: (name: string) => void
	onBack: () => void
	onAddFrame: (
		type: 'bed' | 'path',
		x: number,
		y: number,
		widthM: number,
		heightM: number,
	) => string
	onAddObject: (
    key: GardenObjectKey,
    x: number,
    y: number,
    gaas?: import("./types").GaasData,
  ) => string
	onUpdateElement: (eId: string, patch: Partial<GardenElement>) => void
	onRemoveElement: (eId: string) => void
	onRemoveElements: (ids: string[]) => void
	onApplyElements: (
		updates: {
			id: string
			x?: number
			y?: number
			widthM?: number
			heightM?: number
			crops?: GardenElement['crops']
			gaas?: import('./types').GaasData
		}[],
	) => void
	onDuplicateElements: (ids: string[]) => string[]
	onAddCrop: (eId: string, cropId: string) => void
	onUpdateCrop: (
		eId: string,
		iId: string,
		patch: Partial<GardenElement['crops'][number]>,
	) => void
	onRemoveCrop: (eId: string, iId: string) => void
	onDuplicateCrop: (eId: string, iId: string) => string | null
	onAddHarvest: (entry: Omit<HarvestEntry, 'id'>) => void
	onUpdateHarvest: (hId: string, patch: Partial<HarvestEntry>) => void
	onRemoveHarvest: (hId: string) => void
	onAddExpense: (entry: Omit<Expense, 'id'>) => void
	onUpdateExpense: (eId: string, patch: Partial<Expense>) => void
	onRemoveExpense: (eId: string) => void
	onAddIncome: (entry: Omit<Income, 'id'>) => void
	onUpdateIncome: (iId: string, patch: Partial<Income>) => void
	onRemoveIncome: (iId: string) => void
	onAddShopping: (entry: Omit<ShoppingItem, 'id' | 'createdAt' | 'done'>) => void
	onUpdateShopping: (itemId: string, patch: Partial<ShoppingItem>) => void
	onRemoveShopping: (itemId: string) => void
	onToggleShoppingDone: (item: ShoppingItem, done: boolean) => void
	onUndo: () => void
	onRedo: () => void
	onLiveMove?: (updates: { id: string; x?: number; y?: number; widthM?: number; heightM?: number; crops?: { instanceId: string; cropId: string; rows: number; rowSpacing?: number; plantSpacing?: number; cols?: number; padding?: number; area?: { x: number; y: number; w: number; h: number } }[] }[]) => void
	onLivePreview?: (preview: PreviewPayload) => void
	livePreview?: PreviewPayload | null
	onAddCropToCatalog: (crop: Omit<Crop, 'id'>) => void
	onUpdateCropInCatalog: (cropId: string, patch: Partial<Crop>) => void
	onRemoveCropFromCatalog: (cropId: string) => void
}

export function GardenEditor(props: Props) {
	const {
		garden,
		catalog,
		theme,
		presence,
		presenceMembers = [],
		currentUserId,
		userNames,
		onUnshareMember,
		onToggleTheme,
		onNameChange,
		onBack,
		onAddFrame,
		onAddObject,
		onUpdateElement,
		onRemoveElement,
		onRemoveElements,
		onApplyElements,
		onDuplicateElements,
		onAddCrop,
		onUpdateCrop,
		onRemoveCrop,
		onDuplicateCrop,
		onAddCropToCatalog,
		onAddHarvest,
		onUpdateHarvest,
		onRemoveHarvest,
		onAddExpense,
		onUpdateExpense,
		onRemoveExpense,
		onAddIncome,
		onUpdateIncome,
		onRemoveIncome,
		onAddShopping,
		onUpdateShopping,
		onRemoveShopping,
	onToggleShoppingDone,
		onUndo,
		onRedo,
		onLiveMove,
		onLivePreview,
		livePreview,
		onUpdateCropInCatalog,
		onRemoveCropFromCatalog,
	} = props

	const [presenceOpen, setPresenceOpen] = useState(false)
	const isOwner = garden.ownerId === currentUserId

	/**
	 * De server stuurt de volledige ledenlijst mee. Valt die om de een of
	 * andere reden weg terwijl de teller wél groter is dan 1 (bv. een oudere,
	 * niet-herstartte server die alleen `count` stuurt), dan zorgen we
	 * ervoor dat je jezelf in elk geval als online ziet — anders zou je
	 * terwijl je in de tuin bent als "offline" verschijnen.
	 */
	const onlineMembers: PresenceMember[] = useMemo(() => {
		if (presenceMembers.length > 0) return presenceMembers
		const count = presence ?? 0
		if (count < 1) return []
		return [
			{
				userId: currentUserId,
				username: userNames[currentUserId] ?? 'Jij',
			},
		]
	}, [presenceMembers, presence, currentUserId, userNames])

	const onlineCount = onlineMembers.length

	const [editorTab, setEditorTab] = useState<
		'canvas' | 'gewassen' | 'oogst' | 'uitgaven' | 'boodschappen'
	>(() => {
		try {
			const saved = localStorage.getItem('mp_editor_tab')
			if (
				saved === 'canvas' ||
				saved === 'gewassen' ||
				saved === 'oogst' ||
				saved === 'uitgaven' ||
				saved === 'boodschappen'
			) {
				return saved
			}
		} catch { /* ignore */ }
		return 'canvas'
	})

	const [selectedIds, setSelectedIds] = useState<string[]>([])
	const [selectedCropId, setSelectedCropId] = useState<string | null>(null)
	const busyRef = useRef(false)
	const onBusyChange = useCallback((b: boolean) => {
		busyRef.current = b
	}, [])
	const [name, setName] = useState(garden.name)
	const [tool, setTool] = useState<EditorTool>('select')
	const [frameType, setFrameType] = useState<'bed' | 'path'>('bed')
	const [objectMenu, setObjectMenu] = useState(false)
	const [snap, setSnap] = useState(() => {
		try {
			return localStorage.getItem('mp_snap') !== '0'
		} catch {
			return true
		}
	})

	const toggleSnap = useCallback(() => {
		setSnap((s) => {
			const next = !s
			try {
				localStorage.setItem('mp_snap', next ? '1' : '0')
			} catch {
				// privaatmodus o.i.d.: gewoon niet onthouden
			}
			return next
		})
	}, [])

	// If a child plant is selected, remember which bed holds it so delete /
	// duplicate can act on the child instead of the whole bed.
	const cropContext = useMemo(() => {
		if (!selectedCropId) return null
		for (const e of garden.elements) {
			if (e.type !== 'bed') continue
			const c = e.crops.find((c) => c.instanceId === selectedCropId)
			if (c) return { bedId: e.id, crop: c }
		}
		return null
	}, [garden.elements, selectedCropId])

	useEffect(() => {
		try {
			localStorage.setItem('mp_editor_tab', editorTab)
		} catch { /* ignore */ }
	}, [editorTab])

	// Delete / Backspace removes the selected elements, or the selected child.
	useEffect(() => {
		const isEditable = (t: EventTarget | null) => {
			const el = t as HTMLElement | null
			return (
				!!el &&
				(el.isContentEditable ||
					el.tagName === 'INPUT' ||
					el.tagName === 'TEXTAREA' ||
					el.tagName === 'SELECT')
			)
		}
		const onKey = (e: KeyboardEvent) => {
			if (isEditable(e.target)) return
			if (e.key !== 'Delete' && e.key !== 'Backspace') return
			if (selectedIds.length === 0 && !cropContext) return
			e.preventDefault()
			if (busyRef.current) return
			deleteSelectedRef.current()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [selectedIds, cropContext])

	const deleteSelected = () => {
		if (cropContext) {
			onRemoveCrop(cropContext.bedId, cropContext.crop.instanceId)
			setSelectedCropId(null)
			return
		}
		if (selectedIds.length === 0) return
		onRemoveElements(selectedIds)
		setSelectedIds([])
	}

	const deleteSelectedRef = useRef(deleteSelected)
	deleteSelectedRef.current = deleteSelected

	const duplicateSelected = () => {
		if (cropContext) {
			const newId = onDuplicateCrop(cropContext.bedId, cropContext.crop.instanceId)
			if (newId) setSelectedCropId(newId)
			return
		}
		if (selectedIds.length === 0) return
		const newIds = onDuplicateElements(selectedIds)
		if (newIds.length > 0) setSelectedIds(newIds)
	}

	// Ctrl+D duplicates the selected element or child. preventDefault stops the
	// browser's "add bookmark" dialog. Use a ref so the listener always reads the
	// latest handler/data.
	const duplicateSelectedRef = useRef(duplicateSelected)
	duplicateSelectedRef.current = duplicateSelected
	useEffect(() => {
		const isEditable = (t: EventTarget | null) => {
			const el = t as HTMLElement | null
			return (
				!!el &&
				(el.isContentEditable ||
					el.tagName === 'INPUT' ||
					el.tagName === 'TEXTAREA' ||
					el.tagName === 'SELECT')
			)
		}
		const onKey = (e: KeyboardEvent) => {
			if (isEditable(e.target)) return
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
				if (selectedIds.length === 0 && !cropContext) return
				e.preventDefault()
				if (busyRef.current) return
				duplicateSelectedRef.current()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [selectedIds, cropContext])

	// Tool shortcuts: V = edit/select, R = draw, S = snap aan/uit.
	// Escape always drops back to select (and closes the object menu).
	useEffect(() => {
		const isEditable = (t: EventTarget | null) => {
			const el = t as HTMLElement | null
			return (
				!!el &&
				(el.isContentEditable ||
					el.tagName === 'INPUT' ||
					el.tagName === 'TEXTAREA' ||
					el.tagName === 'SELECT')
			)
		}
		const onKey = (e: KeyboardEvent) => {
			if (isEditable(e.target)) return
			if (e.key === 'Escape') {
				setObjectMenu(false)
				setTool('select')
				return
			}
			const k = e.key.toLowerCase()
			if (k === 'v') {
				setObjectMenu(false)
				setTool('select')
			} else if (k === 'r') {
				setObjectMenu(false)
				setTool('frame')
				setSelectedIds([])
			} else if (k === 's' && !e.ctrlKey && !e.metaKey) {
				toggleSnap()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [toggleSnap])

	// Undo (Ctrl+Z) / redo (Ctrl+Y or Ctrl+Shift+Z).
	useEffect(() => {
		const isEditable = (t: EventTarget | null) => {
			const el = t as HTMLElement | null
			return (
				!!el &&
				(el.isContentEditable ||
					el.tagName === 'INPUT' ||
					el.tagName === 'TEXTAREA' ||
					el.tagName === 'SELECT')
			)
		}
		const onKey = (e: KeyboardEvent) => {
			if (isEditable(e.target)) return
			if (!(e.ctrlKey || e.metaKey)) return
			const k = e.key.toLowerCase()
			if (k === 'z') {
				e.preventDefault()
				if (e.shiftKey) onRedo()
				else onUndo()
			} else if (k === 'y') {
				e.preventDefault()
				onRedo()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onUndo, onRedo])

	const handleAddFrame = (
		type: 'bed' | 'path',
		x: number,
		y: number,
		w: number,
		h: number,
	): string => {
		const newId = onAddFrame(type, x, y, w, h)
		setTool('select')
		if (newId) setSelectedIds([newId])
		return newId
	}

	const selected = useMemo(
		() =>
			selectedIds.length > 0
				? (garden.elements.find((e) => e.id === selectedIds[0]) ?? null)
				: null,
		[garden.elements, selectedIds],
	)

	return (
		<div className='ge-wrap'>
			<header className='ge-header'>
				<div className='ge-brand'>
					<button
						className='btn-ghost ge-back'
						onClick={onBack}
						title='Terug naar tuinen'>
						<i className='fa-solid fa-arrow-left' />
						<span>Tuinen</span>
					</button>
					<span className='ge-divider' aria-hidden='true' />
					<input
						className='ge-title'
						value={name}
						onChange={(e) => setName(e.target.value)}
						onBlur={() => name.trim() && onNameChange(name.trim())}
						onKeyDown={(e) =>
							e.key === 'Enter' && name.trim() && onNameChange(name.trim())
						}
						aria-label='Tuinnaam'
					/>
				</div>
				<div className='ge-tabs-slot'>
					<div className='ge-editor-tabs'>
					<button
						className={`nav-tab ${editorTab === 'canvas' ? 'nav-active' : ''}`}
						onClick={() => setEditorTab('canvas')}>
						<i className='fa-solid fa-seedling' />
						Tuin
					</button>
					<button
						className={`nav-tab ${editorTab === 'gewassen' ? 'nav-active' : ''}`}
						onClick={() => setEditorTab('gewassen')}>
						<i className='fa-solid fa-carrot' />
						Gewassen
					</button>
					<button
						className={`nav-tab ${editorTab === 'oogst' ? 'nav-active' : ''}`}
						onClick={() => setEditorTab('oogst')}>
						<i className='fa-solid fa-carrot' />
						Oogst
					</button>
					<button
						className={`nav-tab ${editorTab === 'uitgaven' ? 'nav-active' : ''}`}
						onClick={() => setEditorTab('uitgaven')}>
						<i className='fa-solid fa-receipt' />
						Uitgaven
					</button>
					<button
						className={`nav-tab ${editorTab === 'boodschappen' ? 'nav-active' : ''}`}
						onClick={() => setEditorTab('boodschappen')}>
						<i className='fa-solid fa-cart-shopping' />
						Boodschappen
						{(garden.shopping ?? []).filter((s) => !s.done).length > 0 && (
							<span className='crops-open-count'>
								{(garden.shopping ?? []).filter((s) => !s.done).length}
							</span>
						)}
					</button>
				</div>
				</div>
				<div className='ge-actions'>
					{onlineCount > 0 && (
						<button
							className='ge-presence'
							onClick={() => setPresenceOpen(true)}
							title='Bekijk wie er online is'>
							<i className='fa-solid fa-users' />
							<span>{onlineCount}</span>
							<i className='fa-solid fa-chevron-down ge-presence-caret' />
						</button>
					)}
					<ThemeToggle theme={theme} onToggle={onToggleTheme} />
				</div>
			</header>
			{presenceOpen && (
				<PresenceModal
					gardenName={garden.name}
					members={onlineMembers}
					ownerId={garden.ownerId}
					sharedWith={garden.sharedWith}
					userNames={userNames}
					currentUserId={currentUserId}
					isOwner={isOwner}
					onClose={() => setPresenceOpen(false)}
					onKick={onUnshareMember}
				/>
			)}

			{editorTab === 'canvas' ? (
				<div className='ge-body'>
					<div className='ge-canvas'>
						<GardenCanvas
							elements={garden.elements}
							catalog={catalog}
							tool={tool}
							frameType={frameType}
							selectedIds={selectedIds}
							selectedCropId={selectedCropId}
							objectMenuOpen={objectMenu}
							onObjectMenuOpenChange={setObjectMenu}
							onSelect={(ids) => {
								setSelectedIds(ids)
								const el =
									ids.length === 1
										? (garden.elements.find((e) => e.id === ids[0]) ?? null)
										: null
								if (!el || el.type !== 'bed') setSelectedCropId(null)
							}}
							onSelectCrop={setSelectedCropId}
							onBusyChange={onBusyChange}
							theme={theme}
						onApplyChanges={(updates) => onApplyElements(updates)}
						onLiveMove={onLiveMove}
						onLivePreview={onLivePreview}
						livePreview={livePreview}
							onAddFrame={handleAddFrame}
							onAddObject={onAddObject}
							onUpdateCrop={(eId, iId, patch) => onUpdateCrop(eId, iId, patch)}
							snap={snap}
						/>
						<div
							className='ge-bottom-toolbar'
							role='toolbar'
							aria-label='Gereedschap'>
							<div
								className='ge-tools'
								role='group'
								aria-label='Gereedschap'>
								<button
									className={tool === 'select' ? 'tool-active' : ''}
									onClick={() => setTool('select')}
									aria-label='Bewerken'
									data-tooltip='Bewerken (V)'>
									<IconSelect />
								</button>
								<button
									className={tool === 'move' ? 'tool-active' : ''}
									onClick={() => setTool('move')}
									aria-label='Verplaatsen'
									data-tooltip='Verplaatsen (Spatie)'>
									<IconMove />
								</button>
								<button
									className={tool === 'frame' ? 'tool-active' : ''}
									onClick={() => {
										if (tool === 'frame') setTool('select')
										else {
											setTool('frame')
											setSelectedIds([])
										}
									}}
									aria-label='Tekenen'
									data-tooltip='Tekenen (R)'>
									<IconFrame />
								</button>
							</div>
							<div
								className='ge-tools'
								role='group'
								aria-label='Te tekenen element'>
								<button
									className={tool === 'frame' && frameType === 'bed' ? 'tool-active' : ''}
									onClick={() => {
										if (tool === 'frame' && frameType === 'bed') setTool('select')
										else {
											setFrameType('bed')
											setTool('frame')
											setSelectedIds([])
										}
									}}
									aria-label='Bed'
									data-tooltip='Bed tekenen'>
									<IconBed />
								</button>
							<button
								className={tool === 'frame' && frameType === 'path' ? 'tool-active' : ''}
								onClick={() => {
									if (tool === 'frame' && frameType === 'path') setTool('select')
									else {
										setFrameType('path')
										setTool('frame')
										setSelectedIds([])
									}
								}}
								aria-label='Pad'
								data-tooltip='Pad tekenen'>
								<IconPath />
							</button>
							<button
								className={tool === 'gaas' ? 'tool-active' : ''}
								onClick={() => {
									if (tool === 'gaas') setTool('select')
									else {
										setTool('gaas')
										setSelectedIds([])
									}
								}}
								aria-label='Gaas tekenen'
								data-tooltip='Gaas tekenen (trek een lijn, eindigt op een paal als die eronder zit)'>
								<IconGaas />
							</button>
						</div>
						<div
							className='ge-tools'
							role='group'
							aria-label='Voorwerpen toevoegen'>
							<button
								className={objectMenu ? 'tool-active' : ''}
								onClick={() => {
									setTool('select')
									setObjectMenu((o) => !o)
								}}
								aria-label='Voorwerp toevoegen'
								data-tooltip='Voorwerp toevoegen (Bank, …)'>
								<IconObject />
							</button>
						</div>
							<div
								className='ge-tools'
								role='group'
								aria-label='Verwijderen'>
								<button
									className='tool-delete'
									disabled={selectedIds.length === 0 && !cropContext}
									onClick={deleteSelected}
									aria-label='Verwijderen'
									data-tooltip='Verwijderen (Del)'>
									<IconTrash />
								</button>
								<button
									disabled={selectedIds.length === 0 && !cropContext}
									onClick={duplicateSelected}
									aria-label='Dupliceren'
									data-tooltip='Dupliceren (Ctrl+D)'>
									<IconCopy />
								</button>
							</div>
							<div
								className='ge-tools'
								role='group'
								aria-label='Ongedaan maken'>
								<button
									onClick={onUndo}
									aria-label='Ongedaan maken'
									data-tooltip='Ongedaan maken (Ctrl+Z)'>
									<IconUndo />
								</button>
								<button
									onClick={onRedo}
									aria-label='Opnieuw'
									data-tooltip='Opnieuw (Ctrl+Y)'>
									<IconRedo />
								</button>
							</div>
							<div
								className='ge-tools'
								role='group'
								aria-label='Uitlijnen'>
								<button
									className={snap ? 'tool-active' : ''}
									onClick={toggleSnap}
									aria-label='Magnetisch uitlijnen'
									aria-pressed={snap}
									data-tooltip='Magnetisch uitlijnen (S)'>
									<FaIcon cls='fa-solid fa-magnet' />
								</button>
							</div>
						</div>
					</div>
					<Inspector
						element={selected}
						elements={garden.elements}
						catalog={catalog}
						crop={cropContext?.crop ?? null}
						cropInfo={
							cropContext
								? (catalog.find((c) => c.id === cropContext.crop.cropId) ??
									null)
								: null
						}
						onUpdate={(patch) =>
							selected && onUpdateElement(selected.id, patch)
						}
						onRemove={() => selected && onRemoveElement(selected.id)}
						onSelectElement={(id) => {
							const el = garden.elements.find((e) => e.id === id) ?? null
							setSelectedIds([id])
							if (!el || el.type !== 'bed') setSelectedCropId(null)
						}}
						onAddCrop={(cropId) =>
							selected && onAddCrop(selected.id, cropId)
						}
						onUpdateCrop={(iId, patch) =>
							selected && onUpdateCrop(selected.id, iId, patch)
						}
						onRemoveCrop={(iId) => {
							if (selected) {
								onRemoveCrop(selected.id, iId)
								setSelectedCropId(null)
							}
						}}
						onDuplicateCrop={(iId) => {
							if (selected) {
								const newId = onDuplicateCrop(selected.id, iId)
								if (newId) setSelectedCropId(newId)
							}
						}}
						onDeselectCrop={() => setSelectedCropId(null)}
					/>
				</div>
			) : editorTab === 'gewassen' ? (
				<div className='he-wrap'>
					<PlantCatalog
						catalog={catalog}
						onAdd={onAddCropToCatalog}
						onUpdate={onUpdateCropInCatalog}
						onDelete={onRemoveCropFromCatalog}
					/>
				</div>
			) : editorTab === 'oogst' ? (
				<div className='shop-scroll'>
					<HarvestView
						catalog={catalog}
						harvests={garden.harvests}
						onAdd={onAddHarvest}
						onUpdate={onUpdateHarvest}
						onRemove={onRemoveHarvest}
					/>
				</div>
			) : editorTab === 'uitgaven' ? (
				<div className='shop-scroll'>
					<ExpensesView
						expenses={garden.expenses}
						incomes={garden.incomes ?? []}
						onAdd={onAddExpense}
						onUpdate={onUpdateExpense}
						onRemove={onRemoveExpense}
						onAddIncome={onAddIncome}
						onUpdateIncome={onUpdateIncome}
						onRemoveIncome={onRemoveIncome}
					/>
				</div>
			) : (
				<div className='shop-scroll'>
				<ShoppingListView
					items={garden.shopping ?? []}
					onAdd={onAddShopping}
					onUpdate={onUpdateShopping}
					onRemove={onRemoveShopping}
					onToggleDone={onToggleShoppingDone}
				/>
				</div>
			)}
		</div>
	)
}
