import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const USERNAME = 'cropinput'
const PASSWORD = 'cropinput123'

const run = async () => {
	const browser = await chromium.launch()
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
	const page = await ctx.newPage()
	const errors: string[] = []
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text())
	})
	page.on('pageerror', (e) => errors.push(String(e)))

	await page.goto(BASE)
	// Registreer een account voor de check; bestaat het al, dan loggen we gewoon in.
	const reg = await page.request.post('http://localhost:3001/api/auth/register', {
		data: { username: USERNAME, password: PASSWORD },
	})
	if (!reg.ok()) console.log('register status', reg.status())

	await page.getByPlaceholder('je gebruikersnaam').fill(USERNAME)
	await page.getByPlaceholder('••••••••').fill(PASSWORD)
await page.locator('form').getByRole('button', { name: /inloggen/i }).click()
	await page.waitForTimeout(1800)

	// Zonder tuin kun je de oogstpagina niet openen; maak er dus eerst een.
	if (await page.getByRole('button', { name: /^Toevoegen$/ }).count() > 0) {
		await page.getByPlaceholder('Bijv. Moestuin achter het huis').fill('Checktuin')
		await page.getByRole('button', { name: /^Toevoegen$/ }).first().click()
		await page.waitForTimeout(2000)
	}
	console.log('gl-row count', await page.locator('.gl-row').count())
	await page.screenshot({ path: 'crop-state.png', fullPage: true })
	await page.getByRole('button', { name: /^Oogst$/ }).click()
	await page.waitForTimeout(1200)

	await page.locator('.shop-add-btn').click()
	await page.waitForTimeout(700)

	// Geen dropdown meer
	const selects = await page.locator('.shop-form-panel select').count()

	const cropInput = page.locator('#harvest-crop')
	// Mock de scraper zodat de test niet afhangt op een echte winkel.
	await ctx.route('**/api/preview-link*', (route) =>
		route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				title: 'Cherrytomaatjes 500g',
				price: 2.49,
				image: '',
			}),
		}),
	)

	await cropInput.fill('Cherrytomaatjes uit eigen tuin')
	await page.locator('#harvest-price').fill('')
	await page.locator('.shop-form-field input[type=number]').first().fill('3')
	await page.locator('#ref-weight').fill('0.5')
	await page.locator('#ref-url').fill('https://www.albertheijn.nl/product/cherrytomaatjes')
	await page.waitForTimeout(300)
	await page.getByRole('button', { name: /bereken/i }).click()
	await page.waitForTimeout(1200)
	await page.screenshot({ path: 'crop.png', fullPage: true })

	const autoPrice = await page.locator('#harvest-price').inputValue()
	const readout = await page.locator('.ref-readout').allInnerTexts()

	await page.getByRole('button', { name: /^toevoegen$/i }).click()
	await page.waitForTimeout(1500)
	await page.screenshot({ path: 'crop-list.png', fullPage: true })

	const title = await page.locator('.he-row-title').first().innerText()

	console.log(JSON.stringify({ selects, autoPrice, readout, title, errors }, null, 2))
	await browser.close()
}

void run()
