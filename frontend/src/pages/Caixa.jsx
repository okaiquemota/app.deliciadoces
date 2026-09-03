import { EmConstrucao } from '../components/EmConstrucao.jsx';

export function Caixa() {
  return (
    <EmConstrucao
      titulo="Fluxo de caixa"
      descricao="Registro das entradas e saídas financeiras da confeitaria."
      itens={[
        'Lançar entrada e saída (valor, descrição, categoria, data)',
        'Listar lançamentos com filtro por período e por tipo',
        'Editar e excluir lançamento',
        'Contas a pagar e a receber, com vencimento e baixa',
      ]}
    />
  );
}
