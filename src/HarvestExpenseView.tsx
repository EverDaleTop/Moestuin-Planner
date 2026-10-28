import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Crop, HarvestEntry } from './types'
import { NumField } from './FormFields'
import { DateField } from './DateField'
import { CropSuggestions } from './CropSuggestions'
import { CropGlyph } from './CropIconPicker'
import { useCollapseForm } from './useCollapseForm'
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
	const form = useCollapseForm()
	const [editingId, setEditingId] = useState<string | null>(null)
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
		if (editingId) {
			onUpdate(editingId, payload)
			setEditingId(null)
		} else {
			onAdd(payload)
		}
		resetForm()
		form.closeForm()
	}

	const startEdit = (h: HarvestEntry) => {
		setEditingId(h.id)
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
		form.openForm()
	}

	/** Vanaf de zaaikalender: formulier openen met het gewas al ingevuld. */
	useEffect(() => {
		if (!prefill) return
		resetForm()
		setCropName(prefill.name)
		setEditingId(null)
		// het gewas staat er al helemaal in: suggestielijst meteen dicht,
		// er valt niets meer aan te klikken (opslaan koppelt op naam)
		setCropOpen(false)
		form.openForm()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [prefill])

	return (
		<div className='shop-page oogst-page'>
			<div className='shop-hero'>
				<div className='shop-hero-text'>
					<h2>
						<i className='fa-solid fa-carrot' /> Oogst
					</h2>
					<p>Wat je uit de tuin haalt, en wat je daarmee bespaart.</p>
				</div>
				<button
					className='btn-primary shop-add-btn'
					onClick={() => {
						if (form.open) {
							resetForm()
							form.closeForm()
						} else {
							resetForm()
							form.openForm()
						}
					}}>
					{form.open ? (
						<>
							<i className='fa-solid fa-xmark' /> Annuleren
						</>
					) : (
						<>
							<i className='fa-solid fa-plus' /> Oogst toevoegen
						</>
					)}
				</button>
			</div>

			<div className='shop-stats'>
				<div className='shop-stat'>
					<div className='shop-stat-icon shop-stat-icon-open'>
						<i className='fa-solid fa-weight-hanging' />
					</div>
					<div className='shop-stat-info'>
						<span className='shop-stat-value'>{totalKg.toFixed(1)} kg</span>
						<span className='shop-stat-label'>Geoogst</span>
					</div>
				</div>
				<div className='shop-stat'>
					<div className='shop-stat-icon shop-stat-icon-total'>
						<i className='fa-solid fa-piggy-bank' />
					</div>
					<div className='shop-stat-info'>
						<span className='shop-stat-value'>
							{comparedCount > 0 ? fmtEuro(totalSaving) : '—'}
						</span>
						<span className='shop-stat-label'>
							{comparedCount > 0 ? 'Bespaard' : 'Zonder vergelijking'}
						</span>
					</div>
				</div>
				<div className='shop-stat'>
					<div className='shop-stat-icon shop-stat-icon-done'>
						<i className='fa-solid fa-sack-dollar' />
					</div>
					<div className='shop-stat-info'>
						<span className='shop-stat-value'>{fmtEuro(totalRevenue)}</span>
						<span className='shop-stat-label'>Waarde in de winkel</span>
					</div>
				</div>
				<div className='shop-stat'>
					<div className='shop-stat-icon shop-stat-icon-neutral'>
						<i className='fa-solid fa-carrot' />
					</div>
					<div className='shop-stat-info'>
						<span className='shop-stat-value'>{harvests.length}</span>
						<span className='shop-stat-label'>Aantal</span>
					</div>
				</div>
			</div>

			{form.mounted && (
				<div ref={form.formRef} className={`shop-form ${form.open ? '' : 'shop-form-closing'}`}>
					<div className='shop-form-inner'>
						<div className='shop-form-panel'>
							<div className='shop-form-header'>
								<i className='fa-solid fa-carrot' />
								<span>{editingId ? 'Oogst bewerken' : 'Nieuwe oogst'}</span>
							</div>
							<div className='shop-form-grid shop-form-grid-3'>
								<div className='shop-form-field shop-form-field-crop'>
									<label htmlFor='harvest-crop'>Gewas *</label>
									<div className='crop-input' ref={cropAnchorRef}>
										<input
											id='harvest-crop'
											type='text'
											value={cropName}
											onChange={(e) => setCropName(e.target.value)}
											onFocus={() => setCropOpen(true)}
											placeholder='Bijv. Tomaat, Courgette…'
											autoComplete='off'
											role='combobox'
											aria-expanded={cropOpen}
											aria-autocomplete='list'
											autoFocus
										/>
									</div>
									{catalog.length > 0 && cropOpen && cropName.trim() !== '' && (
										<CropSuggestions
											catalog={catalog}
											plantedCropIds={plantedCropIds}
											anchorRef={cropAnchorRef}
											query={cropName}
											onPick={(name) => {
												setCropName(name)
												setCropOpen(false)
											}}
											onClose={() => setCropOpen(false)}
										/>
									)}
								</div>
								<div className='shop-form-field'>
									<label>Hoeveelheid (kg) *</label>
									<NumField
										value={qty}
										onChange={setQty}
										min='0.1'
										step={0.1}
										stepper
									/>
								</div>
								<div className='shop-form-field'>
									<label>Datum</label>
									<DateField value={date} onChange={setDate} />
								</div>
								<div className='shop-form-field'>
									<label htmlFor='harvest-price'>
										Prijs per kg (€)
										{!priceTouched && draftPerKg !== null && (
											<span className='shop-form-hint-inline'>uit de productlink</span>
										)}
									</label>
									<NumField
										id='harvest-price'
										value={price}
										onChange={(v) => {
											setPrice(v)
											setPriceTouched(true)
										}}
										min='0'
										step={0.01}
										placeholder='0.00'
										stepper
									/>
								</div>
							</div>

							<div className='shop-form-preview-line'>
								<span className='shop-form-live-label'>
									{draftSaving !== null ? 'Bespaard met deze oogst' : 'Waarde van deze oogst'}
								</span>
								<span className='shop-form-live'>
									{draftKg.toFixed(1)} kg{draftPrice > 0 ? ` × ${fmtEuro(draftPrice)}` : ''}
									{draftPrice > 0 && (
										<strong> = {fmtEuro(draftKg * draftPrice)}</strong>
									)}
								</span>
							</div>

							{/* --- Vergelijk met een supermarktproduct --- */}
							<div className='ref-compare'>
								<div className='ref-compare-head'>
									<i className='fa-solid fa-cart-shopping' />
									<span>Hoeveel bespaart dit?</span>
									<span className='ref-compare-optional'>optioneel</span>
								</div>
								<p className='ref-hint'>
									Plak het product uit de supermarkt en vul het gewicht van de verpakking.
									“Bereken” haalt de winkelprijs op en zet de prijs per kilo er klaar voor.
								</p>
								<div className='ref-row'>
									<div className='ref-field ref-field-url'>
										<label htmlFor='ref-url'>Productlink</label>
										<input
											id='ref-url'
											type='url'
											value={refUrl}
											onChange={(e) => setRefUrl(e.target.value)}
											placeholder='https://www.albertheijn.nl/product/…'
											inputMode='url'
										/>
									</div>
									<div className='ref-field'>
										<label htmlFor='ref-weight'>Verpakking (kg)</label>
										<NumField
											id='ref-weight'
											value={refWeightKg}
											onChange={(v) => {
												setRefWeightKg(v)
												applyStorePrice(
													refStorePrice,
													parseFloat(v.replace(',', '.')) || 0,
												)
											}}
											step={0.1}
											placeholder='1'
										/>
									</div>
									<button
										className='btn-primary ref-fetch'
										onClick={() => void fetchReference()}
										disabled={refBusy}
										type='button'>
										<i
											className={`fa-solid ${refBusy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}
										/>{' '}
										{refBusy ? 'Ophalen…' : 'Bereken'}
									</button>
								</div>

								{refError && <p className='ref-error'>{refError}</p>}

								{refUrl.trim() !== '' && (
									<div className='ref-product'>
										{refImage && (
											<img
												src={refImage}
												alt=''
												className='ref-thumb'
												onError={(e) => {
													e.currentTarget.style.visibility = 'hidden'
												}}
											/>
										)}
										<div className='ref-product-main'>
											{refTitle && <span className='ref-product-title'>{refTitle}</span>}
											<div className='ref-product-fields'>
												<label className='ref-mini'>
													<span>Winkelprijs (€)</span>
													<NumField
														value={refStorePrice !== undefined ? String(refStorePrice) : ''}
														onChange={(v) => {
															const n = parseFloat(v) || 0
															setRefStorePrice(n)
															applyStorePrice(n, draftWeight)
														}}
														min='0'
														step={0.01}
													/>
												</label>
												{draftPerKg !== null && (
													<span className='ref-readout'>
														<span className='ref-readout-label'>Winkel per kilo</span>
														<strong className='ref-readout-value'>{fmtEuro(draftPerKg)}</strong>
													</span>
												)}
												{draftSaving !== null && (
													<span className='ref-readout ref-plus'>
														<span className='ref-readout-label'>Bespaard</span>
														<strong className='ref-readout-value'>
															+{fmtEuro(draftSaving)}
														</strong>
													</span>
												)}
											</div>
										</div>
									</div>
								)}

								{draftSuspicious && (
									<p className='ref-warn'>
										<i className='fa-solid fa-triangle-exclamation' />
										Deze prijs per kilo ({fmtEuro(draftPerKg!)}) ziet er onwaarschijnlijk uit.
										Supermarkten verkopen per verpakking — controleer of het gewicht klopt
										(bijv. 1 voor 1 kg, of 0.5 voor 500 g).
									</p>
								)}
							</div>

							<label className='he-bio-toggle'>
								<input type='checkbox' checked={bio} onChange={(e) => setBio(e.target.checked)} />
								<span>Biologisch</span>
							</label>
							<div className='shop-form-footer'>
								<button className='btn-primary' onClick={submit} disabled={!canSave}>
									<i className='fa-solid fa-check' />{' '}
									{editingId ? 'Wijziging opslaan' : 'Toevoegen'}
								</button>
								<button
									className='btn-ghost'
									onClick={() => {
										resetForm()
										form.closeForm()
									}}>
									<i className='fa-solid fa-xmark' /> Annuleren
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{harvests.length > 0 && (
				<div className='shop-toolbar'>
					<div className='shop-search'>
						<i className='fa-solid fa-magnifying-glass' />
						<input
							value={q}
							onChange={(e) => setQ(e.target.value)}
							placeholder='Zoek in oogst…'
							aria-label='Zoek in oogst'
						/>
					</div>
				</div>
			)}

			{hasCharts && (
				<div className='exp-charts'>
					<div className='exp-card'>
						<div className='exp-card-head'>
							<h3>
								<i className='fa-solid fa-chart-column' /> Oogst per maand
							</h3>
							<span className='exp-card-sub'>laatste 12 maanden</span>
						</div>
						<div className='exp-bars' role='img' aria-label='Oogst in kilo per maand'>
							{months.map((m) => (
								<div key={m.key} className='exp-bar-col'>
									<span className='exp-bar-value'>{m.kg > 0 ? `${m.kg.toFixed(1)} kg` : ''}</span>
									<div className='exp-bar-track'>
										<div
											className='exp-bar exp-bar-kg'
											style={{ height: `${(m.kg / maxKg) * 100}%` }}
											title={`${monthLabel(m.key)}: ${m.kg.toFixed(1)} kg${
												m.money > 0 ? ` · ${fmtEuro(m.money)}` : ''
											}`}
										/>
									</div>
									<span className='exp-bar-label'>{m.label}</span>
								</div>
							))}
						</div>
					</div>

					<div className='exp-card'>
						<div className='exp-card-head'>
							<h3>
								<i className='fa-solid fa-scale-balanced' /> Per gewas
							</h3>
							<span className='exp-card-sub'>alle oogst</span>
						</div>
						<div className='exp-legend exp-legend-crops'>
							{perCrop.map((c) => (
								<div
									key={c.key}
									className='exp-crop-row'
									style={{ '--crop-color': c.color } as React.CSSProperties}
								>
									<span className='exp-crop-dot' aria-hidden='true' />
									<span className='exp-crop-name'>
										<CropGlyph iconKey={c.icon} cropName={c.name} />
										{c.name}
									</span>
									<span className='exp-crop-bar'>
										<span style={{ width: `${(c.kg / maxCropKg) * 100}%` }} />
									</span>
									<span className='exp-crop-kg'>{c.kg.toFixed(1)} kg</span>
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{groups.length === 0 ? (
				<div className='shop-empty'>
					<i className='fa-solid fa-carrot' />
					<p>
						{q.trim()
							? 'Geen oogst gevonden met die zoekterm.'
							: 'Nog geen oogst geregistreerd. Klik op "Oogst toevoegen" om te beginnen.'}
					</p>
				</div>
			) : (
				<Fragment key={q}>
				{groups.map((group, gi) => (
					<div
						key={group.key}
						className='exp-month'
						style={{ animationDelay: `${Math.min(gi, 11) * 35}ms` }}>
						<div className='exp-month-head'>
							<h3>{monthLabel(group.key)}</h3>
							<span className='exp-month-sum'>
								<span className='exp-month-kg'>{group.kg.toFixed(1)} kg</span>
								{group.money > 0 && (
									<span className='exp-month-total exp-amount-green'>{fmtEuro(group.money)}</span>
								)}
							</span>
						</div>
						<div className='he-list'>
							{group.items.map((h) => {
								const saving = savingOf(h)
								const name = cropNameOf(h)
								return (
									<div key={h.id} className='he-row exp-row'>
										<div
											className='exp-icon exp-icon-green'
											style={{ '--crop-color': cropColorOf(name) } as React.CSSProperties}
										>
											<CropGlyph iconKey={cropIconOf(name)} cropName={name} />
										</div>
										<div className='he-row-main'>
											<div className='he-row-title'>
												{name}
												{h.isOrganic && <span className='he-bio-badge'>Bio</span>}
											</div>
											<div className='exp-chips'>
												<span className='exp-chip-mini'>
													<i className='fa-solid fa-scale-balanced' />
													{h.quantity} kg
												</span>
												<span className='exp-chip-mini'>
													<i className='fa-solid fa-calendar' />
													{new Date(h.date).toLocaleDateString('nl-NL', {
														day: 'numeric',
														month: 'short',
														year: 'numeric',
													})}
												</span>
												{h.pricePerKg > 0 && (
													<span className='exp-chip-mini'>
														<i className='fa-solid fa-tag' />
														{fmtEuro(h.pricePerKg)}/kg
													</span>
												)}
												{saving !== null && (
													<span className='exp-chip-mini exp-chip-saved'>
														<i className='fa-solid fa-piggy-bank' />
														bespaard {fmtEuro(saving)}
													</span>
												)}
											</div>
											{h.productUrl && (
												<a
													className='exp-row-link'
													href={h.productUrl}
													target='_blank'
													rel='noopener noreferrer'
													title={h.productUrl}>
													<i className='fa-solid fa-up-right-from-square' />
													Bekijk product
												</a>
											)}
										</div>
										{h.pricePerKg > 0 && (
											<div className='exp-amount exp-amount-green'>
												{fmtEuro(h.quantity * h.pricePerKg)}
											</div>
										)}
										<div className='he-row-actions'>
											<button className='he-row-btn' onClick={() => startEdit(h)} title='Bewerken'>
												<i className='fa-solid fa-pen' />
											</button>
											<button
												className='he-row-btn he-row-btn-danger'
												onClick={() => onRemove(h.id)}
												title='Verwijderen'>
												<i className='fa-solid fa-trash' />
											</button>
										</div>
									</div>
								)
							})}
						</div>
					</div>
				))}
				</Fragment>
			)}
		</div>
	)
}