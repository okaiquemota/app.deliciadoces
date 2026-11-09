/*
 * Tema claro ou escuro, aplicado ANTES de a página aparecer.
 *
 * Fica aqui, carregado no <head> sem `defer`, e não dentro do pacote do
 * React: o React só roda depois de baixar e montar a tela, e até lá quem
 * escolheu o escuro veria um clarão branco a cada abertura. Arquivo à
 * parte, e não um <script> escrito no HTML, porque a política de
 * segurança do site (vercel.json) só aceita script vindo de arquivo.
 *
 * A escolha mora no navegador: "auto" (o padrão) segue o aparelho, e
 * "claro" ou "escuro" fixam. A tela de Minha conta usa a mesma chave e a
 * mesma regra (ver src/utils/tema.js); as duas precisam bater.
 */
(() => {
  const CHAVE = '@deliciadoces:tema';
  const COR_DA_BARRA = { claro: '#ffffff', escuro: '#1c1c1e' };
  const sistemaEscuro = window.matchMedia('(prefers-color-scheme: dark)');

  function escolha() {
    try {
      return localStorage.getItem(CHAVE) || 'auto';
    } catch {
      return 'auto';
    }
  }

  function aplicar() {
    const e = escolha();
    const tema = e === 'escuro' || (e !== 'claro' && sistemaEscuro.matches) ? 'escuro' : 'claro';
    document.documentElement.setAttribute('data-tema', tema);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_DA_BARRA[tema]);
  }

  aplicar();
  // No automático, o aparelho virou para o escuro à noite: a tela vira junto.
  sistemaEscuro.addEventListener('change', aplicar);
})();
