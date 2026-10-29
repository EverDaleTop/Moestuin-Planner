import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Crop, HarvestEntry } from './types'

import { useCollapseForm } from './useCollapseForm'
import { HarvestFormModal } from './HarvestFormModal'
import { api } from './api'

interface Props {
	catalog: Crop[]
	harvests: HarvestEntry[]
	/** gewassen die ergens in een bed staan; die zetten we vooraan in de suggestie */
	plantedCropIds?: Set<string>
	/** vanaf de zaaikalender: open het formulier met dit gewas al ingevuld */
	prefill?: { name: string; nonce: number } | null
	onAdd: (entry: Omit<HarvestEntry, 'id'>) => void
	onUpdate: (id: string, patch: Partial<HarvestEntry>) => void
	onRemove: (id: string) => void
}

function todayStr(): string {
	return new Date().toISOString().slice(0, 10)
}

function fmtEuro(v: number): string {
	return `€${v.toFixed(2).replace('.', ',')}`
}

/** "2026-03" -> "maart 2026" */
function monthLabel(key: string): string {
	const [y, m] = key.split('-')
	const d = new Date(Number(y), Number(m) - 1, 1)
	return d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
}

function monthKey(date: string): string {
	return date.slice(0, 7)
}

/** Laatste n maanden als reeks, oplopend, met kg en opbrengst per maand. */
function monthlySeries(harvests: HarvestEntry[], months: number) {
	const now = new Date()
	const keys: string[] = []
	for (let i = months - 1; i >= 0; i--) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
		keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
	}
	const kg = new Map<string, number>(keys.map((k) => [k, 0]))
	const money = new Map<string, number>(keys.map((k) => [k, 0]))
	for (const h of harvests) {
		const key = monthKey(h.date)
		if (kg.has(key)) {
			kg.set(key, (kg.get(key) ?? 0) + h.quantity)
			money.set(key, (money.get(key) ?? 0) + h.quantity * h.pricePerKg)
		}
	}
	return keys.map((key) => ({
		key,
		label: new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString('nl-NL', {
			month: 'short',
		}),
		kg: kg.get(key) ?? 0,
		money: money.get(key) ?? 0,
	}))
}

/** Supermarktprijs per kilo voor een oogstregel, of null als er geen link is. */
function storePerKg(h: HarvestEntry): number | null {
	if (!h.storePrice || !h.storeWeightKg || h.storeWeightKg <= 0) return null
	return h.storePrice / h.storeWeightKg
}

/** Rond af op twee decimalen zonder de drijvende-komma-afronding van JS. */
function round2(v: number): number {
	return Math.round((v + Number.EPSILON) * 100) / 100
}

/**
 * Hoeveel de oogst je bespaart: wat je in de winkel had moeten betalen.
 * De prijs per kilo komt uit de productlink en staat in pricePerKg, dus de
 * besparing is de hoeveelheid keer die winkelprijs. Zonder productlink is er
 * geen betrouwbare supermarktprijs en tonen we niets.
 */
function savingOf(h: HarvestEntry): number | null {
	if (storePerKg(h) === null || h.pricePerKg <= 0) return null
	return h.quantity * h.pricePerKg
}

/** Vergelijkings sleutel voor het gewas, zodat "Tomaat" en "tomaat" samenvallen. */
function cropKey(name: string): string {
	return name.trim().toLowerCase()
}

/** Vaste kleuren voor gewassen die niet in de catalogus staan. */
const FREE_COLORS = [
	'#e5533d',
	'#3d9e5c',
	 '#d9a13b',
	'#7a6ff0',
	'#2f9fb5',
	'#c2557f',
	'#6b8f3a',
	'#8a6b4f',
]

/** Zet de gewasnaam, met terugval naar de catalogus bij oudere regels. */
function resolveCropName(h: HarvestEntry, byId: Map<string, Crop>): string {
	const own = h.cropName?.trim()
	if (own) return own
	if (h.cropId) {
		const c = byId.get(h.cropId)
		if (c) return c.name
	}
	return 'Gewas'
}

export function HarvestView({
	catalog,
	harvests,
	plantedCropIds,
	prefill,
	onAdd,
	onUpdate,
	onRemove,
}: Props) {
	const sheet = useCollapseForm()
	const [editEntry, setEditEntry] = useState<HarvestEntry | null>(null)
	const [q, setQ] = useState('')

	const [cropName, setCropName] = useState('')
	const [cropOpen, setCropOpen] = useState(false)
	const cropAnchorRef = useRef<HTMLDivElement | null>(null)
	const [qty, setQty] = useState('1')
	const [date, setDate] = useState(todayStr())
	const [price, setPrice] = useState('')
	/** true zodra de gebruiker de prijs per kg zelf heeft ingetypt */
	const [priceTouched, setPriceTouched] = useState(false)
	const [bio, setBio] = useState(false)

	// --- vergelijking met een supermarktproduct ---
	const [refUrl, setRefUrl] = useState('')
	const [refWeightKg, setRefWeightKg] = useState('')
	const [refStorePrice, setRefStorePrice] = useState<number | undefined>(undefined)
	const [refTitle, setRefTitle] = useState('')
	const [refImage, setRefImage] = useState<string | undefined>(undefined)
	const [refBusy, setRefBusy] = useState(false)
	const [refError, setRefError] = useState<string | null>(null)

	const totalKg = harvests.reduce((s, h) => s + h.quantity, 0)
	const totalSaving = harvests.reduce((s, h) => s + (savingOf(h) ?? 0), 0)
	const comparedCount = harvests.filter((h) => savingOf(h) !== null).length
	/** Zonder productlink is pricePerKg een schatting, dus telt die niet mee. */
	const totalRevenue = harvests.reduce(
		(s, h) => s + (storePerKg(h) === null ? 0 : h.quantity * h.pricePerKg),
		0,
	)

	const catalogById = useMemo(
		() => new Map(catalog.map((c) => [c.id, c] as const)),
		[catalog],
	)
	const catalogByName = useMemo(() => {
		const m = new Map<string, Crop>()
		for (const c of catalog) if (c.name) m.set(cropKey(c.name), c)
		return m
	}, [catalog])

	const cropNameOf = useCallback(
		(h: HarvestEntry) => resolveCropName(h, catalogById),
		[catalogById],
	)
	const cropColorOf = (name: string) => {
		const c = catalogByName.get(cropKey(name))
		if (c) return c.color
		let hash = 0
		for (const ch of cropKey(name)) hash = (hash * 31 + ch.charCodeAt(0)) | 0
		return FREE_COLORS[Math.abs(hash) % FREE_COLORS.length]
	}
	/** catalogus-icoonsleutel voor emoji-weergave (zelfde als de kalender) */
	const cropIconOf = (name: string) => catalogByName.get(cropKey(name))?.icon ?? undefined

	/** Live berekening voor de oogst die je nu invult. */
	const draftKg = parseFloat(qty) || 0
	const draftPrice = parseFloat(price) || 0
	const draftWeight = parseFloat(refWeightKg.replace(',', '.')) || 0
	const draftPerKg = refStorePrice !== undefined && draftWeight > 0 ? refStorePrice / draftWeight : null
	/** Zolang de gebruiker de prijs niet zelf heeft ingetypt, volgt hij de productlink. */
	const draftSaving =
		draftPerKg !== null && draftPrice > 0 ? draftKg * draftPrice : null
	/** Waarschuwt bij een onwaarschijnlijke prijs per kilo: supermarkten
	 *  verkopen per verpakking, dus dan klopt het gewicht waarschijnlijk niet. */
	const draftSuspicious = draftPerKg !== null && (draftPerKg > 25 || draftPerKg < 0.4)

	/**
	 * Zet "Prijs per kg" op de prijs per kilo van het supermarktproduct.
	 * Handmatig getypte waarden blijven staan; pas bij een nieuwe oogst
	 * neemt de link weer het voortouw.
	 */
	const applyStorePrice = (storePrice: number | undefined, weightKg: number) => {
		if (priceTouched) return
		if (storePrice === undefined || !(weightKg > 0)) return
		setPrice(String(round2(storePrice / weightKg)))
	}

	const fetchReference = async () => {
		if (!refUrl.trim()) {
			setRefError('Plak eerst een productlink.')
			return
		}
		if (!(draftWeight > 0)) {
			setRefError("Vul het gewicht van de verpakking in, bijv. 1 voor 1 kg of 0.5 voor 500 g.")
			return
		}
		setRefBusy(true)
		setRefError(null)
		try {
			const info = await api.previewLink(refUrl.trim())
			setRefTitle(info.title ?? '')
			setRefImage(info.image)
			setRefStorePrice(info.price)
			if (info.price === undefined) {
				setRefError('Prijs niet op de pagina gevonden — vul de prijs zelf in.')
			} else {
				applyStorePrice(info.price, draftWeight)
			}
		} catch (e: any) {
			setRefError(e?.message ?? 'Ophalen lukte niet. Vul de prijs zelf in.')
		} finally {
			setRefBusy(false)
		}
	}

	/** Gegroepeerd per maand, nieuwste eerst */
	const groups = useMemo(() => {
		const s = q.trim().toLowerCase()
		const list = harvests
			.filter((h) => !s || cropNameOf(h).toLowerCase().includes(s))
			.slice()
			.sort((a, b) => b.date.localeCompare(a.date))

		const out: { key: string; kg: number; money: number; items: HarvestEntry[] }[] = []
		for (const h of list) {
			const key = monthKey(h.date)
			const last = out[out.length - 1]
			if (last && last.key === key) {
				last.items.push(h)
				last.kg += h.quantity
				last.money += h.quantity * h.pricePerKg
			} else {
				out.push({ key, kg: h.quantity, money: h.quantity * h.pricePerKg, items: [h] })
			}
		}
		return out
	}, [harvests, q, cropNameOf])

	/** Data voor de grafiek. */
	const months = useMemo(() => monthlySeries(harvests, 12), [harvests])
	const maxKg = Math.max(...months.map((m) => m.kg), 1)

	/** Welke gewassen er daadwerkelijk geoogst zijn, met totaal per gewas. */
	const perCrop = useMemo(() => {
		const sums = new Map<string, { name: string; kg: number; money: number; n: number }>()
		for (const h of harvests) {
			const name = cropNameOf(h)
			const key = cropKey(name)
			const cur = sums.get(key) ?? { name, kg: 0, money: 0, n: 0 }
			cur.kg += h.quantity
			cur.money += h.quantity * h.pricePerKg
			cur.n += 1
			sums.set(key, cur)
		}
		return [...sums.entries()]
			.map(([key, v]) => ({
				key,
				name: v.name,
				color: cropColorOf(v.name),
				icon: cropIconOf(v.name),
				kg: v.kg,
				money: v.money,
				n: v.n,
			}))
			.sort((a, b) => b.kg - a.kg)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [harvests, cropNameOf])
	const maxCropKg = Math.max(...perCrop.map((c) => c.kg), 1)
	const hasCharts = harvests.length > 0

	const resetForm = () => {
		setCropName('')
		setQty('1')
		setDate(todayStr())
		setPrice('')
		setPriceTouched(false)
		setBio(false)
		setRefUrl('')
		setRefWeightKg('')
		setRefStorePrice(undefined)
		setRefTitle('')
		setRefImage(undefined)
		setRefError(null)
	}

	const canSave = cropName.trim() !== '' && parseFloat(qty) > 0

	const openNew = () => {
		setEditEntry(null)
		sheet.openForm()
	}
	const openEdit = (h: HarvestEntry) => {
		setEditEntry(h)
		sheet.openForm()
	}
	const closeForm = () => {
		setEditEntry(null)
		sheet.closeForm()
	}
	const saveForm = (data: Omit<HarvestEntry, 'id'>) => {
		if (editEntry) onUpdate(editEntry.id, data)
		else onAdd(data)
		closeForm()
	}

	const submit = () => {
		if (!canSave) return
		const weight = parseFloat(refWeightKg.replace(',', '.')) || 0
		const typed = cropName.trim()
		/** Link aan de catalogus als er een gewas met dezelfde naam bestaat, voor kleur en icoon. */
		const matched = catalogByName.get(cropKey(typed))
		const payload = {
			cropName: typed,
			cropId: matched?.id,
			quantity: parseFloat(qty),
			date,
			pricePerKg: parseFloat(price) || 0,
			isOrganic: bio,
			productUrl: refUrl.trim() || undefined,
			storePrice: refStorePrice,
			storeWeightKg: weight > 0 ? weight : undefined,
		}
		if (editEntry) {
			onUpdate(editEntry.id, payload)
			setEditEntry(null)
		} else {
			onAdd(payload)
		}
		resetForm()
		sheet.closeForm()
	}

	const startEdit = (h: HarvestEntry) => {
		setEditEntry(h)
		setCropName(cropNameOf(h))
		setQty(String(h.quantity))
		setDate(h.date)
		setPrice(h.pricePerKg > 0 ? String(h.pricePerKg) : '')
		setPriceTouched(h.pricePerKg > 0)
		setBio(h.isOrganic)
		setRefUrl(h.productUrl ?? '')
		setRefWeightKg(h.storeWeightKg ? String(h.storeWeightKg) : '')
		setRefStorePrice(h.storePrice)
		setRefTitle('')
		setRefImage(undefined)
		setRefError(null)
		sheet.openForm()
	}

	/** Vanaf de zaaikalender: formulier openen met het gewas al ingevuld. */
	useEffect(() => {
		if (!prefill) return
		resetForm()
		setCropName(prefill.name)
		setEditEntry(null)
		// het gewas staat er al helemaal in: suggestielijst meteen dicht,
		// er valt niets meer aan te klikken (opslaan koppelt op naam)
		setCropOpen(false)
		sheet.openForm()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [prefill])

	void [cropOpen, cropAnchorRef, refTitle, refImage, refBusy, refError, draftSaving, draftSuspicious, openEdit, submit, fetchReference]
	return (
		<div className="oogst-wrap">
			<div className="oogst-head">
				<div>
					<h1 className="oogst-title">Oogst</h1>
					<p className="oogst-sub">Wat je uit de tuin haalt, en wat je daarmee bespaart.</p>
				</div>
				<button className="oogst-add" onClick={openNew}>
					+ Oogst toevoegen
				</button>
			</div>

			<div className="oogst-stats">
				<div className="oogst-stat oogst-stat-hero">
					<div className="oogst-stat-label">Geoogst</div>
					<div className="oogst-stat-value">{totalKg.toFixed(1)} kg</div>
				</div>
				<div className="oogst-stat">
					<div className="oogst-stat-label">{comparedCount > 0 ? 'Bespaard' : 'Zonder vergelijking'}</div>
					<div className="oogst-stat-value">{comparedCount > 0 ? fmtEuro(totalSaving) : '—'}</div>
				</div>
				<div className="oogst-stat">
					<div className="oogst-stat-label">Waarde in de winkel</div>
					<div className="oogst-stat-value">{fmtEuro(totalRevenue)}</div>
				</div>
				<div className="oogst-stat">
					<div className="oogst-stat-label">Aantal</div>
					<div className="oogst-stat-value">{harvests.length}</div>
				</div>
			</div>

			<label className="oogst-search-label">
				<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', flex: 'none' }}><circle cx="11" cy="11" r="7"></circle><path d="M16 16l4 4"></path></svg>
				<input className="oogst-search-input" type="text" placeholder="Zoek in oogst…" aria-label="Zoek in oogst" value={q} onChange={(e) => setQ(e.target.value)} />
			</label>

			<HarvestFormModal
				mounted={sheet.mounted}
				open={sheet.open}
				edit={editEntry}
				catalog={catalog}
				plantedCropIds={plantedCropIds}
				prefill={prefill}
				onClose={closeForm}
				onSave={saveForm}
			/>

			{hasCharts && (
				<div className="oogst-charts">
					<div className="oogst-card oogst-chart">
						<div className="oogst-chart-head">
							<div className="oogst-chart-title">Oogst per maand</div>
							<div className="oogst-chart-sub">Laatste 12 maanden</div>
						</div>
						<div className="oogst-bars">
							{months.map((m, i) => {
								const barPct = maxKg > 0 ? (m.kg / maxKg) * 100 : 0
								const isCurrent = i === months.length - 1
								const hasData = m.kg > 0
								const hot = isCurrent && hasData
								return (
									<div key={m.key} className="oogst-bar-col" title={hasData ? `${m.label}: ${m.kg.toFixed(1)} kg` : m.label}>
										{hasData && <span className={`oogst-bar-val${hot ? ' oogst-bar-val-hot' : ''}`}>{m.kg.toFixed(1)} kg</span>}
										<div className="oogst-bar-area">
											<i className={`oogst-bar${hot ? ' oogst-bar-hot' : ''}`} style={{ height: hasData ? `${Math.max(barPct, 4)}%` : 0 }} />
										</div>
										<span className={hot ? 'mh-active' : undefined}>{m.label.toUpperCase()}</span>
									</div>
								)
							})}
						</div>
					</div>

					<div className="oogst-card oogst-chart">
						<div className="oogst-chart-head">
							<div className="oogst-chart-title">Per gewas</div>
							<div className="oogst-chart-sub">Alle oogst</div>
						</div>
						<div className="oogst-crop-list">
							{perCrop.map((c) => (
								<div key={c.key} className="oogst-crop-row">
									<span className="oogst-crop-dot" style={{ background: c.color }} />
									<span className="oogst-crop-name">{c.name}</span>
									<div className="oogst-crop-track">
										<div className="oogst-crop-fill" style={{ width: `${(c.kg / maxCropKg) * 100}%`, background: c.color }} />
									</div>
									<span className="oogst-crop-kg">{c.kg.toFixed(1)} kg</span>
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{groups.length === 0 ? (
				<div className="oogst-card oogst-empty">
					<i className='fa-solid fa-carrot' />
					<p style={{ marginTop: 12 }}>
						{q.trim()
							? 'Geen oogst gevonden met die zoekterm.'
							: 'Nog geen oogst geregistreerd. Klik op "Oogst toevoegen" om te beginnen.'}
					</p>
				</div>
			) : (
				<div className="oogst-card oogst-list">
					{groups.map((group, gi) => (
						<div key={group.key} style={{ animationDelay: `${Math.min(gi, 11) * 35}ms` }}>
							<div className="oogst-month-head">
								<div className="oogst-month-title">{monthLabel(group.key)}</div>
								<div className="oogst-month-sum">{group.kg.toFixed(1)} kg <strong>{fmtEuro(group.money)}</strong></div>
							</div>
							<div className="oogst-month-items">
								{group.items.map((h) => {
									const saving = savingOf(h)
									const name = cropNameOf(h)
									return (
										<div key={h.id} className="oogst-row">
											<div className="oogst-row-icon">
												<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z"></path></svg>
											</div>
											<div className="oogst-row-main">
												<div className="oogst-row-title">
													<b>{name}</b>
													{h.isOrganic && <span className="oogst-bio">BIO</span>}
												</div>
												<div className="oogst-chips">
													<span className="oogst-chip oogst-chip-ink"><i className="fa-solid fa-scale-balanced" />{h.quantity} kg</span>
													<span className="oogst-chip">
														<i className="fa-solid fa-calendar" />{new Date(h.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
													</span>
													{h.pricePerKg > 0 && (
														<span className="oogst-chip"><i className="fa-solid fa-tag" />{fmtEuro(h.pricePerKg)}/kg</span>
													)}
													{saving !== null && (
														<span className="oogst-chip oogst-chip-save"><i className="fa-solid fa-piggy-bank" />bespaard {fmtEuro(saving)}</span>
													)}
												</div>
												{h.productUrl && (
													<a href={h.productUrl} target='_blank' rel='noopener noreferrer' className="oogst-row-link">Bekijk product</a>
												)}
											</div>
											{h.pricePerKg > 0 && (
												<div className="oogst-row-total">{fmtEuro(h.quantity * h.pricePerKg)}</div>
											)}
										<div className="pd-card-actions">
											<button onClick={() => startEdit(h)} title="Bewerken" aria-label="Bewerken">
												<i className="fa-solid fa-pen" />
											</button>
											<button className="btn-danger" onClick={() => onRemove(h.id)} title="Verwijderen" aria-label="Verwijderen">
												<i className="fa-solid fa-trash" />
											</button>
										</div>
										</div>
									)
								})}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)

}
