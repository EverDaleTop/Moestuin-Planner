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
	SowingEntry,
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
import { CalendarView } from './CalendarView'
import { sowableInMonth, harvestableInMonth } from './sowing'
import { PX_PER_M } from './storage'
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
const IconCrop = () => <FaIcon cls='fa-solid fa-seedling' />

interface MenuItem {
	key: string
	label: string
	icon: string
	/** badge rechts in het menu, bv. aantal openstaande boodschappen */
	count?: number
	/** icoontje vóór het getal in de badge, bv. 'fa-seedling' */
	countIcon?: string
	hint?: string
}

interface TabBadge {
	count: number
	/** icoontje vóór het getal in de badge, bv. 'fa-seedling' */
	icon?: string
	title: string
}

/**
 * Tab met een uitklapmenu eronder. De tab zelf toont het actieve item van de
 * groep, zodat je nooit in een vergeten submenu zit. Via `tabBadges` kun je
 * losse tellers op de tab tonen (bv. te zaaien én te oogsten); zonder die
 * prop valt hij terug op één opgetelde badge.
 */
function NavMenu({
	label,
	icon,
	activeKey,
	items,
	tabBadges,
	onSelect,
}: {
	label: string
	icon: string
	activeKey: string
	items: MenuItem[]
	tabBadges?: TabBadge[]
	onSelect: (key: string) => void
}) {
	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLDivElement | null>(null)

	useEffect(() => {
		if (!open) return
		const onDown = (e: PointerEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				setOpen(false)
			}
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false)
		}
		document.addEventListener('pointerdown', onDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('pointerdown', onDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [open])

	// badge op de tab zelf: expliciete badges, of één opgetelde terugval
	const total = items.reduce((s, i) => s + (i.count ?? 0), 0)
	const current = items.find((i) => i.key === activeKey)
	const active = current !== undefined
	const totalBadges: TabBadge[] =
		!active && total > 0 ? [{ count: total, title: `${total} open` }] : []
	const closeTimer = useRef<number | null>(null)

	const cancelClose = () => {
		if (closeTimer.current !== null) {
			window.clearTimeout(closeTimer.current)
			closeTimer.current = null
		}
	}

	// Hover opent, met een kleine vertraging bij sluiten zodat je van de tab
	// naar het menu kunt bewegen zonder dat het dichtklapt.
	const scheduleClose = () => {
		cancelClose()
		closeTimer.current = window.setTimeout(() => setOpen(false), 180)
	}

	useEffect(() => cancelClose, [])

	return (
		<div
			className='ge-menu'
			ref={rootRef}
			onMouseEnter={() => {
				cancelClose()
				setOpen(true)
			}}
			onMouseLeave={scheduleClose}>
			<button
				className={`nav-tab${active ? ' nav-active' : ''}`}
				onClick={() => setOpen((o) => !o)}
				aria-haspopup='menu'
				aria-expanded={open}
				title={label}>
				<i className={`fa-solid ${icon}`} />
				{current?.label ?? label}
				{(tabBadges ?? totalBadges)
					.filter((b) => b.count > 0)
					.map((b) => (
						<span key={b.title} className='ge-tab-badge' title={b.title}>
							{b.icon && <i className={`fa-solid ${b.icon}`} />}
							{b.count}
						</span>
					))}
				<i className={`fa-solid fa-chevron-down ge-menu-caret${open ? ' open' : ''}`} />
			</button>
			{open && (
				<div className='ge-menu-pop' role='menu'>
					{items.map((i) => (
						<button
							key={i.key}
							type='button'
							role='menuitem'
							className={
								i.key === activeKey ? 'ge-menu-item is-active' : 'ge-menu-item'
							}
							onClick={() => {
								onSelect(i.key)
								setOpen(false)
							}}>
							<i className={`fa-solid ${i.icon}`} />
							<span className='ge-menu-name'>{i.label}</span>
							{i.hint && <span className='ge-menu-hint'>{i.hint}</span>}
							{i.key === activeKey && (
								<i className='fa-solid fa-check ge-menu-check' />
							)}
							{i.key !== activeKey && !!i.count && (
								<span className='ge-menu-count'>
									{i.countIcon && <i className={`fa-solid ${i.countIcon}`} />}
									{i.count}
								</span>
							)}
						</button>
					))}
				</div>
			)}
		</div>
	)
}

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
	/** tekent een nieuw stuk gewas in een bed (wereld-px, absoluut op de canvas) */
	onAddCropAt: (eId: string, wx: number, wy: number, w: number, h: number) => string | undefined
	/** gewas dat het gewas-gereedschap gebruikt */
	activeCropId: string | null
	onSelectActiveCrop: (cropId: string) => void
	onAddHarvest: (entry: Omit<HarvestEntry, 'id'>) => void
	onUpdateHarvest: (hId: string, patch: Partial<HarvestEntry>) => void
	onRemoveHarvest: (hId: string) => void
	onAddSowing: (entry: Omit<SowingEntry, 'id'>) => void
	onUpdateSowing: (sId: string, patch: Partial<SowingEntry>) => void
	onRemoveSowing: (sId: string) => void
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
		onAddCropAt,
		activeCropId,
		onSelectActiveCrop,
		onAddCropToCatalog,
		onAddHarvest,
		onUpdateHarvest,
		onRemoveHarvest,
		onAddSowing,
		onUpdateSowing,
		onRemoveSowing,
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
		'canvas' | 'gewassen' | 'kalender' | 'oogst' | 'uitgaven' | 'boodschappen'
	>(() => {
		try {
			const saved = localStorage.getItem('mp_editor_tab')
			if (
				saved === 'canvas' ||
				saved === 'gewassen' ||
				saved === 'kalender' ||
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
	const [focusSignal, setFocusSignal] = useState<{ x: number; y: number; n: number } | null>(null)
	const focusN = useRef(0)
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

	const sowableThisMonth = useMemo(
		() => sowableInMonth(catalog, new Date().getMonth() + 1).length,
		[catalog],
	)

	const harvestableThisMonth = useMemo(
		() => harvestableInMonth(catalog, new Date().getMonth() + 1).length,
		[catalog],
	)

	const openShopping = useMemo(
		() => (garden.shopping ?? []).filter((s) => !s.done).length,
		[garden.shopping],
	)

	const selected = useMemo(
		() =>
			selectedIds.length > 0
				? (garden.elements.find((e) => e.id === selectedIds[0]) ?? null)
				: null,
		[garden.elements, selectedIds],
	)

	const normCropName = (s: string) => s.trim().toLowerCase()

	/** alle gewas-ids die ergens in een bed geplant staan (id óf naam, net als
	 *  bij zaaiingen/oogsten — ids kunnen verouderd of dubbel zijn) */
	const plantedCropIds = useMemo(() => {
		const byId = new Map(catalog.map((c) => [c.id, c]))
		const plantedIds = new Set<string>()
		const plantedNames = new Set<string>()
		for (const e of garden.elements) {
			if (e.type !== 'bed') continue
			for (const c of e.crops) {
				plantedIds.add(c.cropId)
				const entry = byId.get(c.cropId)
				if (entry) plantedNames.add(normCropName(entry.name))
			}
		}
		const out = new Set<string>()
		for (const c of catalog) {
			if (plantedIds.has(c.id) || plantedNames.has(normCropName(c.name))) {
				out.add(c.id)
			}
		}
		return out
	}, [garden.elements, catalog])

	/**
	 * "Toon in tuin" vanuit de kalender: selecteer de bedden met dit gewas,
	 * ga naar de tuin-tab en centreer de camera erop. Matcht op id óf naam,
	 * zodat het ook werkt bij dubbele of verouderde catalogusrijen. Bij één
	 * bed wordt ook de planting zelf geselecteerd voor maximale highlight.
	 */
	const handleLocateCrop = useCallback(
		(cropId: string) => {
			const entry = catalog.find((c) => c.id === cropId)
			const targetName = entry ? normCropName(entry.name) : null
			const matches = (plantedId: string) => {
				if (plantedId === cropId) return true
				if (!targetName) return false
				const planted = catalog.find((cc) => cc.id === plantedId)
				return planted ? normCropName(planted.name) === targetName : false
			}
			const beds = garden.elements.filter(
				(e) => e.type === 'bed' && e.crops.some((c) => matches(c.cropId)),
			)
			if (beds.length === 0) return
			let minX = Infinity,
				minY = Infinity,
				maxX = -Infinity,
				maxY = -Infinity
			for (const b of beds) {
				const w = b.widthM * PX_PER_M
				const h = b.heightM * PX_PER_M
				minX = Math.min(minX, b.x)
				minY = Math.min(minY, b.y)
				maxX = Math.max(maxX, b.x + w)
				maxY = Math.max(maxY, b.y + h)
			}
			focusN.current += 1
			setFocusSignal({
				x: (minX + maxX) / 2,
				y: (minY + maxY) / 2,
				n: focusN.current,
			})
			setTool('select')
			setSelectedIds(beds.map((b) => b.id))
			// Bij één bed ook de planting zelf selecteren: die krijgt dan de
			// sterke highlight + het gewaspaneel in de inspector.
			if (beds.length === 1) {
				const inst = beds[0].crops.find((c) => matches(c.cropId))
				setSelectedCropId(inst ? inst.instanceId : null)
			} else {
				setSelectedCropId(null)
			}
			setEditorTab('canvas')
		},
		[garden.elements, catalog],
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
					<NavMenu
						label='Gewassen'
						icon='fa-carrot'
						activeKey={editorTab}
						tabBadges={[
							{
								count: sowableThisMonth,
								icon: 'fa-seedling',
								title: `${sowableThisMonth} nu te zaaien`,
							},
							{
								count: harvestableThisMonth,
								icon: 'fa-basket-shopping',
								title: `${harvestableThisMonth} nu te oogsten`,
							},
						]}
						items={[
							{
								key: 'gewassen',
								label: 'Gewassenlijst',
								icon: 'fa-seedling',
							},
							{
								key: 'kalender',
								label: 'Zaaikalender',
								icon: 'fa-calendar-days',
								count: sowableThisMonth,
								countIcon: 'fa-seedling',
								hint:
									harvestableThisMonth > 0
										? `${harvestableThisMonth} te oogsten`
										: 'nu te zaaien',
							},
						]}
						onSelect={(key) => setEditorTab(key as typeof editorTab)}
					/>
					<button
						className={`nav-tab ${editorTab === 'oogst' ? 'nav-active' : ''}`}
						onClick={() => setEditorTab('oogst')}>
						<i className='fa-solid fa-basket-shopping' />
						Oogst
					</button>
					<NavMenu
						label='Meer'
						icon='fa-ellipsis'
						activeKey={editorTab}
						items={[
							{
								key: 'uitgaven',
								label: 'Uitgaven',
								icon: 'fa-receipt',
							},
							{
								key: 'boodschappen',
								label: 'Boodschappen',
								icon: 'fa-cart-shopping',
								count: openShopping,
							},
						]}
						onSelect={(key) => setEditorTab(key as typeof editorTab)}
					/>
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
							onAddCropAt={(bedId, wx, wy, w, h) => {
								// net als een bed plaatsen: na het zetten het nieuwe stuk
								// selecteren en terug naar selecteren
								const newId = onAddCropAt(bedId, wx, wy, w, h)
								setTool('select')
								if (newId) {
									setSelectedIds([bedId])
									setSelectedCropId(newId)
								}
								return newId
							}}
							onUpdateCrop={(eId, iId, patch) => onUpdateCrop(eId, iId, patch)}
							snap={snap}
							activeCropId={activeCropId}
							focusSignal={focusSignal}
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
							<button
								className={tool === 'crop' ? 'tool-active' : ''}
								disabled={!activeCropId}
								onClick={() => {
									if (tool === 'crop') setTool('select')
									else {
										setTool('crop')
										setSelectedIds([])
										setSelectedCropId(null)
									}
								}}
								aria-label='Gewas zetten'
								data-tooltip={activeCropId ? 'Stuk gewas in een bed tekenen (sleep in een bed)' : 'Voeg eerst een gewas toe via Gewassen'}>
								<IconCrop />
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
						onAddCrop={(cropId) => {
							if (selected) onAddCrop(selected.id, cropId)
						}}
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
					activeCropId={activeCropId}
					onSelectActiveCrop={(cropId) => {
						// Gewas kiezen om te tekenen schakelt meteen naar de
						// gewas-tekentool, zodat je direct kunt slepen in een bed.
						onSelectActiveCrop(cropId)
						setTool('crop')
						setSelectedCropId(null)
					}}
				/>
				</div>
			) : editorTab === 'gewassen' ? (
				<div className='shop-scroll'>
					<div className='shop-page'>
						<PlantCatalog
							catalog={catalog}
							onAdd={onAddCropToCatalog}
							onUpdate={onUpdateCropInCatalog}
							onDelete={onRemoveCropFromCatalog}
						/>
					</div>
				</div>
			) : editorTab === 'kalender' ? (
				<div className='shop-scroll'>
					<CalendarView
						gardenId={garden.id}
						catalog={catalog}
						sowings={garden.sowings ?? []}
						harvests={garden.harvests}
						plantedCropIds={plantedCropIds}
						onAddSowing={onAddSowing}
						onUpdateSowing={onUpdateSowing}
						onRemoveSowing={onRemoveSowing}
						onLocateCrop={handleLocateCrop}
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
