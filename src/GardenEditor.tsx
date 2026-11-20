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
	TodoItem,
} from './types'
import { GardenCanvas } from './GardenCanvas'
import { LogoMark } from './Logo'
import type { PreviewPayload } from './realtime'
import { Inspector, inspectorElementInVeld } from './Inspector'
import type { PresenceMember } from './realtime'
import { ConfirmModal } from './ConfirmModal'
import { HarvestView } from './HarvestExpenseView'
import { ExpensesView } from './ExpensesView'
import { ShoppingListView } from './ShoppingListView'
import { TodoListView } from './TodoListView'
import { PlantCatalog } from './PlantDatabase'
import { CalendarView } from './CalendarView'
import { GardenSettings } from './GardenSettings'
import { SidebarThemeRow, ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { sowableInMonth, harvestableInMonth } from './sowing'
import { PX_PER_M } from './storage'
import type { Theme } from './useTheme'

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
	/** icoontje vÃ³Ã³r het getal in de badge, bv. 'fa-seedling' */
	countIcon?: string
	hint?: string
}

/**
 * Tab met een uitklapmenu eronder. De tab zelf toont het actieve item van de
 * groep, zodat je nooit in een vergeten submenu zit.
 */
function NavMenu({
	label,
	icon,
	activeKey,
	items,
	onSelect,
}: {
	label: string
	icon: string
	activeKey: string
	items: MenuItem[]
	onSelect: (key: string) => void
}) {
	const [open, setOpen] = useState(false)
	const [closing, setClosing] = useState(false)
	const rootRef = useRef<HTMLDivElement | null>(null)

	useEffect(() => {
		if (!open) return
		const onDown = (e: PointerEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				requestClose()
			}
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') requestClose()
		}
		document.addEventListener('pointerdown', onDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('pointerdown', onDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [open])

	// badge op de tab zelf: expliciete badges, of Ã©Ã©n opgetelde terugval
	const current = items.find((i) => i.key === activeKey)
	const active = current !== undefined
	const closeTimer = useRef<number | null>(null)
	const closeAnimTimer = useRef<number | null>(null)
	// actieve sleutel op het moment dat het sluiten begint: tijdens de
	// sluitanimatie blijft die staan, zodat de markering niet verspringt
	// voordat het menu weg is.
	const frozenKey = useRef<string | null>(null)

	const cancelClose = () => {
		if (closeTimer.current !== null) {
			window.clearTimeout(closeTimer.current)
			closeTimer.current = null
		}
		if (closeAnimTimer.current !== null) {
			window.clearTimeout(closeAnimTimer.current)
			closeAnimTimer.current = null
		}
	}

	const openNow = () => {
		cancelClose()
		frozenKey.current = null
		setClosing(false)
		setOpen(true)
	}

	const requestClose = () => {
		cancelClose()
		frozenKey.current = activeKey
		setClosing(true)
		closeAnimTimer.current = window.setTimeout(() => {
			setOpen(false)
			setClosing(false)
			closeAnimTimer.current = null
		}, 190)
	}

	// Hover opent, met een kleine vertraging bij sluiten zodat je van de tab
	// naar het menu kunt bewegen zonder dat het dichtklapt.
	const scheduleClose = () => {
		cancelClose()
		closeTimer.current = window.setTimeout(() => requestClose(), 80)
	}

	useEffect(() => cancelClose, [])

	return (
		<div
			className='ge-menu'
			ref={rootRef}
			onMouseEnter={() => {
				if (window.matchMedia('(hover: hover)').matches) openNow()
			}}
			onMouseLeave={() => {
				if (window.matchMedia('(hover: hover)').matches) scheduleClose()
			}}>
			<button
				className={`nav-tab${active ? ' nav-active' : ''}`}
				onClick={() => (open && !closing ? requestClose() : openNow())}
				aria-haspopup='menu'
				aria-expanded={open && !closing}
				title={current?.label ?? label}>
				<i className={`fa-solid ${icon}`} aria-hidden='true' />
				{label}
				<i className={`fa-solid fa-chevron-down ge-menu-caret${open && !closing ? ' open' : ''}`} />
			</button>
			{(open || closing) && (
				<div className={`ge-menu-pop${closing ? ' closing' : ''}`} role='menu'>
					{items.map((i) => {
						const shownActive =
							closing && frozenKey.current !== null
								? i.key === frozenKey.current
								: i.key === activeKey
						return (
							<button
								key={i.key}
								type='button'
								role='menuitem'
								className={
									shownActive ? 'ge-menu-item is-active' : 'ge-menu-item'
								}
								onClick={() => {
									onSelect(i.key)
									requestClose()
								}}>
								<span className='ge-menu-ic' aria-hidden='true'>
									<i className={`fa-solid ${i.icon}`} />
								</span>
								<span className='ge-menu-text'>
									<span className='ge-menu-name'>{i.label}</span>
									{i.hint && <span className='ge-menu-hint'>{i.hint}</span>}
								</span>
								{shownActive && (
									<i className='fa-solid fa-check ge-menu-check' />
								)}
								{!shownActive && !!i.count && (
									<span className='ge-menu-count'>
										{i.count}
									</span>
								)}
								{!shownActive && !i.count && (
									<i className='fa-solid fa-chevron-right ge-menu-go' aria-hidden='true' />
								)}
							</button>
						)
					})}
				</div>
			)}
		</div>
	)
}

interface Props {
	garden: Garden
	catalog: Crop[]
	theme: Theme
	onToggleTheme: () => void
	presence?: number
	presenceMembers?: PresenceMember[]
	currentUserId: string
	username: string
	userNames: Record<string, string>
	onLogout: () => void
	onOpenProfile: () => void
	onUnshareMember: (userId: string) => Promise<void>
	onNameChange: (name: string) => void
	onGardenUpdated: (garden: Garden) => void
	onDeleteGarden: () => void
	onBack: () => void
	onAddFrame: (
		type: 'bed' | 'path' | 'veld',
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
	onAddTodo: (entry: Omit<TodoItem, 'id' | 'createdAt' | 'done' | 'createdBy'>) => void
	onUpdateTodo: (todoId: string, patch: Partial<TodoItem>) => void
	onRemoveTodo: (todoId: string) => void
	onUndo: () => void
	onRedo: () => void
	onLiveMove?: (updates: { id: string; x?: number; y?: number; widthM?: number; heightM?: number; crops?: { instanceId: string; cropId: string; rows: number; rowSpacing?: number; plantSpacing?: number; cols?: number; padding?: number; area?: { x: number; y: number; w: number; h: number } }[] }[]) => void
	onLivePreview?: (preview: PreviewPayload) => void
	livePreview?: PreviewPayload | null
	onAddCropToCatalog: (crop: Omit<Crop, 'id'>) => void
	onUpdateCropInCatalog: (cropId: string, patch: Partial<Crop>) => void
	onRemoveCropFromCatalog: (cropId: string) => void
	/** korte entrance-animatie voor de canvasinhoud (alleen bij openen) */
	animateIn?: boolean
}

export function GardenEditor(props: Props) {
	const {
		garden,
		catalog,
		theme,
		onToggleTheme,
		presence,
		presenceMembers = [],
		currentUserId,
		username,
		userNames,
		onLogout,
		onOpenProfile,
		onUnshareMember,
		onNameChange,
		onGardenUpdated,
		onDeleteGarden,
		onBack,
		onAddFrame,
		onAddObject,
		onUpdateElement,
		onRemoveElement,
		onRemoveElements,
		onApplyElements,
		onDuplicateElements,
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
		onAddTodo,
		onUpdateTodo,
		onRemoveTodo,
		onUndo,
		onRedo,
		onLiveMove,
		onLivePreview,
		livePreview,
		onUpdateCropInCatalog,
		onRemoveCropFromCatalog,
		animateIn = false,
	} = props

	const isOwner = garden.ownerId === currentUserId

	/**
	 * De server stuurt de volledige ledenlijst mee. Valt die om de een of
	 * andere reden weg terwijl de teller wÃ©l groter is dan 1 (bv. een oudere,
	 * niet-herstartte server die alleen `count` stuurt), dan zorgen we
	 * ervoor dat je jezelf in elk geval als online ziet â€” anders zou je
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

	const [editorTab, setEditorTab] = useState<
		'canvas' | 'gewassen' | 'kalender' | 'oogst' | 'taken' | 'uitgaven' | 'boodschappen' | 'instellingen'
	>(() => {
		try {
			const saved = localStorage.getItem('mp_editor_tab')
			if (
				saved === 'canvas' ||
				saved === 'gewassen' ||
				saved === 'kalender' ||
				saved === 'oogst' ||
				saved === 'taken' ||
				saved === 'uitgaven' ||
				saved === 'boodschappen' ||
				saved === 'instellingen'
			) {
				return saved
			}
		} catch { /* ignore */ }
		return 'canvas'
	})

	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const [toast, setToast] = useState<string | null>(null)
	const toastTimer = useRef<number | null>(null)
	const [saveFlash, setSaveFlash] = useState(false)
	const saveTimer = useRef<number | null>(null)
	const prevUpdatedAt = useRef(garden.updatedAt)
	const titleRef = useRef<HTMLInputElement | null>(null)
	const [selectedIds, setSelectedIds] = useState<string[]>([])
	const [selectedCropId, setSelectedCropId] = useState<string | null>(null)
	const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false)
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
	const [locked, setLocked] = useState(true)
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

	useEffect(() => {
		if (!mobileMenuOpen) return
		const prev = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.body.style.overflow = prev
		}
	}, [mobileMenuOpen])

	useEffect(() => {
		if (garden.updatedAt === prevUpdatedAt.current) return
		prevUpdatedAt.current = garden.updatedAt
		setSaveFlash(true)
		if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
		saveTimer.current = window.setTimeout(() => {
			setSaveFlash(false)
			saveTimer.current = null
		}, 1600)
	}, [garden.updatedAt])

	useEffect(
		() => () => {
			if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
			if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
		},
		[],
	)

	const showToast = useCallback((message: string) => {
		setToast(message)
		if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
		toastTimer.current = window.setTimeout(() => {
			setToast(null)
			toastTimer.current = null
		}, 1800)
	}, [])

	const handleUndo = useCallback(() => {
		onUndo()
		showToast('Ongedaan gemaakt')
	}, [onUndo, showToast])

	const handleRedo = useCallback(() => {
		onRedo()
		showToast('Opnieuw uitgevoerd')
	}, [onRedo, showToast])

	// Delete / Backspace vraagt eerst om bevestiging via een modaal.
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
			setConfirmDeleteSelected(true)
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
				if (mobileMenuOpen) {
					setMobileMenuOpen(false)
					return
				}
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
	}, [toggleSnap, mobileMenuOpen])

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
				if (e.shiftKey) handleRedo()
				else handleUndo()
			} else if (k === 'y') {
				e.preventDefault()
				handleRedo()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [handleUndo, handleRedo])

	const handleAddFrame = (
		type: 'bed' | 'path' | 'veld',
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

	const openTodos = useMemo(
		() => (garden.todos ?? []).filter((t) => !t.done).length,
		[garden.todos],
	)

	/** deelnemers van de tuin (eigenaar eerst), o.a. voor "voor wie" bij boodschappen en uitgaven */
	const gardenMembers = useMemo(
		() =>
			[garden.ownerId, ...garden.sharedWith.filter((uid) => uid !== garden.ownerId)].map((id) => ({
				id,
				name: userNames[id] ?? (id === currentUserId ? username : 'Onbekend'),
			})),
		[garden.ownerId, garden.sharedWith, userNames, currentUserId, username],
	)

	const selected = useMemo(
		() =>
			selectedIds.length > 0
				? (garden.elements.find((e) => e.id === selectedIds[0]) ?? null)
				: null,
		[garden.elements, selectedIds],
	)

	const normCropName = (s: string) => s.trim().toLowerCase()

	/** alle gewas-ids die ergens in een bed geplant staan (id Ã³f naam, net als
	 *  bij zaaiingen/oogsten â€” ids kunnen verouderd of dubbel zijn) */
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
	 * ga naar de tuin-tab en centreer de camera erop. Matcht op id Ã³f naam,
	 * zodat het ook werkt bij dubbele of verouderde catalogusrijen. Bij Ã©Ã©n
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
			// Bij Ã©Ã©n bed ook de planting zelf selecteren: die krijgt dan de
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

	/**
	 * Vanuit een taak naar de gekoppelde plek in de tuin: precies zoals
	 * "toon in tuin" bij de kalender, maar dan op één bed of veld.
	 */
	const handleLocateElement = useCallback(
		(elementId: string) => {
			const el = garden.elements.find((e) => e.id === elementId)
			if (!el) return
			focusN.current += 1
			setFocusSignal({
				x: el.x + (el.widthM * PX_PER_M) / 2,
				y: el.y + (el.heightM * PX_PER_M) / 2,
				n: focusN.current,
			})
			setTool('select')
			setSelectedIds([el.id])
			setSelectedCropId(null)
			setEditorTab('canvas')
		},
		[garden.elements],
	)

	return (
		<div className='ge-wrap'>
			<header className='ge-header'>
				<div className='ge-brand'>
					<button
						className='ge-back'
						onClick={onBack}
						title='Terug naar tuinen'
						aria-label='Terug naar tuinen'>
						<i className='fa-solid fa-arrow-left' />
					</button>
					<span className='ge-brand-logo' aria-hidden='true'>
						<LogoMark size={34} />
					</span>
					<div className='ge-title-wrap'>
						<input
							ref={titleRef}
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
				</div>
				<div className='ge-tabs-slot'>
					<div className={`ge-editor-tabs${mobileMenuOpen ? ' is-open' : ''}`}>
					<button
						className={`nav-tab ${editorTab === 'canvas' ? 'nav-active' : ''}`}
						onClick={() => { setEditorTab('canvas'); setMobileMenuOpen(false) }}>
						<i className='fa-solid fa-map' aria-hidden='true' />
						Tuin
					</button>
					<NavMenu
						label='Gewassen'
						icon='fa-carrot'
						activeKey={editorTab}
						items={[
							{
								key: 'gewassen',
								label: 'Gewassenlijst',
								icon: 'fa-seedling',
								hint: 'Alles in deze tuin',
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
						onSelect={(key) => { setEditorTab(key as typeof editorTab); setMobileMenuOpen(false) }}
					/>
					<button
						className={`nav-tab ${editorTab === 'oogst' ? 'nav-active' : ''}`}
						onClick={() => { setEditorTab('oogst'); setMobileMenuOpen(false) }}>
						<i className='fa-solid fa-basket-shopping' aria-hidden='true' />
						Oogst
					</button>
					<button
						className={`nav-tab ${editorTab === 'taken' ? 'nav-active' : ''}`}
						onClick={() => { setEditorTab('taken'); setMobileMenuOpen(false) }}>
						<i className='fa-solid fa-list-check' aria-hidden='true' />
						Taken
						{openTodos > 0 && <span className='nav-tab-count'>{openTodos}</span>}
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
								hint: 'Kosten en inkomsten',
							},
							{
								key: 'boodschappen',
								label: 'Boodschappen',
								icon: 'fa-cart-shopping',
								count: openShopping,
								hint: 'Wat je nog moet halen',
							},
							{
								key: 'instellingen',
								label: 'Instellingen',
								icon: 'fa-gear',
								hint: 'Tuinnaam en leden',
							},
						]}
						onSelect={(key) => { setEditorTab(key as typeof editorTab); setMobileMenuOpen(false) }}
					/>
				</div>
				</div>
				<div className='ge-actions'>
					{saveFlash && (
						<span className='ge-save-state' role='status'>
							<i className='fa-solid fa-check' aria-hidden='true' /> Opgeslagen
						</span>
					)}
					<UserMenu username={username} onLogout={onLogout} onOpenProfile={onOpenProfile} />
					<ThemeToggle theme={theme} onToggle={onToggleTheme} />
					<button
						type='button'
						className='ge-side-toggle'
						onClick={() => setMobileMenuOpen((o) => !o)}
						aria-label={mobileMenuOpen ? 'Menu sluiten' : 'Menu openen'}
						aria-expanded={mobileMenuOpen}
						aria-controls='ge-editor-sidebar'>
						<i className='fa-solid fa-bars ge-nav-icon ge-nav-icon-bars' aria-hidden='true' />
						<i className='fa-solid fa-xmark ge-nav-icon ge-nav-icon-close' aria-hidden='true' />
					</button>
				</div>
			</header>
			<div className={`ge-side-backdrop${mobileMenuOpen ? ' open' : ''}`} onClick={() => setMobileMenuOpen(false)} />
			<aside
				id='ge-editor-sidebar'
				className={`ge-sidebar${mobileMenuOpen ? ' open' : ''}`}
				aria-label='Menu'>
				<button
					type='button'
					className='ge-side-profile'
					onClick={() => { setMobileMenuOpen(false); onOpenProfile() }}
					title='Open je profiel'
					aria-label={`Open profiel van ${username}`}>
					<span className='gl-avatar ge-side-avatar' aria-hidden='true'>
						{(username.trim()[0] ?? '?').toUpperCase()}
					</span>
					<span className='ge-side-profile-tx'>
						<strong>{username}</strong>
						<span className={`presence-tag ${isOwner ? 'presence-tag-owner' : 'presence-tag-self'}`}>
							{isOwner ? 'Eigenaar' : 'Tuinlid'}
						</span>
					</span>
					<i className='fa-solid fa-chevron-right ge-side-profile-go' aria-hidden='true' />
				</button>
				<div className='ge-side-sep' aria-hidden='true' />
				<nav className='ge-side-nav'>
					<button
						className={`ge-side-item${editorTab === 'canvas' ? ' is-active' : ''}`}
						onClick={() => { setEditorTab('canvas'); setMobileMenuOpen(false) }}
						aria-current={editorTab === 'canvas' ? 'page' : undefined}>
						<i className='fa-solid fa-map' aria-hidden='true' />
						<span className='ge-side-label'>Tuin</span>
					</button>
					<button
						className={`ge-side-item${editorTab === 'gewassen' ? ' is-active' : ''}`}
						onClick={() => { setEditorTab('gewassen'); setMobileMenuOpen(false) }}
						aria-current={editorTab === 'gewassen' ? 'page' : undefined}>
						<i className='fa-solid fa-seedling' aria-hidden='true' />
						<span className='ge-side-label'>Gewassen</span>
					</button>
					<button
						className={`ge-side-item${editorTab === 'kalender' ? ' is-active' : ''}`}
						onClick={() => { setEditorTab('kalender'); setMobileMenuOpen(false) }}
						aria-current={editorTab === 'kalender' ? 'page' : undefined}>
						<i className='fa-solid fa-calendar-days' aria-hidden='true' />
						<span className='ge-side-label'>Kalender</span>
					</button>
					<button
						className={`ge-side-item${editorTab === 'oogst' ? ' is-active' : ''}`}
						onClick={() => { setEditorTab('oogst'); setMobileMenuOpen(false) }}
						aria-current={editorTab === 'oogst' ? 'page' : undefined}>
						<i className='fa-solid fa-basket-shopping' aria-hidden='true' />
						<span className='ge-side-label'>Oogst</span>
					</button>
					<button
						className={`ge-side-item${editorTab === 'taken' ? ' is-active' : ''}`}
						onClick={() => { setEditorTab('taken'); setMobileMenuOpen(false) }}
						aria-current={editorTab === 'taken' ? 'page' : undefined}>
						<i className='fa-solid fa-list-check' aria-hidden='true' />
						<span className='ge-side-label'>Taken</span>
						{openTodos > 0 && <span className='ge-side-count'>{openTodos}</span>}
					</button>
					<div className='ge-side-sep' aria-hidden='true' />
					<button
						className={`ge-side-item${editorTab === 'uitgaven' ? ' is-active' : ''}`}
						onClick={() => { setEditorTab('uitgaven'); setMobileMenuOpen(false) }}
						aria-current={editorTab === 'uitgaven' ? 'page' : undefined}>
						<i className='fa-solid fa-receipt' />
						<span className='ge-side-label'>Uitgaven</span>
					</button>
					<button
						className={`ge-side-item${editorTab === 'boodschappen' ? ' is-active' : ''}`}
						onClick={() => { setEditorTab('boodschappen'); setMobileMenuOpen(false) }}
						aria-current={editorTab === 'boodschappen' ? 'page' : undefined}>
						<i className='fa-solid fa-cart-shopping' />
						<span className='ge-side-label'>Boodschappen</span>
						{openShopping > 0 && <span className='ge-side-count'>{openShopping}</span>}
					</button>
					<div className='ge-side-sep' aria-hidden='true' />
					<button
						className={`ge-side-item${editorTab === 'instellingen' ? ' is-active' : ''}`}
						onClick={() => { setEditorTab('instellingen'); setMobileMenuOpen(false) }}
						aria-current={editorTab === 'instellingen' ? 'page' : undefined}>
						<i className='fa-solid fa-gear' aria-hidden='true' />
						<span className='ge-side-label'>Instellingen</span>
					</button>
				</nav>
				<div className='ge-side-foot'>
					<button
						className='ge-side-item'
						onClick={() => { setMobileMenuOpen(false); onLogout(); }}>
						<i className='fa-solid fa-right-from-bracket' aria-hidden='true' />
						<span className='ge-side-label'>Uitloggen</span>
					</button>
					<SidebarThemeRow theme={theme} onToggle={onToggleTheme} />
				</div>
			</aside>

			{editorTab === 'canvas' ? (
				<div className='ge-body' key='canvas'>
					<div className={`ge-canvas${animateIn ? ' is-entering' : ''}`}>
						<GardenCanvas
							elements={garden.elements}
							catalog={catalog}
							tool={tool}
							frameType={frameType}
							locked={locked}
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
							onToggleSelect={(ids, mode) => {
								setSelectedCropId(null)
								setSelectedIds((prev) => {
									if (mode === 'add') return [...new Set([...prev, ...ids])]
									const set = new Set(prev)
									for (const id of ids) {
										if (set.has(id)) set.delete(id)
										else set.add(id)
									}
									return [...set]
								})
							}}
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
								data-tooltip='Voorwerp toevoegen (Bank, â€¦)'>
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
									onClick={() => setConfirmDeleteSelected(true)}
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
									onClick={handleUndo}
									aria-label='Ongedaan maken'
									data-tooltip='Ongedaan maken (Ctrl+Z)'>
									<IconUndo />
								</button>
								<button
									onClick={handleRedo}
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
							<div
								className='ge-tools'
								role='group'
								aria-label='Vergrendelen'>
								<button
									className={locked ? 'tool-active' : ''}
									onClick={() => setLocked((v) => !v)}
									aria-label={locked ? 'Ontgrendelen' : 'Vergrendelen'}
									aria-pressed={locked}
									data-tooltip={locked ? 'Ontgrendelen' : 'Vergrendelen'}>
									<FaIcon cls={locked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open'} />
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
						onSelectCrop={setSelectedCropId}
						onBack={() => {
							if (!selected) return
							if (selected.type !== 'veld') {
								const veld = garden.elements.find(
									(e) => e.type === 'veld' && e.id !== selected.id && inspectorElementInVeld(selected, e),
								)
								if (veld) {
									setSelectedIds([veld.id])
									setSelectedCropId(null)
									return
								}
							} else {
								const parent = garden.elements.find(
									(e) => e.type === 'veld' && e.id !== selected.id && inspectorElementInVeld(selected, e),
								)
								if (parent) {
									setSelectedIds([parent.id])
									setSelectedCropId(null)
									return
								}
							}
							setSelectedIds([])
							setSelectedCropId(null)
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
				<div className='shop-scroll' key='gewassen'>
					<div className='shop-page cal-page'>
						<PlantCatalog
							catalog={catalog}
							onAdd={onAddCropToCatalog}
							onUpdate={onUpdateCropInCatalog}
							onDelete={onRemoveCropFromCatalog}
						/>
					</div>
				</div>
			) : editorTab === 'kalender' ? (
				<div className='shop-scroll' key='kalender'>
					<CalendarView
						catalog={catalog}
						sowings={garden.sowings ?? []}
						plantedCropIds={plantedCropIds}
						onAddSowing={onAddSowing}
						onUpdateSowing={onUpdateSowing}
						onRemoveSowing={onRemoveSowing}
						onLocateCrop={handleLocateCrop}
					/>
				</div>
			) : editorTab === 'oogst' ? (
				<div className='shop-scroll' key='oogst'>
					<HarvestView
						catalog={catalog}
						harvests={garden.harvests}
						onAdd={onAddHarvest}
						onUpdate={onUpdateHarvest}
						onRemove={onRemoveHarvest}
					/>
				</div>
			) : editorTab === 'taken' ? (
				<div className='shop-scroll' key='taken'>
					<TodoListView
						items={garden.todos ?? []}
						elements={garden.elements}
						userNames={userNames}
						onAdd={onAddTodo}
						onUpdate={onUpdateTodo}
						onRemove={onRemoveTodo}
						onLocateElement={handleLocateElement}
					/>
				</div>
			) : editorTab === 'uitgaven' ? (
				<div className='shop-scroll' key='uitgaven'>
					<ExpensesView
						expenses={garden.expenses}
						incomes={garden.incomes ?? []}
						members={gardenMembers}
						currentUserId={currentUserId}
						onAdd={onAddExpense}
						onUpdate={onUpdateExpense}
						onRemove={onRemoveExpense}
						onAddIncome={onAddIncome}
						onUpdateIncome={onUpdateIncome}
						onRemoveIncome={onRemoveIncome}
					/>
				</div>
			) : editorTab === 'instellingen' ? (
				<div className='shop-scroll settings-scroll' key='instellingen'>
					<div className='shop-page'>
						<GardenSettings
							garden={garden}
							catalog={catalog}
							name={name}
							currentUserId={currentUserId}
							userNames={userNames}
							onlineMembers={onlineMembers}
							isOwner={isOwner}
							onNameChange={(next) => {
								setName(next)
								onNameChange(next)
							}}
							onGardenUpdated={onGardenUpdated}
							onUnshareMember={onUnshareMember}
							onDeleteGarden={onDeleteGarden}
						/>
					</div>
				</div>
			) : (
				<div className='shop-scroll' key='boodschappen'>
				<ShoppingListView
					items={garden.shopping ?? []}
					members={gardenMembers}
					currentUserId={currentUserId}
					onAdd={onAddShopping}
					onUpdate={onUpdateShopping}
					onRemove={onRemoveShopping}
					onToggleDone={onToggleShoppingDone}
				/>
				</div>
			)}
			{toast && (
				<div className='ge-toast' role='status' aria-live='polite'>
					{toast}
				</div>
			)}
			<ConfirmModal
				open={confirmDeleteSelected}
				title={cropContext ? 'Gewas verwijderen?' : 'Selectie verwijderen?'}
				message={
					cropContext ? (
						<>
							Weet je zeker dat je dit stuk gewas wilt verwijderen? Dit kan niet ongedaan worden
							gemaakt.
						</>
					) : (
						<>
							Weet je zeker dat je {selectedIds.length}{" "}
							{selectedIds.length === 1 ? "element" : "elementen"} wilt verwijderen? Dit kan niet
							ongedaan worden gemaakt.
						</>
					)
				}
				onCancel={() => setConfirmDeleteSelected(false)}
				onConfirm={() => {
					setConfirmDeleteSelected(false)
					deleteSelected()
				}}
			/>
		</div>
	)
}

