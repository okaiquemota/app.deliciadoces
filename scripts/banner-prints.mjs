/**
 * Prints do sistema para o banner da Feira de Tecnologia
 * (Fábrica de Software IV). Banner de 90 × 120 cm: as imagens saem em
 * alta resolução — 2880 × 1800 no computador (1440 × 900, escala 2) e
 * 1170 × 2532 no celular (390 × 844, escala 3).
 *
 * SÓ com o sistema rodando LOCALMENTE e o banco de DEMONSTRAÇÃO:
 *
 *   1. Banco local com os dados fictícios (o seed recusa banco que não
 *      seja local):
 *        DATABASE_URL="postgresql://postgres@localhost:5432/deliciadoces_banner" \
 *        DEMO_SENHA="escolha-uma" npm run db:seed:banner
 *   2. Backend com a MESMA DATABASE_URL e o frontend:
 *        npm run dev:backend      (em um terminal)
 *        npm run dev:frontend     (em outro)
 *   3. Os prints:
 *        DEMO_SENHA="a-mesma" npm run banner:prints
 *
 * Na primeira vez numa máquina, o navegador do Playwright:
 *   npx playwright install chromium
 *
 * Saem em `banner-prints/` (fora do Git). Antes de cada foto o script
 * espera a tela assentar: sem esqueleto de carregamento, sem aviso de
 * erro ou de sucesso aberto, com as fontes carregadas.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const BASE = process.env.BANNER_URL || 'http://localhost:5173';
const EMAIL = process.env.DEMO_EMAIL || 'demo@exemplo.com';
const SENHA = process.env.DEMO_SENHA;
const SAIDA = path.resolve(process.env.BANNER_SAIDA || 'banner-prints');

if (!SENHA) {
  console.error('Defina DEMO_SENHA com a senha usada no `npm run db:seed:banner`.');
  process.exit(1);
}
// Prints só do sistema local, com o banco de demonstração — nunca da
// produção, que tem dados reais da confeitaria.
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(BASE)) {
  console.error(`Recusado: BANNER_URL precisa ser local (recebi ${BASE}).`);
  process.exit(1);
}

const COMUM = {
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  colorScheme: 'light',
  // Sem animação: a foto pega a tela já parada, não no meio de uma entrada.
  reducedMotion: 'reduce',
};

const COMPUTADOR = { ...COMUM, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const CELULAR = {
  ...COMUM,
  ...devices['iPhone 13'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
};

/** Espera a tela ficar pronta para a foto e confere que não há nada errado nela. */
async function assentar(page, onde) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(
    () =>
      !document.querySelector('.esqueleto, .carregando, .esqueleto__bloco--total') &&
      ![...document.querySelectorAll('[role=status]')].some((el) =>
        /carregando/i.test(el.textContent)
      ),
    null,
    { timeout: 15000 }
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const problema = await page.evaluate(() => {
    if (document.querySelector('.alerta--erro, .pagina-erro')) return 'aviso de erro na tela';
    if (document.querySelector('.alerta--ok')) return 'aviso de sucesso aberto';
    if (location.pathname === '/login') return 'caiu no login';
    return null;
  });
  if (problema) throw new Error(`${onde}: ${problema}`);
}

async function entrar(page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('E-mail ou usuário').fill(EMAIL);
  await page.locator('input[type=password]').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/dashboard');
}

async function foto(page, nome) {
  const arquivo = path.join(SAIDA, nome);
  await page.screenshot({ path: arquivo, animations: 'disabled', caret: 'hide' });
  console.log(`  ✓ ${path.relative(process.cwd(), arquivo)}`);
}

async function abrir(page, rota) {
  await page.goto(`${BASE}/${rota}`);
  await assentar(page, rota);
}

const browser = await chromium.launch();
try {
  await mkdir(SAIDA, { recursive: true });
  console.log(`Prints em ${SAIDA}`);

  // ------------------------------------------------------ computador
  const pc = await browser.newContext(COMPUTADOR);
  await pc.addInitScript(() => localStorage.setItem('@deliciadoces:tema', 'claro'));
  const p = await pc.newPage();
  await entrar(p);

  await abrir(p, 'dashboard');
  await foto(p, '01-dashboard.png');

  await abrir(p, 'caixa');
  await foto(p, '02-vendas-caixa.png');

  // Nova venda: a janela do Início com um carrinho de balcão de verdade.
  await abrir(p, 'dashboard');
  await p.locator('.cartao-acao--grande').click();
  await p.getByRole('dialog').waitFor();
  await assentar(p, 'nova venda');
  for (const [doce, vezes] of [
    ['Brigadeiro', 12],
    ['Beijinho', 6],
    ['Bolo de pote', 2],
  ]) {
    const botao = p.getByRole('button', { name: `Adicionar ${doce}`, exact: true });
    for (let i = 0; i < vezes; i += 1) await botao.click();
  }
  await p.getByRole('dialog').getByRole('button', { name: 'Pix', exact: true }).click();
  await p.waitForTimeout(300);
  await foto(p, '03-vendas-nova-venda.png');
  await p.keyboard.press('Escape');

  await abrir(p, 'estoque');
  await foto(p, '04-estoque-avisos.png');

  await abrir(p, 'resumo');
  await p.getByRole('button', { name: 'Este mês', exact: true }).click();
  await assentar(p, 'resumo do mês');
  await foto(p, '05-resumo-do-mes.png');

  await abrir(p, 'producao');
  await foto(p, '07-producao.png');

  await abrir(p, 'fechamento');
  await foto(p, '08-fechamento-diario.png');
  await pc.close();

  // ------------------------------------------------------ celular
  const cel = await browser.newContext(CELULAR);
  await cel.addInitScript(() => localStorage.setItem('@deliciadoces:tema', 'claro'));
  const c = await cel.newPage();
  await entrar(c);
  await abrir(c, 'dashboard');
  await foto(c, '06-celular-dashboard.png');
  await cel.close();
} finally {
  await browser.close();
}
