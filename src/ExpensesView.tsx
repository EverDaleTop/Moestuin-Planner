import { useMemo, useState } from 'react'
import type { Expense, Income } from './types'
import { useCollapseForm } from './useCollapseForm'
import {
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
	resolveCategory,
	resolveIncomeCategory,
	type ExpenseCategory,
} from './expenseCategories'

type Mode = 'uit' | 'in'

/** Alles wat het overzicht nodig heeft; Expense en Income voldoen hier allebei aan. */
interface Entry {
	id: string
	description: string
	amount: number
	date: string
	category?: string
}

interface Props {
	expenses: Expense[]
	incomes: Income[]
	onAdd: (entry: Omit<Expense, 'id'>) => void
	onUpdate: (id: string, patch: Partial<Expense>) => void
	onRemove: (id: string) => void
	onAddIncome: (entry: Omit<Income, 'id'>) => void
	onUpdateIncome: (id: string, patch: Partial<Income>) => void
	onRemoveIncome: (id: string) => void
}

function todayStr(): string {
	return new Date().toISOString().slice(0, 10)
}

function fmtEuro(v: number): string {
	return `€${v.toFixed(2)}`
}

/** "+€12,50" voor inkomsten, "€12,50" voor uitgaven */
function fmtSigned(v: number, mode: Mode): string {
	return mode === 'in' ? `+${fmtEuro(v)}` : fmtEuro(v)
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

function currentMonthKey(): string {
	return todayStr().slice(0, 7)
}

/** Laatste n maanden als reeks, oplopend, met totalen per soort. */
function monthlySeries(out: Entry[], inc: Entry[], months: number) {
	const now = new Date()
	const keys: string[] = []
	for (let i = months - 1; i >= 0; i--) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
		keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
	}
	const sumOut = new Map<string, number>(keys.map((k) => [k, 0]))
	const sumIn = new Map<string, number>(keys.map((k) => [k, 0]))
	for (const e of out) {
		const key = monthKey(e.date)
		if (sumOut.has(key)) sumOut.set(key, (sumOut.get(key) ?? 0) + e.amount)
	}
	for (const e of inc) {
		const key = monthKey(e.date)
		if (sumIn.has(key)) sumIn.set(key, (sumIn.get(key) ?? 0) + e.amount)
	}
	return keys.map((key) => ({
		key,
		label: new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString('nl-NL', {
			month: 'short',
		}),
		out: sumOut.get(key) ?? 0,
		inc: sumIn.get(key) ?? 0,
	}))
}

export function ExpensesView({
	expenses,
	incomes,
	onAdd,
	onUpdate,
	onRemove,
	onAddIncome,
	onUpdateIncome,
	onRemoveIncome,
}: Props) {
	const form = useCollapseForm()
	const [mode, setMode] = useState<Mode>('uit')
	const [editingId, setEditingId] = useState<string | null>(null)
	const [q, setQ] = useState('')

	const [desc, setDesc] = useState('')
	const [amount, setAmount] = useState('')
	const [date, setDate] = useState(todayStr())
	const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].key)
	/** filter op categorie; '' = alles */
	const [catFilter, setCatFilter] = useState('')

	const isUit = mode === 'uit'
	const cats: ExpenseCategory[] = isUit ? EXPENSE_CATEGORIES : INCOME_CATEGORIES
	const activeList: Entry[] = isUit ? expenses : incomes
	const resolve = (e: Entry): ExpenseCategory =>
		isUit ? resolveCategory(e.description, e.category) : resolveIncomeCategory(e.category)

	const totalUit = expenses.reduce((s, e) => s + e.amount, 0)
	const totalIn = incomes.reduce((s, e) => s + e.amount, 0)
	const saldo = totalIn - totalUit
	const monthNetto =
		incomes
			.filter((e) => monthKey(e.date) === currentMonthKey())
			.reduce((s, e) => s + e.amount, 0) -
		expenses
			.filter((e) => monthKey(e.date) === currentMonthKey())
			.reduce((s, e) => s + e.amount, 0)
	const totalActive = activeList.reduce((s, e) => s + e.amount, 0)

	const switchMode = (m: Mode) => {
		setMode(m)
		setCatFilter('')
		resetForm()
		if (form.open) form.closeForm()
	}

	/** gegroepeerd per maand, nieuwste maand eerst */
	const groups = useMemo(() => {
		const s = q.trim().toLowerCase()
		const resolveFn = isUit ? resolveCategory : (_d: string, c?: string) => resolveIncomeCategory(c)
		const list = activeList
			.filter((e) => !s || e.description.toLowerCase().includes(s))
			.filter((e) => !catFilter || resolveFn(e.description, e.category).key === catFilter)
			.slice()
			.sort((a, b) => b.date.localeCompare(a.date))

		const out: { key: string; total: number; items: Entry[] }[] = []
		for (const e of list) {
			const key = monthKey(e.date)
			const last = out[out.length - 1]
			if (last && last.key === key) {
				last.items.push(e)
				last.total += e.amount
			} else {
				out.push({ key, total: e.amount, items: [e] })
			}
		}
		return out
	}, [activeList, q, catFilter, isUit])

	/** Data voor de grafieken. */
	const months = useMemo(() => monthlySeries(expenses, incomes, 12), [expenses, incomes])
	const maxMonth = Math.max(...months.flatMap((m) => [m.out, m.inc]), 1)

	const categories = useMemo(() => {
		const sums = new Map<string, number>()
		for (const e of activeList) {
			const key = resolve(e).key
			sums.set(key, (sums.get(key) ?? 0) + e.amount)
		}
		return cats
			.filter((c) => sums.has(c.key))
			.map((c) => ({ ...c, total: sums.get(c.key) ?? 0 }))
			.sort((a, b) => b.total - a.total)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeList, mode])
	const hasCharts = expenses.length > 0 || incomes.length > 0

	const resetForm = () => {
		setDesc('')
		setAmount('')
		setDate(todayStr())
		setCategory((isUit ? EXPENSE_CATEGORIES : INCOME_CATEGORIES)[0].key)
		setEditingId(null)
	}

	const startEdit = (e: Entry) => {
		setEditingId(e.id)
		setDesc(e.description)
		setAmount(String(e.amount))
		setDate(e.date)
		setCategory(resolve(e).key)
		form.openForm()
	}

	const canSave = desc.trim().length > 0 && parseFloat(amount) > 0

	const submit = () => {
		if (!canSave) return
		const value = parseFloat(amount)
		if (editingId) {
			if (isUit) onUpdate(editingId, { description: desc.trim(), amount: value, date, category })
			else onUpdateIncome(editingId, { description: desc.trim(), amount: value, date, category })
			setEditingId(null)
		} else {
			if (isUit) onAdd({ description: desc.trim(), amount: value, date, category })
			else onAddIncome({ description: desc.trim(), amount: value, date, category })
		}
		resetForm()
		form.closeForm()
	}

	const removeEntry = (id: string) => {
		if (isUit) onRemove(id)
		else onRemoveIncome(id)
	}

	const emptyText = q.trim() || catFilter
		? `Geen ${isUit ? 'uitgaven' : 'inkomsten'} gevonden met die zoekterm of categorie.`
		: isUit
			? 'Nog geen uitgaven geregistreerd. Klik op "Uitgave toevoegen" om te beginnen.'
			: 'Nog geen inkomsten geregistreerd. Verkoop je oogst en leg het hier vast.'

	return (
		<div className='shop-page'>
			<div className='shop-hero'>
				<div className='shop-hero-text'>
					<h2>
						<i className={`fa-solid ${isUit ? 'fa-receipt' : 'fa-sack-dollar'}`} /> Uitgaven & inkomsten
					</h2>
					<p>Wat de tuin kost én wat hij opbrengt, per maand gegroepeerd.</p>
				</div>
				<div className='shop-hero-actions'>
					<div className='shop-filters' role='group' aria-label='Uitgaven of inkomsten'>
						<button
							className={`shop-filter ${isUit ? 'shop-filter-active' : ''}`}
							onClick={() => switchMode('uit')}
							aria-pressed={isUit}>
							<i className='fa-solid fa-receipt' /> Uitgaven
						</button>
						<button
							className={`shop-filter ${!isUit ? 'shop-filter-active' : ''}`}
							onClick={() => switchMode('in')}
							aria-pressed={!isUit}>
							<i className='fa-solid fa-sack-dollar' /> Inkomsten
						</button>
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
								<i className='fa-solid fa-plus' /> {isUit ? 'Uitgave toevoegen' : 'Inkomst toevoegen'}
							</>
						)}
					</button>
				</div>
			</div>

			<div className='shop-stats'>
				<div className={`shop-stat ${saldo >= 0 ? '' : 'shop-stat-negative'}`}>
					<div className='shop-stat-icon shop-stat-icon-total'>
						<i className='fa-solid fa-scale-balanced' />
					</div>
					<div className='shop-stat-info'>
						<span className='shop-stat-value'>{fmtEuro(saldo)}</span>
						<span className='shop-stat-label'>Saldo</span>
					</div>
				</div>
				<div className='shop-stat'>
					<div className='shop-stat-icon shop-stat-icon-out'>
						<i className='fa-solid fa-arrow-trend-down' />
					</div>
					<div className='shop-stat-info'>
						<span className='shop-stat-value'>{fmtEuro(totalUit)}</span>
						<span className='shop-stat-label'>Uitgaven</span>
					</div>
				</div>
				<div className='shop-stat'>
					<div className='shop-stat-icon shop-stat-icon-done'>
						<i className='fa-solid fa-arrow-trend-up' />
					</div>
					<div className='shop-stat-info'>
						<span className='shop-stat-value'>{fmtEuro(totalIn)}</span>
						<span className='shop-stat-label'>Inkomsten</span>
					</div>
				</div>
				<div className='shop-stat'>
					<div className='shop-stat-icon shop-stat-icon-neutral'>
						<i className='fa-solid fa-calendar-day' />
					</div>
					<div className='shop-stat-info'>
						<span className='shop-stat-value'>{fmtEuro(monthNetto)}</span>
						<span className='shop-stat-label'>Deze maand</span>
					</div>
				</div>
			</div>

			{form.mounted && (
				<div className={`shop-form ${form.open ? '' : 'shop-form-closing'}`}>
					<div className='shop-form-inner'>
						<div className='shop-form-panel'>
							<div className='shop-form-header'>
								<i className={`fa-solid ${isUit ? 'fa-receipt' : 'fa-sack-dollar'}`} />
								<span>
									{editingId
										? isUit
											? 'Uitgave bewerken'
											: 'Inkomst bewerken'
										: isUit
											? 'Nieuwe uitgave'
											: 'Nieuwe inkomst'}
								</span>
							</div>
							<div className='shop-form-grid'>
								<div className='shop-form-field'>
									<label>Omschrijving *</label>
									<input
										type='text'
										value={desc}
										autoFocus
										onChange={(e) => setDesc(e.target.value)}
										placeholder={isUit ? 'Bijv. Biologische tomatenzaden' : 'Bijv. Tomaten verkocht'}
									/>
								</div>
								<div className='shop-form-field'>
									<label>Bedrag (€) *</label>
									<input
										type='number'
										min='0.01'
										step='0.01'
										value={amount}
										onChange={(e) => setAmount(e.target.value)}
										placeholder='0.00'
									/>
								</div>
								<div className='shop-form-field'>
									<label>Datum</label>
									<input
										type='date'
										value={date}
										onChange={(e) => setDate(e.target.value)}
									/>
								</div>
								<div className='shop-form-field'>
									<label>Categorie *</label>
									<select
										value={category}
										onChange={(e) => setCategory(e.target.value)}>
										{cats.map((c) => (
											<option key={c.key} value={c.key}>
												{c.label}
											</option>
										))}
									</select>
								</div>
							</div>
							<div className='shop-form-cats'>
								{cats.map((c) => (
									<button
										key={c.key}
										type='button'
										className={`exp-chip exp-chip-${c.tone} ${category === c.key ? 'exp-chip-active' : ''}`}
										onClick={() => setCategory(c.key)}
										aria-pressed={category === c.key}>
										<i className={`fa-solid ${c.icon}`} />
										{c.label}
									</button>
								))}
							</div>
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

			<div className='shop-toolbar'>
				<div className='shop-search'>
					<i className='fa-solid fa-magnifying-glass' />
					<input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder={isUit ? 'Zoek in uitgaven…' : 'Zoek in inkomsten…'}
						aria-label={isUit ? 'Zoek in uitgaven' : 'Zoek in inkomsten'}
					/>
				</div>
			</div>

			<div className='exp-cats' role='group' aria-label='Filter op categorie'>
				<button
					className={`exp-cat ${catFilter === '' ? 'exp-cat-active' : ''}`}
					onClick={() => setCatFilter('')}>
					Alles
				</button>
				{categories.map((c) => (
					<button
						key={c.key}
						className={`exp-cat exp-cat-${c.tone} ${catFilter === c.key ? 'exp-cat-active' : ''}`}
						onClick={() => setCatFilter(c.key === catFilter ? '' : c.key)}
						aria-pressed={catFilter === c.key}>
						<i className={`fa-solid ${c.icon}`} />
						{c.label}
					</button>
				))}
			</div>

			{hasCharts && (
				<div className='exp-charts'>
					<div className='exp-card'>
						<div className='exp-card-head'>
							<h3>
								<i className='fa-solid fa-chart-column' /> Per maand
							</h3>
							<span className='exp-card-sub'>laatste 12 maanden</span>
						</div>
						<div className='exp-legend exp-legend-inline'>
							<span className='exp-legend-row'>
								<span className='exp-dot exp-dot-out' /> Uit
							</span>
							<span className='exp-legend-row'>
								<span className='exp-dot exp-dot-in' /> In
							</span>
						</div>
						<div className='exp-bars' role='img' aria-label='Uitgaven en inkomsten per maand'>
							{months.map((m) => (
								<div key={m.key} className='exp-bar-col'>
									<span className='exp-bar-value'>
										{m.out + m.inc > 0 ? fmtEuro(m.inc - m.out) : ''}
									</span>
									<div className='exp-bar-track exp-bar-track-duo'>
										<div
											className='exp-bar exp-bar-out'
											style={{ height: `${(m.out / maxMonth) * 100}%` }}
											title={`${monthLabel(m.key)} uit: ${fmtEuro(m.out)}`}
										/>
										<div
											className='exp-bar exp-bar-in'
											style={{ height: `${(m.inc / maxMonth) * 100}%` }}
											title={`${monthLabel(m.key)} in: ${fmtEuro(m.inc)}`}
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
								<i className='fa-solid fa-chart-pie' /> Verdeling
							</h3>
							<span className='exp-card-sub'>{isUit ? 'alle uitgaven' : 'alle inkomsten'}</span>
						</div>
						<div className='exp-donut-wrap'>
							<svg className='exp-donut' viewBox='0 0 42 42' role='img' aria-label='Verdeling per categorie'>
								<circle className='exp-donut-bg' cx='21' cy='21' r='15.9' />
								{categories.map((c, i) => {
									const pct = totalActive > 0 ? c.total / totalActive : 0
									const offset = categories
										.slice(0, i)
										.reduce((s, x) => s + (totalActive > 0 ? x.total / totalActive : 0), 0)
									return (
										<circle
											key={c.key}
											className={`exp-donut-seg exp-donut-${c.key}`}
											cx='21'
											cy='21'
											r='15.9'
											strokeDasharray={`${pct * 100} ${100 - pct * 100}`}
											strokeDashoffset={-offset * 100}
										/>
									)
								})}
							</svg>
							<div className='exp-donut-center'>
								<strong>{fmtEuro(totalActive)}</strong>
								<span>totaal</span>
							</div>
						</div>
						<div className='exp-legend'>
							{categories.map((c) => (
								<div key={c.key} className='exp-legend-row'>
									<span className={`exp-dot exp-dot-${c.key}`} />
									<span className='exp-legend-label'>
										<i className={`fa-solid ${c.icon}`} /> {c.label}
									</span>
									<span className='exp-legend-value'>
										{totalActive > 0 ? Math.round((c.total / totalActive) * 100) : 0}% · {fmtEuro(c.total)}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{groups.length === 0 && (
				<div className='shop-empty'>
					<i className={`fa-solid ${isUit ? 'fa-receipt' : 'fa-sack-dollar'}`} />
					<p>{emptyText}</p>
				</div>
			)}

			{groups.map((group) => (
				<div key={group.key} className='exp-month'>
					<div className='exp-month-head'>
						<h3>{monthLabel(group.key)}</h3>
						<span className={`exp-month-total ${isUit ? '' : 'exp-month-total-in'}`}>
							{fmtSigned(group.total, mode)}
						</span>
					</div>
					<div className='he-list'>
						{group.items.map((e) => {
							const cat = resolve(e)
							return (
								<div key={e.id} className='he-row exp-row'>
									<div className={`exp-icon exp-icon-${cat.tone}`}>
										<i className={`fa-solid ${cat.icon}`} />
									</div>
									<div className='he-row-main'>
										<div className='he-row-title'>{e.description}</div>
										<div className='he-row-meta'>
											{e.date}
											<span className={`exp-badge exp-badge-${cat.tone}`}>
												<i className={`fa-solid ${cat.icon}`} />
												{cat.label}
											</span>
										</div>
									</div>
									<div className={`exp-amount ${isUit ? '' : 'exp-amount-green'}`}>
										{fmtSigned(e.amount, mode)}
									</div>
									<div className='he-row-actions'>
										<button
											className='he-row-btn'
											onClick={() => startEdit(e)}
											title='Bewerken'>
											<i className='fa-solid fa-pen' />
										</button>
										<button
											className='he-row-btn he-row-btn-danger'
											onClick={() => removeEntry(e.id)}
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
		</div>
	)
}
