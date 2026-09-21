import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { dashboard, estoque } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { moeda, quantidade, data as formatarData } from '../utils/formato.js';
import { VendaRapida } from '../components/VendaRapida.jsx';
import { DinheiroRapido } from '../components/DinheiroRapido.jsx';
import {
  IconeVenda,
  IconeEntrada,
  IconeSaida,
  IconeRetirada,
  IconeFechamento,
  IconeResumo,
} from '../components/Icones.jsx';

/**
 * Tela inicial: AÇÃO, não número.
 *
 * A cliente destacou na reunião que não tem tempo de mexer no sistema.
 * Antes esta tela abria com quatro quadrados de valores — bonito de ver e
 * inútil no balcão, porque no meio da correria ela não precisa saber o
 * lucro da semana: precisa registrar o que acabou de acontecer.
 *
 * Então os quadrados viraram botões grandes, e os números mudaram para
 * /resumo, que ela abre quando senta para olhar o resultado.
 *
 * Os alertas ficaram aqui de propósito. São a única coisa que ela precisa
 * NOTAR sem ter ido procurar — ingrediente acabando ou vencendo não pode
 * depender de ela lembrar de abrir outra tela.
 */

/**
 * As ações em três tamanhos, e o tamanho é a hierarquia.
 *
 * Venda ocupa a largura inteira porque é o que ela faz dez vezes por dia;
 * entrada e saída dividem a linha seguinte; retirada, fechamento e resumo
 * ficam na fileira menor, que é tarefa de fim de dia e não de balcão.
 *
 * Sem isso os seis botões teriam o mesmo peso e ela leria os seis toda
 * vez para achar o mesmo de sempre.
 */
const PRINCIPAL = {
  id: 'venda',
  rotulo: 'Venda',
  dica: 'Escolha os doces vendidos',
  Icone: IconeVenda,
};

const MEDIAS = [
  { id: 'entrada', rotulo: 'Entrou dinheiro', dica: 'Só o valor', Icone: IconeEntrada },
  { id: 'saida', rotulo: 'Saiu dinheiro', dica: 'Ingrediente, conta', Icone: IconeSaida },
];

const PEQUENAS = [
  { id: 'retirada', rotulo: 'Retirada', Icone: IconeRetirada },
  { id: 'fechamento', rotulo: 'Fechar dia', Icone: IconeFechamento, rota: '/fechamento' },
  { id: 'resumo', rotulo: 'Resumo', Icone: IconeResumo, rota: '/resumo' },
];

export function Dashboard() {
  const { usuario } = useAuth();
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(null);
  const [alertas, setAlertas] = useState(null);
  const [hoje, setHoje] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      const [a, r] = await Promise.all([
        estoque.alertas(),
        dashboard.resumo({ inicio: paraDia(inicio), fim: paraDia(new Date()) }),
      ]);
      setAlertas(a);
      setHoje(r);
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function aoLancar() {
    setAberto(null);
    carregar();
  }

  const listaAlertas = montarAlertas(alertas);

  return (
    <section>
      <div className="pagina__cabecalho">
        <div>
          <h1 className="pagina__titulo">Olá, {usuario?.nome?.split(' ')[0]}</h1>
          <p className="pagina__texto">O que aconteceu agora?</p>
        </div>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      <div className="acoes">
        <Cartao acao={PRINCIPAL} tamanho="grande" onClick={() => setAberto(PRINCIPAL.id)} />

        <div className="acoes__linha acoes__linha--dupla">
          {MEDIAS.map((a) => (
            <Cartao key={a.id} acao={a} onClick={() => setAberto(a.id)} />
          ))}
        </div>

        <div className="acoes__linha acoes__linha--tripla">
          {PEQUENAS.map((a) => (
            <Cartao
              key={a.id}
              acao={a}
              tamanho="pequeno"
              onClick={() => (a.rota ? navegar(a.rota) : setAberto(a.id))}
            />
          ))}
        </div>
      </div>

      {/* Uma linha só: quanto entrou hoje. Não é painel, é confirmação de
          que os lançamentos do dia chegaram onde deviam. */}
      {hoje && (
        <button type="button" className="resumo-dia" onClick={() => navegar('/resumo')}>
          <span>
            Hoje entraram <strong>{moeda(hoje.vendas)}</strong> em {hoje.quantidadeVendas} venda(s)
          </span>
          <span className="resumo-dia__link">ver o resumo</span>
        </button>
      )}

      {listaAlertas.length > 0 && (
        <article className="cartao cartao--alerta">
          <h2 className="cartao__subtitulo">Precisa de atenção</h2>
          <ul className="lista-simples">
            {listaAlertas.map((a) => (
              <li key={a.chave}>
                <span>{a.texto}</span>
                <strong className={a.critico ? 'fechamento__falta' : undefined}>{a.valor}</strong>
              </li>
            ))}
          </ul>
        </article>
      )}

      <VendaRapida
        aberto={aberto === 'venda'}
        aoFechar={() => setAberto(null)}
        aoLancar={aoLancar}
      />
      <DinheiroRapido
        modo={aberto === 'entrada' || aberto === 'saida' || aberto === 'retirada' ? aberto : null}
        aoFechar={() => setAberto(null)}
        aoLancar={aoLancar}
      />
    </section>
  );
}

/**
 * Cartão de ação: ícone no alto, rótulo embaixo.
 *
 * O vão entre os dois é de propósito — é ele que faz o cartão virar alvo
 * grande em vez de linha de lista. O dedo acerta o cartão inteiro, não só
 * o texto.
 */
function Cartao({ acao, tamanho = 'medio', onClick }) {
  const { Icone, rotulo, dica } = acao;
  return (
    <button type="button" className={`cartao-acao cartao-acao--${tamanho}`} onClick={onClick}>
      <Icone tamanho={tamanho === 'pequeno' ? 24 : 30} />
      <span className="cartao-acao__texto">
        <span className="cartao-acao__rotulo">{rotulo}</span>
        {dica && <span className="cartao-acao__dica">{dica}</span>}
      </span>
    </button>
  );
}

/** Data no formato do input, montada com componentes locais (fuso). */
function paraDia(valor) {
  const d = new Date(valor);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Junta os alertas numa lista só, já em linguagem de gente.
 *
 * Lote VENCIDO é separado de lote VENCENDO: a ação é diferente — um se
 * joga fora, o outro se usa primeiro. Chamar os dois de "vence em breve",
 * como era antes, fazia o vencido há meses aparecer no topo com rótulo
 * errado, empurrando para baixo o que ainda dava para salvar.
 */
function montarAlertas(alertas) {
  if (!alertas) return [];
  const linhas = [];

  for (const i of alertas.insumosBaixos ?? []) {
    linhas.push({
      chave: `i-${i.id}`,
      texto: `${i.nome} está acabando`,
      valor: quantidade(i.quantidadeAtual, i.unidade),
    });
  }
  for (const p of alertas.produtosBaixos ?? []) {
    linhas.push({
      chave: `p-${p.id}`,
      texto: `${p.nome} está acabando`,
      valor: quantidade(p.quantidadeAtual, p.unidade),
    });
  }
  for (const m of alertas.validadeProxima ?? []) {
    const vencido = new Date(m.validade) < new Date();
    linhas.push({
      chave: `v-${m.id}`,
      texto: `${m.insumo?.nome} ${vencido ? 'está VENCIDO' : 'vence em breve'}`,
      valor: formatarData(m.validade),
      critico: vencido,
    });
  }
  // Vencido primeiro: é o que exige ação hoje.
  return linhas.sort((a, b) => Number(Boolean(b.critico)) - Number(Boolean(a.critico)));
}
