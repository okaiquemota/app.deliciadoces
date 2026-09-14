/** Navegação entre seções de uma mesma tela (ex.: Vendas / Despesas). */
export function Abas({ abas, ativa, aoTrocar }) {
  return (
    <nav className="abas">
      {abas.map((aba) => (
        <button
          key={aba.id}
          type="button"
          className={ativa === aba.id ? 'abas__item abas__item--ativo' : 'abas__item'}
          onClick={() => aoTrocar(aba.id)}
        >
          {aba.rotulo}
        </button>
      ))}
    </nav>
  );
}
