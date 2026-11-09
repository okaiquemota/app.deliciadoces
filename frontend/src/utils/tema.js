/**
 * A escolha de tema da Minha conta: Automático, Claro ou Escuro.
 *
 * Quem aplica o tema ao abrir o sistema é `public/tema.js`, que roda no
 * <head> antes da tela aparecer. Aqui fica o mesmo cálculo para quando ela
 * troca a escolha com a página aberta. Chave e regra precisam bater com as
 * de lá.
 */

const CHAVE = '@deliciadoces:tema';
const COR_DA_BARRA = { claro: '#ffffff', escuro: '#1c1c1e' };

export const TEMAS = [
  { id: 'auto', rotulo: 'Automático' },
  { id: 'claro', rotulo: 'Claro' },
  { id: 'escuro', rotulo: 'Escuro' },
];

export function temaEscolhido() {
  try {
    return localStorage.getItem(CHAVE) || 'auto';
  } catch {
    return 'auto';
  }
}

export function escolherTema(escolha) {
  try {
    if (escolha === 'auto') localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, escolha);
  } catch {
    // Sem onde guardar: vale até fechar a página.
  }
  const sistemaEscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const tema = escolha === 'escuro' || (escolha !== 'claro' && sistemaEscuro) ? 'escuro' : 'claro';
  document.documentElement.setAttribute('data-tema', tema);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_DA_BARRA[tema]);
}
