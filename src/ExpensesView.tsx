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
import { CategoryDropdown } from './CategoryDropdown'
import { ExpenseFormModal, type ExpenseFormData } from './ExpenseFormModal'

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
	return `€${v.toFixed(2).replace('.', ',')}`
}

/** "+€12,50" voor inkomsten, "-€12,50" bij negatief, anders "€12,50" */
function fmtSigned(v: number, mode: Mode): string {
	const sign = v < 0 ? '-' : mode === 'in' ? '+' : ''
	return `${sign}${fmtEuro(Math.abs(v))}`
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
	const sheet = useCollapseForm()
	const [mode, setMode] = useState<Mode>('uit')
	const [editEntry, setEditEntry] = useState<Entry | null>(null)
	const [q, setQ] = useState('')
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
		setEditEntry(null)
		sheet.closeForm()
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

	const openNew = () => {
		setEditEntry(null)
		sheet.openForm()
	}
	const startEdit = (e: Entry) => {
		setEditEntry(e)
		sheet.openForm()
	}
	const closeForm = () => {
		setEditEntry(null)
		sheet.closeForm()
	}
	const saveForm = (data: ExpenseFormData) => {
		if (editEntry) {
			if (isUit) onUpdate(editEntry.id, data)
			else onUpdateIncome(editEntry.id, data)
		} else {
			if (isUit) onAdd(data)
			else onAddIncome(data)
		}
		closeForm()
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
		<div className='oogst-wrap exp-page'>
			<div className='oogst-head'>
				<div>
					<h1 className='oogst-title'>Uitgaven</h1>
					<p className='oogst-sub'>Wat de tuin kost én wat hij opbrengt, per maand gegroepeerd.</p>
				</div>
				<div className='exp-head-actions'>
					<div className='exp-mode' role='group' aria-label='Uitgaven of inkomsten'>
						<button
							onClick={() => switchMode('uit')}
							aria-pressed={isUit}>
							<i className='fa-solid fa-receipt' /> Uitgaven
						</button>
						<button
							onClick={() => switchMode('in')}
							aria-pressed={!isUit}>
							<i className='fa-solid fa-sack-dollar' /> Inkomsten
						</button>
					</div>
					<button className='oogst-add' onClick={openNew}>
						+ {isUit ? 'Uitgave toevoegen' : 'Inkomst toevoegen'}
					</button>
				</div>
			</div>

			<div className='oogst-stats'>
				<div className={`oogst-stat oogst-stat-hero ${saldo < 0 ? 'oogst-stat-negative' : ''}`}>
					<div className='oogst-stat-label'>Saldo</div>
					<div className='oogst-stat-value'>{fmtSigned(saldo, 'uit')}</div>
				</div>
				<div className='oogst-stat'>
					<div className='oogst-stat-label'>Uitgaven</div>
					<div className='oogst-stat-value'>{fmtEuro(totalUit)}</div>
				</div>
				<div className='oogst-stat'>
					<div className='oogst-stat-label'>Inkomsten</div>
					<div className='oogst-stat-value'>{fmtEuro(totalIn)}</div>
				</div>
				<div className='oogst-stat'>
					<div className='oogst-stat-label'>Deze maand</div>
					<div className='oogst-stat-value'>{fmtSigned(monthNetto, 'uit')}</div>
				</div>
			</div>

			<ExpenseFormModal
				mounted={sheet.mounted}
				open={sheet.open}
				edit={editEntry}
				mode={mode}
				onClose={closeForm}
				onSave={saveForm}
			/>

			<div className='bood-toolbar'>
				<label className='oogst-search-label'>
					<i className='fa-solid fa-magnifying-glass' />
					<input
						className='oogst-search-input'
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder={isUit ? 'Zoek in uitgaven…' : 'Zoek in inkomsten…'}
						aria-label={isUit ? 'Zoek in uitgaven' : 'Zoek in inkomsten'}
					/>
				</label>
				<div className='bood-filters'>
					<div>
						<CategoryDropdown
							id='exp-catfilter'
							noIcons
							categories={[{ key: '', label: 'Alle categorieën', icon: 'fa-layer-group', tone: 'grey' }, ...cats]}
							value={catFilter}
							onChange={setCatFilter}
						/>
					</div>
				</div>
			</div>

			{hasCharts && (
				<div className='oogst-charts'>
					<div className='oogst-card oogst-chart'>
						<div className='oogst-chart-head'>
							<div className='oogst-chart-title'>Per maand</div>
							<div className='oogst-chart-sub'>laatste 12 maanden</div>
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
							{months.map((m, i) => (
								<div key={m.key} className='exp-bar-col'>
									<span className='exp-bar-value'>
										{m.out + m.inc > 0 ? fmtSigned(m.inc - m.out, 'uit') : ''}
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
									<span className={i === months.length - 1 ? 'mh-active' : 'exp-bar-label'}>{m.label.toUpperCase()}</span>
								</div>
							))}
						</div>
					</div>

					<div className='oogst-card oogst-chart'>
						<div className='oogst-chart-head'>
							<div className='oogst-chart-title'>Verdeling</div>
							<div className='oogst-chart-sub'>{isUit ? 'alle uitgaven' : 'alle inkomsten'}</div>
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

			{groups.length === 0 ? (
				<div className='oogst-card oogst-empty'>
					<i className={`fa-solid ${isUit ? 'fa-receipt' : 'fa-sack-dollar'}`} />
					<p>{emptyText}</p>
				</div>
			) : (
				<div className='oogst-card oogst-list' key={`${mode}-${catFilter}`}>
				{groups.map((group, gi) => (
					<div key={group.key} style={{ animationDelay: `${Math.min(gi, 11) * 35}ms` }}>
						<div className='oogst-month-head'>
							<div className='oogst-month-title'>{monthLabel(group.key)}</div>
							<div className={`oogst-month-sum ${isUit ? 'exp-total-uit' : 'exp-total-in'}`}>{fmtSigned(group.total, mode)}</div>
						</div>
						<div className='oogst-month-items'>
							{group.items.map((e) => {
								const cat = resolve(e)
								return (
									<div key={e.id} className='oogst-row'>
										<div className={`exp-icon exp-icon-${cat.tone}`}>
											<i className={`fa-solid ${cat.icon}`} />
										</div>
										<div className='oogst-row-main'>
											<div className='oogst-row-title'>
												<b>{e.description}</b>
											</div>
											<div className='oogst-chips'>
												<span className='oogst-chip'>{e.date}</span>
												<span className={`exp-badge exp-badge-${cat.tone}`}>
													<i className={`fa-solid ${cat.icon}`} />
													{cat.label}
												</span>
											</div>
										</div>
										<div className={`oogst-row-total ${isUit ? 'exp-total-uit' : 'exp-total-in'}`}>
											{fmtSigned(e.amount, mode)}
										</div>
										<div className='pd-card-actions'>
											<button onClick={() => startEdit(e)} title='Bewerken' aria-label='Bewerken'>
												<i className='fa-solid fa-pen' />
											</button>
											<button
												className='btn-danger'
												onClick={() => removeEntry(e.id)}
												title='Verwijderen'
												aria-label='Verwijderen'>
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
			)}
		</div>
	)
}
