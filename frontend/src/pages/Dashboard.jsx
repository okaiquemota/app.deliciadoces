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
  IconeAtencao,
  IconeSeta,
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
 * As ações em três tamanhos, e o TAMANHO é toda a hierarquia.
 *
 * Venda ocupa a largura inteira porque é o que ela faz dez vezes por dia;
 * entrada e saída dividem a linha seguinte; retirada, fechar dia e resumo
 * ficam na fileira menor, que é tarefa de fim de expediente.
 *
 * Nenhum cartão é preenchido de cor. A primeira versão destacava Venda
 * com fundo vinho, mas a referência resolve isso só com a largura — e com
 * um cartão colorido no meio de cinco brancos, a cor vira o assunto da
 * tela em vez de ser a marca aparecendo discretamente.
 */
const PRINCIPAL = { id: 'venda', rotulo: 'Venda', Icone: IconeVenda };

const MEDIAS = [
  { id: 'entrada', rotulo: 'Entrou dinheiro', Icone: IconeEntrada },
  { id: 'saida', rotulo: 'Saiu dinheiro', Icone: IconeSaida },
];

/** "Boa tarde" conforme a hora — ela abre isso a manhã e a noite inteira. */
function saudacao(agora = new Date()) {
  const h = agora.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

const DIA_LONGO = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

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

  /**
   * Os alertas viram UMA FAIXA, não uma lista.
   *
   * A lista não tinha teto: com doze ingredientes em falta ela ocupava
   * 300px e empurrava os cartões de ação para fora da tela — o contrário
   * do que esta tela existe para fazer. Mas sumir com o aviso também não
   * serve, porque é a única coisa que ela precisa NOTAR sem ter ido
   * procurar.
   *
   * A faixa mostra o caso mais urgente (vencido primeiro, pela ordem que
   * `montarAlertas` já devolve) e o total. O resto fica a um toque, no
   * Estoque, onde a lista completa cabe.
   */
  const alertaTopo = listaAlertas[0];
  const alertasRestantes = listaAlertas.length - 1;

  /**
   * O movimento do dia vai PARA DENTRO do botão, e é o número que manda.
   *
   * A versão anterior era um quadrado com o ícone no alto e um vão vazio
   * de cem pixels até o rótulo — ocupava a tela inteira para dizer uma
   * palavra, e o número que interessava àquela ação vivia noutra tela.
   * Agora o botão é uma ficha: o que ela faz em cima, quanto já deu hoje
   * no meio, o detalhe embaixo.
   */
  const dados = {
    venda: hoje && {
      valor: moeda(hoje.vendas),
      detalhe: `${hoje.quantidadeVendas} ${hoje.quantidadeVendas === 1 ? 'venda' : 'vendas'} hoje`,
    },
    entrada: hoje && { valor: moeda(hoje.vendasAvulsas), detalhe: 'entrou hoje' },
    saida: hoje && { valor: moeda(hoje.custos), detalhe: 'saiu hoje' },
  };

  return (
    <section className="inicio">
      {erro && <p className="alerta alerta--erro">{erro}</p>}

      <header className="saudacao">
        <h2 className="saudacao__titulo">
          {saudacao()}, {usuario?.nome?.split(' ')[0]}
        </h2>
        <p className="saudacao__data">{DIA_LONGO.format(new Date())}</p>
      </header>

      {/*
        Uma grade de 6 colunas, sem `div` de linha no meio. O tamanho do
        cartão é quantas colunas ele ocupa — 6, 3 ou 2 — e quem decide isso
        é o CSS, pelo nome do tamanho. Antes cada fileira era um `div` que
        montava a sua própria grade, com a sua própria contagem de colunas.
      */}
      <div className="acoes">
        <Cartao
          acao={PRINCIPAL}
          tamanho="grande"
          dado={dados.venda}
          onClick={() => setAberto(PRINCIPAL.id)}
        />

        {MEDIAS.map((a) => (
          <Cartao key={a.id} acao={a} dado={dados[a.id]} onClick={() => setAberto(a.id)} />
        ))}

        {PEQUENAS.map((a) => (
          <Cartao
            key={a.id}
            acao={a}
            tamanho="pequeno"
            onClick={() => (a.rota ? navegar(a.rota) : setAberto(a.id))}
          />
        ))}
      </div>

      {alertaTopo && (
        <button
          type="button"
          className={alertaTopo.critico ? 'faixa-alerta faixa-alerta--critica' : 'faixa-alerta'}
          onClick={() => navegar('/estoque')}
        >
          <span className="faixa-alerta__selo">
            <IconeAtencao tamanho={18} />
          </span>
          <span className="faixa-alerta__corpo">
            <span className="faixa-alerta__texto">{alertaTopo.texto}</span>
            {alertasRestantes > 0 && (
              <span className="faixa-alerta__resto">
                e mais {alertasRestantes} {alertasRestantes === 1 ? 'item' : 'itens'} precisam de
                atenção
              </span>
            )}
          </span>
          <span className="faixa-alerta__seta">
            <IconeSeta tamanho={17} />
          </span>
        </button>
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
 * Botão de ação em forma de ficha: rótulo, valor do dia, detalhe, e o
 * ícone discreto no canto.
 *
 * O ícone saiu do lugar de destaque de propósito. Ele serve para ela
 * reconhecer o botão de relance depois de usar o sistema uma semana; nos
 * primeiros dias quem carrega a leitura é a palavra, e nos dois casos o
 * que ela quer ver é o número.
 *
 * `dado` só existe onde há movimento para mostrar. Retirada, Fechar dia e
 * Resumo não têm número — são tarefa, não medida — e por isso ficam mais
 * baixos, o que também é o que dá a hierarquia da tela.
 */
function Cartao({ acao, tamanho = 'medio', dado, onClick }) {
  const { Icone, rotulo } = acao;
  return (
    <button type="button" className={`cartao-acao cartao-acao--${tamanho}`} onClick={onClick}>
      <span className="cartao-acao__selo">
        <Icone tamanho={tamanho === 'grande' ? 20 : 18} />
      </span>
      <span className="cartao-acao__rotulo">{rotulo}</span>
      {dado && (
        <>
          <span className="cartao-acao__valor">{dado.valor}</span>
          <span className="cartao-acao__rodape">{dado.detalhe}</span>
        </>
      )}
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
