import { useState } from 'react'
import type { Crop, HarvestEntry, Expense } from './types'

interface Props {
	catalog: Crop[]
	harvests: HarvestEntry[]
	expenses: Expense[]
	onAddHarvest: (entry: Omit<HarvestEntry, 'id'>) => void
	onUpdateHarvest: (hId: string, patch: Partial<HarvestEntry>) => void
	onRemoveHarvest: (hId: string) => void
	onAddExpense: (entry: Omit<Expense, 'id'>) => void
	onUpdateExpense: (eId: string, patch: Partial<Expense>) => void
	onRemoveExpense: (eId: string) => void
}

function todayStr(): string {
	return new Date().toISOString().slice(0, 10)
}

function fmtEuro(v: number): string {
	return `\u20ac${v.toFixed(2)}`
}

export function HarvestExpenseView(props: Props) {
	const {
		catalog,
		harvests,
		expenses,
		onAddHarvest,
		onUpdateHarvest,
		onRemoveHarvest,
		onAddExpense,
		onUpdateExpense,
		onRemoveExpense,
	} = props

	const [showHarvestForm, setShowHarvestForm] = useState(false)
	const [showExpenseForm, setShowExpenseForm] = useState(false)
	const [editingHarvestId, setEditingHarvestId] = useState<string | null>(null)
	const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)

	const [hCropId, setHCropId] = useState(catalog[0]?.id ?? '')
	const [hQty, setHQty] = useState('1')
	const [hDate, setHDate] = useState(todayStr())
	const [hPrice, setHPrice] = useState('')
	const [hBio, setHBio] = useState(false)

	const [eDesc, setEDesc] = useState('')
	const [eAmount, setEAmount] = useState('')
	const [eDate, setEDate] = useState(todayStr())

	const totalHarvestKg = harvests.reduce((s, h) => s + h.quantity, 0)
	const totalRevenue = harvests.reduce(
		(s, h) => s + h.quantity * h.pricePerKg,
		0,
	)
	const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
	const netProfit = totalRevenue - totalExpenses

	const cropName = (cropId: string) =>
		catalog.find((c) => c.id === cropId)?.name ?? 'Onbekend'
	const cropColor = (cropId: string) =>
		catalog.find((c) => c.id === cropId)?.color ?? '#888'

	const resetHarvestForm = () => {
		setHCropId(catalog[0]?.id ?? '')
		setHQty('1')
		setHDate(todayStr())
		setHPrice('')
		setHBio(false)
	}

	const resetExpenseForm = () => {
		setEDesc('')
		setEAmount('')
		setEDate(todayStr())
	}

	const handleSubmitHarvest = () => {
		const qty = parseFloat(hQty)
		const price = parseFloat(hPrice) || 0
		if (!hCropId || isNaN(qty) || qty <= 0) return
		if (editingHarvestId) {
			onUpdateHarvest(editingHarvestId, {
				cropId: hCropId,
				quantity: qty,
				date: hDate,
				pricePerKg: price,
				isOrganic: hBio,
			})
			setEditingHarvestId(null)
		} else {
			onAddHarvest({
				cropId: hCropId,
				quantity: qty,
				date: hDate,
				pricePerKg: price,
				isOrganic: hBio,
			})
		}
		resetHarvestForm()
		setShowHarvestForm(false)
	}

	const handleSubmitExpense = () => {
		const amount = parseFloat(eAmount)
		if (!eDesc.trim() || isNaN(amount) || amount <= 0) return
		if (editingExpenseId) {
			onUpdateExpense(editingExpenseId, {
				description: eDesc.trim(),
				amount,
				date: eDate,
			})
			setEditingExpenseId(null)
		} else {
			onAddExpense({
				description: eDesc.trim(),
				amount,
				date: eDate,
			})
		}
		resetExpenseForm()
		setShowExpenseForm(false)
	}

	const startEditHarvest = (h: HarvestEntry) => {
		setEditingHarvestId(h.id)
		setHCropId(h.cropId)
		setHQty(String(h.quantity))
		setHDate(h.date)
		setHPrice(h.pricePerKg > 0 ? String(h.pricePerKg) : '')
		setHBio(h.isOrganic)
		setShowHarvestForm(true)
	}

	const startEditExpense = (e: Expense) => {
		setEditingExpenseId(e.id)
		setEDesc(e.description)
		setEAmount(String(e.amount))
		setEDate(e.date)
		setShowExpenseForm(true)
	}

	const sortedHarvests = [...harvests].sort(
		(a, b) => b.date.localeCompare(a.date),
	)
	const sortedExpenses = [...expenses].sort(
		(a, b) => b.date.localeCompare(a.date),
	)

	return (
		<div className='he-wrap'>
			<div className='he-summary'>
				<div className='he-card'>
					<div className='he-card-label'>Geoogst</div>
					<div className='he-card-value'>
						{totalHarvestKg.toFixed(1)} kg
					</div>
				</div>
				<div className='he-card he-card-green'>
					<div className='he-card-label'>Opbrengst</div>
					<div className='he-card-value'>{fmtEuro(totalRevenue)}</div>
				</div>
				<div className='he-card he-card-red'>
					<div className='he-card-label'>Uitgaven</div>
					<div className='he-card-value'>{fmtEuro(totalExpenses)}</div>
				</div>
				<div
					className={`he-card ${netProfit >= 0 ? 'he-card-green' : 'he-card-red'}`}>
					<div className='he-card-label'>Winst</div>
					<div className='he-card-value'>{fmtEuro(netProfit)}</div>
				</div>
			</div>

			<div className='he-section'>
				<div className='he-section-header'>
					<h3>Oogst</h3>
					<button
						className='btn-primary'
						onClick={() => {
							resetHarvestForm()
							setEditingHarvestId(null)
							setShowHarvestForm(!showHarvestForm)
						}}>
						{showHarvestForm ? (
							<>
								<i className='fa-solid fa-xmark' /> Annuleren
							</>
						) : (
							<>
								<i className='fa-solid fa-plus' /> Oogst
							</>
						)}
					</button>
				</div>

				{showHarvestForm && (
					<div className='he-form'>
						<div className='he-form-row'>
							<div className='inp-field'>
								<span>Gewas</span>
								<select
									value={hCropId}
									onChange={(e) => setHCropId(e.target.value)}>
									{catalog.map((c) => (
										<option key={c.id} value={c.id}>
											{c.name}
										</option>
									))}
								</select>
							</div>
							<div className='inp-field'>
								<span>Hoeveelheid (kg)</span>
								<input
									type='number'
									min='0.1'
									step='0.1'
									value={hQty}
									onChange={(e) => setHQty(e.target.value)}
								/>
							</div>
						</div>
						<div className='he-form-row'>
							<div className='inp-field'>
								<span>Datum</span>
								<input
									type='date'
									value={hDate}
									onChange={(e) => setHDate(e.target.value)}
								/>
							</div>
							<div className='inp-field'>
								<span>Prijs per kg (\u20ac)</span>
								<input
									type='number'
									min='0'
									step='0.01'
									placeholder='0.00'
									value={hPrice}
									onChange={(e) => setHPrice(e.target.value)}
								/>
							</div>
						</div>
						<div className='he-form-row'>
							<label className='he-bio-toggle'>
								<input
									type='checkbox'
									checked={hBio}
									onChange={(e) => setHBio(e.target.checked)}
								/>
								<span>Bio</span>
							</label>
							<button
								className='btn-primary'
								onClick={handleSubmitHarvest}>
								<i className='fa-solid fa-check' /> Opslaan
							</button>
						</div>
					</div>
				)}

				{sortedHarvests.length === 0 && !showHarvestForm && (
					<div className='he-empty'>
						Nog geen oogst geregistreerd.
					</div>
				)}

				<div className='he-list'>
					{sortedHarvests.map((h) => (
						<div key={h.id} className='he-row'>
							<div
								className='he-row-color'
								style={{ background: cropColor(h.cropId) }}
							/>
							<div className='he-row-main'>
								<div className='he-row-title'>
									{cropName(h.cropId)}
									{h.isOrganic && (
										<span className='he-bio-badge'>Bio</span>
									)}
								</div>
								<div className='he-row-meta'>
									{h.date} &middot; {h.quantity} kg
									{h.pricePerKg > 0 &&
										` \u00b7 ${fmtEuro(h.pricePerKg)}/kg`}
								</div>
								{h.pricePerKg > 0 && (
									<div className='he-row-total'>
										{fmtEuro(h.quantity * h.pricePerKg)}
									</div>
								)}
							</div>
							<div className='he-row-actions'>
								<button
									className='he-row-btn'
									onClick={() => startEditHarvest(h)}
									title='Bewerken'>
									<i className='fa-solid fa-pen' />
								</button>
								<button
									className='he-row-btn he-row-btn-danger'
									onClick={() => onRemoveHarvest(h.id)}
									title='Verwijderen'>
									<i className='fa-solid fa-trash' />
								</button>
							</div>
						</div>
					))}
				</div>
			</div>

			<div className='he-section'>
				<div className='he-section-header'>
					<h3>Uitgaven</h3>
					<button
						className='btn-primary'
						onClick={() => {
							resetExpenseForm()
							setEditingExpenseId(null)
							setShowExpenseForm(!showExpenseForm)
						}}>
						{showExpenseForm ? (
							<>
								<i className='fa-solid fa-xmark' /> Annuleren
							</>
						) : (
							<>
								<i className='fa-solid fa-plus' /> Uitgave
							</>
						)}
					</button>
				</div>

				{showExpenseForm && (
					<div className='he-form'>
						<div className='he-form-row'>
							<div className='inp-field'>
								<span>Omschrijving</span>
								<input
									type='text'
									placeholder='Bijv. Biologische tomatenzaden'
									value={eDesc}
									onChange={(e) => setEDesc(e.target.value)}
								/>
							</div>
						</div>
						<div className='he-form-row'>
							<div className='inp-field'>
								<span>Bedrag (\u20ac)</span>
								<input
									type='number'
									min='0.01'
									step='0.01'
									placeholder='0.00'
									value={eAmount}
									onChange={(e) => setEAmount(e.target.value)}
								/>
							</div>
							<div className='inp-field'>
								<span>Datum</span>
								<input
									type='date'
									value={eDate}
									onChange={(e) => setEDate(e.target.value)}
								/>
							</div>
							<div style={{ flex: 1 }}>
								<button
									className='btn-primary'
									onClick={handleSubmitExpense}>
									<i className='fa-solid fa-check' /> Opslaan
								</button>
							</div>
						</div>
					</div>
				)}

				{sortedExpenses.length === 0 && !showExpenseForm && (
					<div className='he-empty'>Nog geen uitgaven geregistreerd.</div>
				)}

				<div className='he-list'>
					{sortedExpenses.map((e) => (
						<div key={e.id} className='he-row'>
							<div className='he-row-main'>
								<div className='he-row-title'>{e.description}</div>
								<div className='he-row-meta'>{e.date}</div>
								<div className='he-row-total he-row-total-red'>
									-{fmtEuro(e.amount)}
								</div>
							</div>
							<div className='he-row-actions'>
								<button
									className='he-row-btn'
									onClick={() => startEditExpense(e)}
									title='Bewerken'>
									<i className='fa-solid fa-pen' />
								</button>
								<button
									className='he-row-btn he-row-btn-danger'
									onClick={() => onRemoveExpense(e.id)}
									title='Verwijderen'>
									<i className='fa-solid fa-trash' />
								</button>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}
