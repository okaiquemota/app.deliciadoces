import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** O que recebe foco pelo Tab dentro da janela. */
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal usado por todos os formulários de cadastro e lançamento.
 * Fecha no Esc e no clique fora — a cliente pediu simplicidade, e ter que
 * caçar o botão de fechar é atrito bobo.
 *
 * Enquanto está aberta, a janela é o mundo de quem usa teclado ou leitor
 * de tela:
 * - o resto do app fica `inert` — nem o Tab nem o leitor de tela chegam
 *   lá. Antes, de 24 Tabs dados com a janela aberta, 14 caíam no menu e
 *   no cabeçalho escondidos atrás dela;
 * - o Tab dá a volta dentro da janela (do último volta ao primeiro);
 * - ao abrir, o foco entra nela: no campo com `autoFocus`, se houver; senão
 *   na própria janela, e o leitor de tela lê o título. Não no primeiro
 *   botão, que às vezes é o de excluir;
 * - ao fechar, o foco volta para o botão que a abriu, e quem usa teclado
 *   continua de onde estava em vez de recomeçar do topo da página.
 */
export function Modal({ aberto, aoFechar, titulo, children, largura = 520 }) {
  /**
   * O diálogo precisa de NOME. Com `role="dialog"` e nada mais, o leitor
   * de tela anuncia só "diálogo" e quem não vê a tela não sabe se abriu a
   * venda ou a retirada. O título já está escrito ali em cima; basta
   * apontar para ele, em vez de repetir o texto num `aria-label`.
   */
  const idTitulo = useId();
  const refCaixa = useRef(null);
  // Quem estava com o foco ANTES de a janela montar — o botão que a abriu.
  // Guardado no primeiro render porque, quando o efeito roda, um campo com
  // `autoFocus` dentro da janela já tomou o foco.
  const [anterior] = useState(() => document.activeElement);

  // `aoFechar` muda a cada render de quem chama; a ref evita refazer o foco
  // (e roubar o cursor do campo) toda vez que a tela de trás redesenha.
  const refFechar = useRef(aoFechar);
  useEffect(() => {
    refFechar.current = aoFechar;
  });

  useEffect(() => {
    if (!aberto) return undefined;
    const caixa = refCaixa.current;
    const app = document.getElementById('root');
    if (app) app.inert = true;

    if (caixa && !caixa.contains(document.activeElement)) {
      caixa.focus();
    }

    function aoTeclar(e) {
      if (e.key === 'Escape') {
        refFechar.current();
        return;
      }
      if (e.key !== 'Tab' || !caixa) return;
      const focaveis = [...caixa.querySelectorAll(FOCAVEIS)].filter((el) => el.offsetParent);
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }

    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      if (app) app.inert = false;
      if (anterior?.isConnected) anterior.focus();
    };
  }, [aberto, anterior]);

  if (!aberto) return null;

  /**
   * Desenhada direto no `<body>`, e não onde foi declarada.
   *
   * Declarada dentro da tela, a janela nasce dentro do quadro que rola. No
   * Safari do iPhone, um elemento fixo ali dentro é RECORTADO pelo quadro:
   * a janela em tela cheia perdia o topo — título e o × de fechar ficavam
   * escondidos atrás do cabeçalho do app, e não havia como voltar.
   */
  return createPortal(
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div
        ref={refCaixa}
        className="modal__caixa"
        style={{ maxWidth: largura }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
      >
        {/* `div`, não `header`: fora do `<main>`, um `header` vira o
            cabeçalho do SITE para o leitor de tela — um segundo, repetindo
            o do app. */}
        <div className="modal__topo">
          <h2 className="modal__titulo" id={idTitulo}>
            {titulo}
          </h2>
          <button type="button" className="modal__fechar" onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal__corpo">{children}</div>
      </div>
    </div>,
    document.body
  );
}
