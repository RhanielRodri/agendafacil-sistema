const { chromium } = require('playwright');
const path = require('path');

const OUT = path.join(__dirname, 'screenshots', 'redesign');
const BASE = 'http://localhost:5173';

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  async function capture(name, fn, width = 1280, height = 900) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    try {
      await fn(page);
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
      console.log(`✓ ${name}.png`);
    } catch (e) {
      console.error(`✗ ${name}: ${e.message}`);
    } finally {
      await ctx.close();
    }
  }

  // home-desktop
  await capture('home-desktop', async (page) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await delay(500);
  });

  // home-mobile
  await capture('home-mobile', async (page) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await delay(500);
  }, 390, 844);

  // booking-servico — step 1 with service selected
  await capture('booking-servico', async (page) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      document.getElementById('agendamento')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await delay(300);
    // select first service
    await page.locator('.choice').first().click();
    await delay(200);
    await page.screenshot({ path: path.join(OUT, 'booking-servico.png') });
  });

  // booking-horarios — step 2 with slots
  await capture('booking-horarios', async (page) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      document.getElementById('agendamento')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await delay(300);
    await page.locator('.choice').first().click();
    await delay(200);
    await page.locator('text=Continuar').first().click();
    await delay(200);
    // select first professional
    await page.locator('select').selectOption({ index: 1 });
    await delay(800);
    await page.evaluate(() => {
      document.getElementById('agendamento')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
  });

  async function fillBookingForm(page) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      document.getElementById('agendamento')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await delay(300);
    await page.locator('.choice').first().click();
    await delay(200);
    await page.locator('text=Continuar').first().click();
    await delay(200);
    await page.locator('select').selectOption({ index: 1 });
    await delay(800);
    await page.locator('.slot:not([disabled])').first().click();
    await delay(200);
    await page.locator('text=Continuar').first().click();
    await delay(500);
    await page.getByRole('textbox', { name: 'Nome' }).fill('Carlos Demo');
    await page.getByRole('textbox', { name: 'Telefone' }).fill('11999990000');
    await page.getByRole('textbox', { name: 'E-mail' }).fill('carlos@demo.com');
    await delay(200);
  }

  // booking-formulario — step 3 form
  await capture('booking-formulario', async (page) => {
    await fillBookingForm(page);
    await page.evaluate(() => {
      document.getElementById('agendamento')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
  });

  // success-desktop
  await capture('success-desktop', async (page) => {
    await fillBookingForm(page);
    await page.locator('text=Confirmar agendamento').click();
    await delay(2000);
  });

  // admin-desktop
  await capture('admin-desktop', async (page) => {
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    await delay(800);
  });

  // admin-mobile
  await capture('admin-mobile', async (page) => {
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    await delay(800);
  }, 390, 844);

  await browser.close();
  console.log('\nDone. Screenshots saved to docs/screenshots/redesign/');
})();
