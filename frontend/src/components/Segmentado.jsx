/**
 * Controle segmentado: opções lado a lado, uma ligada — o de "Saída |
 * Retirada pessoal" no Caixa, o de "Perdi | Corrigir contagem" no Ajustar.
 *
 * `aria-pressed` diz a quem usa leitor de tela qual opção está ligada; a
 * pastilha branca só diz a quem vê. `cheio` divide a largura toda por
 * igual, como escolha de formulário.
 */
export function Segmentado({ rotulo, opcoes, valor, aoTrocar, cheio = false }) {
  return (
    <div
      className={cheio ? 'seletor-periodo seletor-periodo--cheio' : 'seletor-periodo'}
      role="group"
      aria-label={rotulo}
    >
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={valor === o.id}
          className={
            valor === o.id
              ? 'seletor-periodo__item seletor-periodo__item--ativo'
              : 'seletor-periodo__item'
          }
          onClick={() => aoTrocar(o.id)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
