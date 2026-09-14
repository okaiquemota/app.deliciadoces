import { useEffect } from 'react';

/**
 * Modal usado por todos os formulários de cadastro e lançamento.
 * Fecha no Esc e no clique fora — a cliente pediu simplicidade, e ter que
 * caçar o botão de fechar é atrito bobo.
 */
export function Modal({ aberto, aoFechar, titulo, children, largura = 520 }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = (e) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal__caixa" style={{ maxWidth: largura }} role="dialog" aria-modal="true">
        <header className="modal__topo">
          <h2 className="modal__titulo">{titulo}</h2>
          <button type="button" className="modal__fechar" onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        </header>
        <div className="modal__corpo">{children}</div>
      </div>
    </div>
  );
}
