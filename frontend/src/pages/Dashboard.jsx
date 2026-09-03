import { useAuth } from '../contexts/AuthContext.jsx';

/**
 * Dashboard — na Fase 1 mostra os indicadores consolidados do caixa e do
 * estoque. Por enquanto é só a estrutura da tela; os cartões serão
 * preenchidos quando o endpoint GET /api/dashboard existir.
 */
export function Dashboard() {
  const { usuario } = useAuth();

  const indicadores = [
    { rotulo: 'Entradas do mês', valor: '—', dica: 'Soma das movimentações de entrada' },
    { rotulo: 'Saídas do mês', valor: '—', dica: 'Soma das movimentações de saída' },
    { rotulo: 'Saldo do período', valor: '—', dica: 'Entradas menos saídas' },
    { rotulo: 'Produtos em estoque baixo', valor: '—', dica: 'Abaixo do estoque mínimo' },
  ];

  return (
    <section>
      <h1 className="pagina__titulo">Olá, {usuario?.nome?.split(' ')[0]} 👋</h1>
      <p className="pagina__texto">Visão geral do negócio.</p>

      <div className="indicadores">
        {indicadores.map((indicador) => (
          <article className="indicador" key={indicador.rotulo}>
            <span className="indicador__rotulo">{indicador.rotulo}</span>
            <strong className="indicador__valor">{indicador.valor}</strong>
            <span className="indicador__dica">{indicador.dica}</span>
          </article>
        ))}
      </div>

      <p className="cartao__aviso">
        Indicadores aguardando a implementação do endpoint de dashboard.
      </p>
    </section>
  );
}
