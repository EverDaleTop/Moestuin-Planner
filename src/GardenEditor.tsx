import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react'
import type {
	Crop,
	EditorTool,
	ElementType,
	Garden,
	GardenElement,
} from './types'
import { GardenCanvas } from './GardenCanvas'
import { Inspector } from './Inspector'
import type { Theme } from './useTheme'
import { ThemeToggle } from './ThemeToggle'

const icon = (paths: ReactNode) => (
	<svg
		width='18'
		height='18'
		viewBox='0 0 24 24'
		fill='none'
		stroke='currentColor'
		strokeWidth='1.8'
		strokeLinecap='round'
		strokeLinejoin='round'
		aria-hidden='true'>
		{paths}
	</svg>
)

const IconSelect = () => icon(<path d='M5 3l14 8-6 1.5L10 18l-2-8z' />)
const IconMove = () =>
	icon(
		<g>
			<path d='M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3 3M3 12l3-3M21 12l-3 3M21 12l-3-3' />
		</g>,
	)
const IconFrame = () =>
	icon(<rect x='4' y='4' width='16' height='16' rx='2' />)
const IconBed = () =>
	icon(
		<g>
			<path d='M4 18V9h16v9' />
			<path d='M4 13h16' />
			<circle cx='7' cy='11' r='1.2' />
			<circle cx='10' cy='11' r='1.2' />
		</g>,
	)
const IconPath = () =>
	icon(
		<g>
			<circle cx='19' cy='5' r='1.4' />
			<circle cx='12' cy='12' r='1.4' />
			<circle cx='5' cy='19' r='1.4' />
			<path d='M18 5l-12 12' />
		</g>,
	)
const IconTrash = () =>
	icon(
		<g>
			<path d='M4 7h16' />
			<path d='M9 7V4h6v3' />
			<path d='M6 7l1 13h10l1-13' />
			<path d='M10 11v5M14 11v5' />
		</g>,
	)
const IconCopy = () =>
	icon(
		<g>
			<rect x='8' y='8' width='11' height='11' rx='2' />
			<path d='M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3' />
		</g>,
	)
const IconUndo = () =>
	icon(
		<g>
			<path d='M9 7L4 12l5 5' />
			<path d='M4 12h11a5 5 0 0 1 0 10' />
		</g>,
	)
const IconRedo = () =>
	icon(
		<g>
			<path d='M15 7l5 5-5 5' />
			<path d='M20 12H9a5 5 0 0 0 0 10' />
		</g>,
	)

interface Props {
	garden: Garden
	catalog: Crop[]
	theme: Theme
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
	onAddCropToCatalog: (crop: Omit<Crop, 'id'>) => void
	onUndo: () => void
	onRedo: () => void
	onOpenPlants: () => void
}

export function GardenEditor(props: Props) {
	const {
		garden,
		catalog,
		theme,
		onToggleTheme,
		onNameChange,
		onBack,
		onAddFrame,
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
		onUndo,
		onRedo,
		onOpenPlants,
	} = props

	const [selectedIds, setSelectedIds] = useState<string[]>([])
	const [selectedCropId, setSelectedCropId] = useState<string | null>(null)
	const busyRef = useRef(false)
	const onBusyChange = useCallback((b: boolean) => {
		busyRef.current = b
	}, [])
	const [name, setName] = useState(garden.name)
	const [tool, setTool] = useState<EditorTool>('select')
	const [frameType, setFrameType] = useState<ElementType>('bed')

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

	// Tool shortcuts: V = edit/select, R = draw. Finished drawing returns to edit.
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
			const k = e.key.toLowerCase()
			if (k === 'v') setTool('select')
			else if (k === 'r') {
				setTool('frame')
				setSelectedIds([])
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

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
		type: ElementType,
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
				<button
					className='btn-ghost'
					onClick={onBack}
					title='Terug naar tuinen'>
					← Tuinen
				</button>
				<input
					className='ge-title'
					value={name}
					onChange={(e) => setName(e.target.value)}
					onBlur={() => name.trim() && onNameChange(name.trim())}
					onKeyDown={(e) =>
						e.key === 'Enter' && name.trim() && onNameChange(name.trim())
					}
				/>
				<div className='ge-spacer' />
				<button
					className='btn-ghost'
					onClick={onOpenPlants}
					title='Plantendatabase'>
					Gewassen
				</button>
				<ThemeToggle theme={theme} onToggle={onToggleTheme} />
			</header>

			<div className='ge-body'>
				<div className='ge-canvas'>
					<GardenCanvas
						elements={garden.elements}
						catalog={catalog}
						tool={tool}
						frameType={frameType}
						selectedIds={selectedIds}
						selectedCropId={selectedCropId}
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
						onAddFrame={handleAddFrame}
						onUpdateCrop={(eId, iId, patch) => onUpdateCrop(eId, iId, patch)}
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
									setTool('frame')
									setSelectedIds([])
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
								className={frameType === 'bed' ? 'tool-active' : ''}
								onClick={() => setFrameType('bed')}
								aria-label='Bed'
								data-tooltip='Bed'>
								<IconBed />
							</button>
							<button
								className={frameType === 'path' ? 'tool-active' : ''}
								onClick={() => setFrameType('path')}
								aria-label='Pad'
								data-tooltip='Pad'>
								<IconPath />
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
					</div>
				</div>
				<Inspector
					element={selected}
					catalog={catalog}
					onUpdate={(patch) =>
						selected && onUpdateElement(selected.id, patch)
					}
					onRemove={() => selected && onRemoveElement(selected.id)}
					onAddCrop={(cropId) =>
						selected && onAddCrop(selected.id, cropId)
					}
					onUpdateCrop={(iId, patch) =>
						selected && onUpdateCrop(selected.id, iId, patch)
					}
					onRemoveCrop={(iId) =>
						selected && onRemoveCrop(selected.id, iId)
					}
					onAddCropToCatalog={onAddCropToCatalog}
				/>
			</div>
		</div>
	)
}
