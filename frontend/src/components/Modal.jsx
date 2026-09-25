import { useEffect, useId } from 'react';

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

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div
        className="modal__caixa"
        style={{ maxWidth: largura }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
      >
        <header className="modal__topo">
          <h2 className="modal__titulo" id={idTitulo}>
            {titulo}
          </h2>
          <button type="button" className="modal__fechar" onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        </header>
        <div className="modal__corpo">{children}</div>
      </div>
    </div>
  );
}
