import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { dashboard, despesas, vendas } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { moeda, saudacao } from '../utils/formato.js';
import { VendaRapida } from '../components/VendaRapida.jsx';
import { DinheiroRapido } from '../components/DinheiroRapido.jsx';
import { avisarEstoqueMudou } from '../components/EstoqueComum.jsx';
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
 * No computador, embaixo dos botões vai o último lançamento de cada tipo.
 * Serve de recibo: ela registra uma venda, o cartão muda, e ela vê que
 * entrou — sem abrir o Caixa para conferir. É também onde um valor
 * digitado errado aparece na hora, em vez de esperar o fechamento.
 *
 * No CELULAR ele não existe. Empilhado, comia três linhas da tela que os
 * botões queriam, e no balcão ela está aqui para lançar, não para
 * conferir. Some do markup e a consulta nem é feita — esconder por CSS
 * deixaria o telefone pedindo dados que ninguém vai ver.
 *
 * O aviso de estoque saiu daqui. Ele não sumiu: virou um contador no item
 * Estoque do menu, que fica à vista em TODAS as telas e não só nesta.
 */

/**
 * As ações em três tamanhos, e o TAMANHO é toda a hierarquia.
 *
 * Venda ocupa a largura inteira porque é o que ela faz dez vezes por dia;
 * entrada e saída dividem a linha seguinte; retirada, fechar dia e resumo
 * ficam na fileira menor, que é tarefa de fim de expediente.
 *
 * O de Venda é o único escuro, no preto da marca: a mancha forte da tela
 * é a do botão que ela mais usa. Os outros vão num degradê leve, do
 * branco ao rosa, com o rosa no canto sem texto.
 */
const PRINCIPAL = { id: 'venda', rotulo: 'Venda', Icone: IconeVenda };

const MEDIAS = [
  { id: 'entrada', rotulo: 'Entrada avulsa', Icone: IconeEntrada },
  { id: 'saida', rotulo: 'Saída', Icone: IconeSaida },
];

const DIA_LONGO = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * O mini-histórico: o último de cada tipo, na mesma ordem dos botões
 * acima, para o olho descer de "Venda" para "Última venda" sem procurar.
 * Ícone e sinal são os mesmos das linhas do Caixa.
 */
const HISTORICO = [
  { chave: 'venda', rotulo: 'Última venda', Icone: IconeVenda, sinal: 1 },
  { chave: 'entrada', rotulo: 'Última entrada', Icone: IconeEntrada, sinal: 1 },
  { chave: 'saida', rotulo: 'Última saída', Icone: IconeSaida, sinal: -1 },
];

const PEQUENAS = [
  { id: 'retirada', rotulo: 'Retirada pessoal', Icone: IconeRetirada },
  { id: 'fechamento', rotulo: 'Fechar dia', Icone: IconeFechamento, rota: '/fechamento' },
  { id: 'resumo', rotulo: 'Resumo', Icone: IconeResumo, rota: '/resumo' },
];

/**
 * O Início da funcionária: os mesmos três botões de lançar, sem o valor
 * do dia — "quanto já vendeu hoje" é o total que a Dalila pediu para
 * ficar só com ela.
 *
 * No lugar do dinheiro, QUANTOS lançamentos ela mesma fez hoje. Não é
 * total do caixa (é só o dela, e sem valor), e faz o papel de recibo que
 * o número tem para a Dalila: ela lança, o cartão responde.
 *
 * Retirada pessoal, Fechar dia e Resumo não aparecem: são da dona.
 */
const CONTAGEM_DO_BALCAO = {
  venda: ['venda sua hoje', 'vendas suas hoje'],
  entrada: ['entrada sua hoje', 'entradas suas hoje'],
  saida: ['saída sua hoje', 'saídas suas hoje'],
};

/** Os lançamentos dela de hoje, contados por botão. O servidor já recorta. */
async function contarMeusDeHoje() {
  const [v, d] = await Promise.all([
    vendas.listar({ limite: 1000 }),
    despesas.listar({ limite: 1000 }),
  ]);
  return {
    venda: v.filter((x) => x.itens.length > 0).length,
    entrada: v.filter((x) => x.itens.length === 0).length,
    saida: d.length,
  };
}

/**
 * Verdadeiro acima do ponto em que a barra de navegação sai do rodapé e
 * vira coluna. O número vive aqui e no CSS, e os dois precisam bater —
 * está no mesmo comentário dos dois lados.
 */
function usaHistorico() {
  return window.matchMedia('(min-width: 901px)').matches;
}

export function Dashboard() {
  const { usuario, admin } = useAuth();
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(null);
  const [ultimos, setUltimos] = useState(null);
  const [hoje, setHoje] = useState(null);
  const [meus, setMeus] = useState(null);
  const [largo, setLargo] = useState(usaHistorico);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    if (!admin) {
      try {
        setMeus(await contarMeusDeHoje());
        setErro('');
      } catch (e) {
        setErro(mensagemDeErro(e));
      }
      return;
    }
    try {
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      const [r, u] = await Promise.all([
        dashboard.resumo({ inicio: paraDia(inicio), fim: paraDia(new Date()) }),
        usaHistorico() ? dashboard.ultimos() : null,
      ]);
      setHoje(r);
      setUltimos(u);
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }, [admin]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Acompanha a janela em vez de ler a largura uma vez: no computador ela
  // pode estreitar a janela, e aí o histórico precisa sair de cena.
  useEffect(() => {
    const consulta = window.matchMedia('(min-width: 901px)');
    const aoMudar = () => setLargo(consulta.matches);
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);

  function aoLancar() {
    setAberto(null);
    carregar();
    // A venda baixa doce pronto: o número de "acabando" da Produção pode
    // ter mudado.
    avisarEstoqueMudou();
  }

  /**
   * O movimento do dia vai PARA DENTRO do botão, e é o número que manda.
   *
   * A versão anterior era um quadrado com o ícone no alto e um vão vazio
   * de cem pixels até o rótulo — ocupava a tela inteira para dizer uma
   * palavra, e o número que interessava àquela ação vivia noutra tela.
   * Agora o botão é uma ficha: o que ela faz em cima, quanto já deu hoje
   * no meio, o detalhe embaixo.
   */
  const dados = !admin
    ? Object.fromEntries(
        Object.entries(CONTAGEM_DO_BALCAO).map(([id, [um, varios]]) => [
          id,
          meus && { valor: String(meus[id]), detalhe: meus[id] === 1 ? um : varios },
        ])
      )
    : {
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

      {/* O mesmo cabeçalho do Caixa: título grande, e aqui a data embaixo.
          O título da página para o leitor de tela é o `h1` da casca; este
          fica escondido dele para não ser lido duas vezes. */}
      <header className="cabeca">
        <p className="cabeca__titulo" aria-hidden="true">
          {saudacao()}, <span className="cabeca__nome">{usuario?.nome?.split(' ')[0]}</span>
        </p>
        <p className="cabeca__sub">{DIA_LONGO.format(new Date())}</p>
      </header>

      {/*
        Uma grade de 6 colunas, sem `div` de linha no meio. O tamanho do
        cartão é quantas colunas ele ocupa — 6, 3 ou 2 — e quem decide isso
        é o CSS, pelo nome do tamanho. Antes cada fileira era um `div` que
        montava a sua própria grade, com a sua própria contagem de colunas.
      */}
      <div className={admin ? 'acoes' : 'acoes acoes--balcao'}>
        <Cartao
          acao={PRINCIPAL}
          tamanho="grande"
          dado={dados.venda}
          onClick={() => setAberto(PRINCIPAL.id)}
        />

        {MEDIAS.map((a) => (
          <Cartao key={a.id} acao={a} dado={dados[a.id]} onClick={() => setAberto(a.id)} />
        ))}

        {admin &&
          PEQUENAS.map((a) => (
            <Cartao
              key={a.id}
              acao={a}
              tamanho="pequeno"
              onClick={() => (a.rota ? navegar(a.rota) : setAberto(a.id))}
            />
          ))}
      </div>

      {/*
        O mini-histórico, no desenho da lista do Caixa: cada linha é o
        recibo do último lançamento daquele tipo, e a lista inteira fica a
        um clique, no "Ver no Caixa". Sem dado ainda, a linha diz o que
        falta — um espaço em branco faria a tela parecer quebrada no
        primeiro dia de uso.
      */}
      {largo && admin && (
        <section className="recentes" aria-labelledby="recentes-titulo">
          <div className="recentes__cabeca">
            <h2 className="recentes__titulo" id="recentes-titulo">
              Últimos lançamentos
            </h2>
            <Link to="/caixa" className="recentes__ver">
              Ver no Caixa
            </Link>
          </div>
          <div className="recentes__lista">
            {HISTORICO.map(({ chave, ...tipo }) => (
              <Registro key={chave} {...tipo} dado={ultimos?.[chave]} />
            ))}
          </div>
        </section>
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
      <span className="cartao-acao__selo icone-aro">
        <Icone tamanho={tamanho === 'grande' ? 24 : 22} />
      </span>
      <span className="cartao-acao__rotulo">{rotulo}</span>
      {dado && (
        <>
          {/* `key` no valor: quando ela lança e o número muda, o elemento
              é outro e a animação de entrada roda de novo — o cartão
              "responde" ao lançamento. */}
          <span key={dado.valor} className="cartao-acao__valor">
            {dado.valor}
          </span>
          <span className="cartao-acao__rodape">{dado.detalhe}</span>
        </>
      )}
    </button>
  );
}

/**
 * Um cartão do mini-histórico.
 *
 * O horário é relativo ("há 5 min", "ontem") e não absoluto. A pergunta
 * que ela faz olhando para cá é "isto é o que eu acabei de lançar?", e
 * "há 2 min" responde direto; "14:32" obriga a comparar com o relógio.
 * Passado um dia a informação vira outra — aí a data absoluta é que
 * serve, e é o que a função devolve.
 */
function Registro({ rotulo, Icone, sinal, dado }) {
  return (
    <div className={dado ? 'recente' : 'recente recente--vazio'}>
      <span className="icone-aro">
        <Icone tamanho={22} />
      </span>
      <span className="recente__textos">
        <span className="recente__titulo">{dado ? dado.descricao : rotulo}</span>
        <span className="recente__detalhe">
          {dado ? `${rotulo} · ${quando(dado.data)}` : 'Nada registrado ainda'}
        </span>
      </span>
      {dado && (
        <span className={sinal > 0 ? 'recente__valor recente__valor--entrada' : 'recente__valor'}>
          {`${sinal > 0 ? '+' : '\u2212'}\u00a0${moeda(dado.valor)}`}
        </span>
      )}
    </div>
  );
}

const DIA_CURTO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/** "agora", "há 12 min", "há 3 h", "ontem", "14/09". */
function quando(valor) {
  const quandoFoi = new Date(valor);
  const minutos = Math.floor((Date.now() - quandoFoi.getTime()) / 60000);

  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;

  // Vira "ontem" pela VIRADA DO DIA, não por 24h: um lançamento das 23h
  // visto às 8h da manhã é de ontem, ainda que tenham passado 9 horas.
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dia = new Date(quandoFoi);
  dia.setHours(0, 0, 0, 0);
  const diasAtras = Math.round((hoje - dia) / 86400000);

  if (diasAtras === 0) return `há ${Math.floor(minutos / 60)} h`;
  if (diasAtras === 1) return 'ontem';
  return DIA_CURTO.format(quandoFoi);
}

/** Data no formato do input, montada com componentes locais (fuso). */
function paraDia(valor) {
  const d = new Date(valor);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}
