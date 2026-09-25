import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal usado por todos os formulários de cadastro e lançamento.
 * Fecha no Esc e no clique fora — a cliente pediu simplicidade, e ter que
 * caçar o botão de fechar é atrito bobo.
 */
export function Modal({ aberto, aoFechar, titulo, children, largura = 520 }) {
  /**
   * O diálogo precisa de NOME. Com `role="dialog"` e nada mais, o leitor
   * de tela anuncia só "diálogo" e quem não vê a tela não sabe se abriu a
   * venda ou a retirada. O título já está escrito ali em cima; basta
   * apontar para ele, em vez de repetir o texto num `aria-label`.
   */
  const idTitulo = useId();

  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = (e) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, aoFechar]);

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
        className="modal__caixa"
        style={{ maxWidth: largura }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
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
