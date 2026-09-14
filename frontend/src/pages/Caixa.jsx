import { EmConstrucao } from '../components/EmConstrucao.jsx';

export function Caixa() {
  return (
    <EmConstrucao
      titulo="Fluxo de caixa"
      descricao="Vendas e despesas da confeitaria. Toda venda é à vista — a cliente não vende fiado."
      itens={[
        'Lançar venda (itens, forma de pagamento) com baixa automática do doce pronto',
        'Lançar despesa por categoria, separando custo do negócio de retirada pessoal',
        'Editar e excluir lançamento — fluxo principal, não exceção',
        'Fechamento diário: comparar o caixa contado com o calculado',
      ]}
    />
  );
}
