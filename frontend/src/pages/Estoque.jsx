import { EmConstrucao } from '../components/EmConstrucao.jsx';

export function Estoque() {
  return (
    <EmConstrucao
      titulo="Estoque"
      descricao="Estoque em dois níveis: ingredientes e doces prontos."
      itens={[
        'Cadastro de insumos (unidade, custo médio, estoque mínimo, validade)',
        'Cadastro de doces prontos, com preço de venda',
        'Registrar compra, perda e ajuste de contagem',
        'Aviso de item acabando e de validade próxima',
      ]}
    />
  );
}
