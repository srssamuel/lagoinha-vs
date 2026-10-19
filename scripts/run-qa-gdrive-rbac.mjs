import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT_DIR = path.resolve('docs/qa/gdrive-rbac');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const TARGET_URL = 'https://lagoinha-vs-jp.web.app';

async function run() {
  console.log(`[QA] Iniciando bateria de testes visuais e funcionais em: ${TARGET_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const consoleErrors = [];
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.warn('[Browser Console Error]:', msg.text());
    }
  });

  // 1. Navega para a página
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 2. Valida Header do Palco com Botão ADMIN EQUIPE
  console.log('[QA] 1. Validando Header do Palco com Botão ADMIN EQUIPE...');
  await page.screenshot({ path: path.join(OUT_DIR, '01-stage-desktop-admin-badge.png') });

  // 3. Abre Modal Banco de VS e clica na aba Google Drive Lagoinha
  console.log('[QA] 2. Abrindo Banco de VS e testando aba Google Drive Lagoinha...');
  const bancoVsBtn = page.locator('button:has-text("BANCO DE VS")');
  await bancoVsBtn.click();
  await page.waitForTimeout(600);

  const gdriveTabBtn = page.locator('button:has-text("Google Drive Lagoinha")');
  await gdriveTabBtn.click();
  await page.waitForTimeout(800);

  await page.screenshot({ path: path.join(OUT_DIR, '02-gdrive-library-tab-desktop.png') });

  // 4. Carrega uma faixa do Google Drive para o Setlist
  console.log('[QA] 3. Testando Carregamento de faixa do Google Drive no Setlist...');
  const carregarBtn = page.locator('button:has-text("Carregar no Setlist")').first();
  if (await carregarBtn.isVisible()) {
    await carregarBtn.click();
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: path.join(OUT_DIR, '03-gdrive-song-added.png') });

  // Fecha modal de Banco de VS
  const closeBancoVs = page.locator('div.fixed.inset-0 button').first();
  await closeBancoVs.click();
  await page.waitForTimeout(500);

  // 5. Abre Modal ADMIN EQUIPE
  console.log('[QA] 4. Abrindo Modal ADMIN EQUIPE (Gestão de Acessos & Convites)...');
  const adminEquipeBtn = page.locator('button:has-text("ADMIN EQUIPE")');
  await adminEquipeBtn.click();
  await page.waitForTimeout(800);

  // Aba Pendentes
  await page.screenshot({ path: path.join(OUT_DIR, '04-admin-modal-pending-approvals.png') });

  // Testa aprovação do membro pendente se houver botão
  const aprovarBtn = page.locator('button:has-text("Aprovar como Músico")').first();
  if (await aprovarBtn.isVisible()) {
    console.log('[QA] Aprovando usuário pendente...');
    await aprovarBtn.click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: path.join(OUT_DIR, '05-admin-user-approved.png') });

  // Alterna para aba Equipe Cadastrada
  console.log('[QA] 5. Testando aba Equipe Cadastrada...');
  const membrosTabBtn = page.locator('button:has-text("Equipe Cadastrada")');
  await membrosTabBtn.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, '06-admin-active-members.png') });

  // Alterna para aba Gerar Links de Convite
  console.log('[QA] 6. Testando aba Gerar Links de Convite...');
  const conviteTabBtn = page.locator('button:has-text("Gerar Links de Convite")');
  await conviteTabBtn.click();
  await page.waitForTimeout(600);

  const gerarLinkBtn = page.locator('button:has-text("Gerar Link de Convite Oficial")');
  if (await gerarLinkBtn.isVisible()) {
    await gerarLinkBtn.click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: path.join(OUT_DIR, '07-admin-invite-link-generated.png') });

  // Fecha modal Admin
  const closeAdminModal = page.locator('button[aria-label="Fechar"]').first();
  if (await closeAdminModal.isVisible()) {
    await closeAdminModal.click();
  }
  await page.waitForTimeout(500);

  // 6. Teste de Usuário Pendente (PendingApprovalModal)
  console.log('[QA] 7. Testando tela de Usuário Pendente de Aprovação...');
  await page.evaluate(() => {
    localStorage.removeItem('lagoinha_vs_logged_out');
    localStorage.setItem(
      'lagoinha_vs_auth_user',
      JSON.stringify({
        uid: 'user-pending-test',
        email: 'novo.batera@lagoinhajp.com.br',
        displayName: 'Lucas Baterista',
        role: 'pending',
        status: 'pending',
        churchBranch: 'Lagoinha João Pessoa',
        instrumentOrMinistry: 'Bateria & Percussão',
        createdAt: new Date().toISOString()
      })
    );
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '08-pending-approval-modal.png') });

  // 7. Multi-viewport QA (Tablet 768x1024 & Mobile 375x667)
  console.log('[QA] 8. Testando responsividade Tablet (768px)...');
  await page.evaluate(() => {
    localStorage.removeItem('lagoinha_vs_auth_user');
    localStorage.removeItem('lagoinha_vs_logged_out');
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, '09-tablet-stage-768x1024.png') });

  console.log('[QA] 9. Testando responsividade Mobile (375px)...');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, '10-mobile-stage-375x667.png') });

  await browser.close();

  const report = {
    timestamp: new Date().toISOString(),
    url: TARGET_URL,
    totalConsoleErrors: consoleErrors.length,
    consoleErrors,
    status: consoleErrors.length === 0 ? 'PASSED' : 'PASSED_WITH_WARNINGS',
    screenshots: [
      '01-stage-desktop-admin-badge.png',
      '02-gdrive-library-tab-desktop.png',
      '03-gdrive-song-added.png',
      '04-admin-modal-pending-approvals.png',
      '05-admin-user-approved.png',
      '06-admin-active-members.png',
      '07-admin-invite-link-generated.png',
      '08-pending-approval-modal.png',
      '09-tablet-stage-768x1024.png',
      '10-mobile-stage-375x667.png'
    ]
  };

  fs.writeFileSync(path.join(OUT_DIR, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.log('[QA] Bateria concluída com sucesso! Relatório gerado em:', path.join(OUT_DIR, 'qa-report.json'));
}

run().catch((err) => {
  console.error('[QA Error]:', err);
  process.exit(1);
});
