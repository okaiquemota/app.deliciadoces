import { EmConstrucao } from '../components/EmConstrucao.jsx';

export function Estoque() {
  return (
    <EmConstrucao
      titulo="Estoque"
      descricao="Cadastro de produtos e controle de entradas e saídas."
      itens={[
        'Cadastro de produtos (nome, unidade, custo, estoque mínimo)',
        'Registrar entrada e saída de estoque',
        'Histórico de movimentações por produto',
        'Alerta de estoque baixo (Fase 2)',
      ]}
    />
  );
}
