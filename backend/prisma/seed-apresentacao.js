import { prisma } from '../src/lib/prisma.js';
import { estoqueService } from '../src/services/estoqueService.js';
import { movimentacaoService } from '../src/services/cadastroService.js';
import { vendaService, despesaService } from '../src/services/caixaService.js';
import { producaoService } from '../src/services/producaoService.js';
import { fechamentoService } from '../src/services/fechamentoService.js';

/**
 * Dados da APRESENTAÇÃO (02/12/2026).
 *
 * Um cardápio plausível de confeitaria de Ribeirão Preto e três semanas de
 * movimento, de 10/11 até o dia da apresentação: compras, lotes, vendas,
 * saídas, retiradas, perdas e fechamento de cada dia. NÃO são números da
 * Dalila — são verossímeis para as telas mostrarem o sistema funcionando.
 *
 * Passa pelos MESMOS serviços que a interface usa (saldo e razão batem, o
 * custo médio sai das compras, a venda não passa do estoque).
 *
 * Preparado para o dia 02/12:
 *   - o dia 02/12 tem vendas da manhã e fica SEM fechamento, para fechar
 *     ao vivo;
 *   - morango comprado em 28/11 vence em 01/12: aparece vencido, para
 *     mostrar o "Jogar fora o vencido" (é a compra mais nova, o caso que
 *     antes não saía da lista);
 *   - leite condensado com uma compra vencendo em 05/12 (aviso âmbar);
 *   - coco ralado e morango do amor abaixo do mínimo ("acabando").
 *
 *   Rodar:  APRESENTACAO_USUARIO=<id> node prisma/seed-apresentacao.js
 *   (sem a variável, usa a primeira conta de administração)
 *
 * Recusa rodar em banco que já tenha movimento: é para banco limpo.
 */

// Gerador com semente: rodar de novo dá o mesmo resultado.
let semente = 20261202;
const aleatorio = () => {
  semente = (semente * 1103515245 + 12345) % 2147483648;
  return semente / 2147483648;
};
const entre = (a, b) => a + Math.floor(aleatorio() * (b - a + 1));
const sorteia = (lista) => lista[Math.floor(aleatorio() * lista.length)];

/** Um instante no dia de Brasília: quando('2026-11-10', 14, 30). */
const quando = (dia, hora, minuto = entre(0, 59)) =>
  new Date(`${dia}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-03:00`);

const DIAS = [];
for (let d = new Date('2026-11-10T12:00:00-03:00'); d <= new Date('2026-12-02T12:00:00-03:00');) {
  DIAS.push(d.toISOString().slice(0, 10));
  d = new Date(d.getTime() + 24 * 3600 * 1000);
}
const diaDaSemana = (dia) => new Date(`${dia}T12:00:00-03:00`).getDay(); // 0 = domingo
const APRESENTACAO = '2026-12-02';

// ------------------------------------------------------------ cadastro
const INSUMOS = [
  // nome, unidade, mínimo, validade?, fornecedor
  ['Leite condensado', 'LATA', 12, true, 'Atacadão'],
  ['Creme de leite', 'LATA', 8, true, 'Atacadão'],
  ['Chocolate em pó 50%', 'KG', 1, true, 'Casa do Confeiteiro'],
  ['Chocolate ao leite (barra)', 'KG', 2, true, 'Casa do Confeiteiro'],
  ['Leite em pó', 'KG', 1, true, 'Atacadão'],
  ['Coco ralado', 'KG', 1.5, true, 'Casa do Confeiteiro'],
  ['Manteiga', 'KG', 1, true, 'Atacadão'],
  ['Chocolate granulado', 'KG', 1, false, 'Casa do Confeiteiro'],
  ['Morango', 'KG', 2, true, 'Ceasa'],
  ['Uva verde', 'KG', 1, true, 'Ceasa'],
  ['Açúcar refinado', 'KG', 5, false, 'Atacadão'],
  ['Farinha de trigo', 'KG', 2, true, 'Atacadão'],
  ['Ovos', 'UNIDADE', 24, true, 'Granja Santa Cruz'],
  ['Forminha nº 4 (pct 100)', 'PACOTE', 3, false, 'Casa do Confeiteiro'],
  ['Copo com tampa 300 ml', 'UNIDADE', 30, false, 'Casa do Confeiteiro'],
  ['Pote com tampa 250 ml', 'UNIDADE', 30, false, 'Casa do Confeiteiro'],
];

// preço por unidade de compra (R$) e quanto se compra numa ida
const COMPRA = {
  'Leite condensado': { preco: 6.49, qtd: 36, validade: 120 },
  'Creme de leite': { preco: 3.79, qtd: 24, validade: 90 },
  'Chocolate em pó 50%': { preco: 38.0, qtd: 2, validade: 180 },
  'Chocolate ao leite (barra)': { preco: 45.9, qtd: 3, validade: 150 },
  'Leite em pó': { preco: 52.0, qtd: 2, validade: 150 },
  'Coco ralado': { preco: 36.0, qtd: 1.5, validade: 60 },
  Manteiga: { preco: 48.0, qtd: 2, validade: 45 },
  'Chocolate granulado': { preco: 24.0, qtd: 2, validade: null },
  Morango: { preco: 18.0, qtd: 4, validade: 4 },
  'Uva verde': { preco: 14.0, qtd: 3, validade: 6 },
  'Açúcar refinado': { preco: 4.59, qtd: 10, validade: null },
  'Farinha de trigo': { preco: 5.2, qtd: 5, validade: 120 },
  Ovos: { preco: 0.8, qtd: 60, validade: 21 },
  'Forminha nº 4 (pct 100)': { preco: 6.9, qtd: 6, validade: null },
  'Copo com tampa 300 ml': { preco: 1.1, qtd: 100, validade: null },
  'Pote com tampa 250 ml': { preco: 0.95, qtd: 100, validade: null },
};

// doce: preço, mínimo, rendimento do lote, receita (por lote)
const DOCES = {
  'Brigadeiro tradicional': {
    preco: 3.0,
    minimo: 30,
    rende: 30,
    receita: {
      'Leite condensado': 1,
      'Chocolate em pó 50%': 0.05,
      Manteiga: 0.02,
      'Chocolate granulado': 0.1,
      'Forminha nº 4 (pct 100)': 0.3,
    },
  },
  'Brigadeiro de leite Ninho': {
    preco: 3.5,
    minimo: 30,
    rende: 30,
    receita: {
      'Leite condensado': 1,
      'Leite em pó': 0.06,
      Manteiga: 0.02,
      'Forminha nº 4 (pct 100)': 0.3,
    },
  },
  Beijinho: {
    preco: 3.0,
    minimo: 30,
    rende: 30,
    receita: {
      'Leite condensado': 1,
      'Coco ralado': 0.08,
      Manteiga: 0.02,
      'Forminha nº 4 (pct 100)': 0.3,
    },
  },
  'Morango do amor': {
    preco: 12.0,
    minimo: 8,
    rende: 12,
    receita: {
      Morango: 0.6,
      'Leite condensado': 1,
      'Açúcar refinado': 0.5,
    },
  },
  'Copo da felicidade': {
    preco: 22.0,
    minimo: 4,
    rende: 6,
    receita: {
      'Leite condensado': 2,
      'Creme de leite': 2,
      Morango: 0.4,
      'Chocolate ao leite (barra)': 0.2,
      'Copo com tampa 300 ml': 6,
    },
  },
  'Uva com chocolate (copo)': {
    preco: 15.0,
    minimo: 4,
    rende: 6,
    receita: {
      'Uva verde': 0.6,
      'Chocolate ao leite (barra)': 0.3,
      'Creme de leite': 1,
      'Copo com tampa 300 ml': 6,
    },
  },
  'Bolo de pote': {
    preco: 14.0,
    minimo: 6,
    rende: 10,
    receita: {
      'Farinha de trigo': 0.3,
      Ovos: 4,
      'Açúcar refinado': 0.25,
      'Leite condensado': 2,
      'Creme de leite': 2,
      'Chocolate em pó 50%': 0.08,
      'Pote com tampa 250 ml': 10,
    },
  },
  Brownie: {
    preco: 8.0,
    minimo: 10,
    rende: 16,
    receita: {
      'Chocolate ao leite (barra)': 0.3,
      Manteiga: 0.2,
      Ovos: 4,
      'Açúcar refinado': 0.3,
      'Farinha de trigo': 0.15,
    },
  },
};

const CLIENTES = [
  null,
  null,
  null,
  null,
  'Encomenda da Márcia',
  'Pedido do Sr. Antônio',
  'Festa da Júlia',
  null,
  'Igreja (bazar)',
  null,
];
const FORMAS = ['PIX', 'PIX', 'PIX', 'PIX', 'PIX', 'DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO'];

async function main() {
  const emUso = await prisma.movimentacaoEstoque.count();
  if (emUso > 0 && !process.argv.includes('--mesmo-assim')) {
    throw new Error('O banco já tem movimento. Este seed é para banco limpo.');
  }

  const usuario = process.env.APRESENTACAO_USUARIO
    ? await prisma.usuario.findUnique({ where: { id: process.env.APRESENTACAO_USUARIO } })
    : await prisma.usuario.findFirst({ where: { papel: 'ADMIN' }, orderBy: { criadoEm: 'desc' } });
  if (!usuario) throw new Error('Nenhuma conta de administração encontrada.');
  const quem = usuario.id;
  console.log(`[apresentação] Lançando como ${usuario.nome}.`);

  // ---------------------------------------------------------- cadastro
  const insumo = {};
  for (const [nome, unidade, estoqueMinimo, controlaValidade, fornecedorPadrao] of INSUMOS) {
    insumo[nome] = await prisma.insumo.create({
      data: { nome, unidade, estoqueMinimo, controlaValidade, fornecedorPadrao },
    });
  }
  const doce = {};
  for (const [nome, d] of Object.entries(DOCES)) {
    doce[nome] = await prisma.produto.create({
      data: {
        nome,
        precoVenda: d.preco,
        unidade: 'UNIDADE',
        estoqueMinimo: d.minimo,
        rendimentoReceita: d.rende,
        fichaTecnica: {
          create: Object.entries(d.receita).map(([i, q]) => ({
            insumoId: insumo[i].id,
            quantidade: q,
          })),
        },
      },
    });
  }
  console.log(
    `[apresentação] ${INSUMOS.length} ingredientes e ${Object.keys(DOCES).length} doces.`
  );

  const saldo = async (nome) =>
    Number((await prisma.insumo.findUnique({ where: { id: insumo[nome].id } })).quantidadeAtual);
  const pronto = async (nome) =>
    Number((await prisma.produto.findUnique({ where: { id: doce[nome].id } })).quantidadeAtual);

  /** Compra com validade relativa ao dia, ou fixa quando `vence` vem. */
  async function comprar(dia, nome, { qtd, vence, hora = 9 } = {}) {
    const c = COMPRA[nome];
    const q = qtd ?? c.qtd;
    let validade = null;
    if (vence) validade = new Date(`${vence}T00:00:00Z`);
    else if (c.validade && insumo[nome].controlaValidade) {
      const v = new Date(`${dia}T00:00:00Z`);
      v.setUTCDate(v.getUTCDate() + c.validade);
      validade = v;
    }
    await movimentacaoService.registrar(
      {
        tipo: 'ENTRADA_COMPRA',
        insumoId: insumo[nome].id,
        quantidade: q,
        custoUnitario: c.preco,
        validade,
        data: quando(dia, hora),
      },
      quem
    );
    return q * c.preco;
  }

  /** Compra tudo o que estiver perto de acabar para os próximos dias. */
  async function reabastecer(dia) {
    let gasto = 0;
    for (const [nome] of INSUMOS) {
      // Coco fica de fora a partir do dia 24: chega na apresentação acabando.
      if (nome === 'Coco ralado' && dia >= '2026-11-24') continue;
      if (nome === 'Morango' || nome === 'Uva verde') continue; // fruta é comprada à parte
      const min = Number(insumo[nome].estoqueMinimo);
      if ((await saldo(nome)) < min * 2.2) gasto += await comprar(dia, nome);
    }
    return gasto;
  }

  async function produzir(dia, nome, lotes = 1, hora = 8) {
    const d = DOCES[nome];
    await producaoService.registrar(
      { produtoId: doce[nome].id, quantidade: d.rende * lotes, data: quando(dia, hora) },
      quem
    );
  }

  const despesa = (dia, descricao, valor, extra = {}) =>
    despesaService.criar(
      {
        descricao,
        valor,
        formaPagamento: extra.forma ?? 'PIX',
        retirada: Boolean(extra.retirada),
        recorrente: Boolean(extra.recorrente),
        fornecedor: extra.fornecedor ?? null,
        data: quando(dia, extra.hora ?? 16),
      },
      quem
    );

  let vendido = 0;
  let nVendas = 0;

  for (const dia of DIAS) {
    const semana = diaDaSemana(dia);
    const ehApresentacao = dia === APRESENTACAO;
    const domingo = semana === 0;
    const segunda = semana === 1;

    // ---------------------------------------------- compras e fruta
    if (dia === DIAS[0]) {
      for (const [nome] of INSUMOS) await comprar(dia, nome, { hora: 8 });
      await despesa(dia, 'Compra do mês no Atacadão', 486.9, {
        forma: 'CARTAO_DEBITO',
        fornecedor: 'Atacadão',
        hora: 10,
      });
    } else if (segunda || semana === 4) {
      const gasto = await reabastecer(dia);
      if (gasto > 0) {
        await despesa(dia, 'Compra de ingredientes', Math.round(gasto * 100) / 100, {
          forma: 'CARTAO_DEBITO',
          fornecedor: 'Atacadão',
          hora: 10,
        });
      }
    }
    // Fruta: terça e sexta na Ceasa, e o morango do dia 28 (vence 01/12)
    if (semana === 2 || semana === 5 || dia === DIAS[0]) {
      const vence = dia === '2026-11-28' ? '2026-12-01' : null;
      // Compra o que falta para ter ~3 kg de morango e ~1,5 kg de uva.
      let gasto = 0;
      if (dia !== DIAS[0]) {
        for (const [fruta, alvo] of [
          ['Morango', 3],
          ['Uva verde', 1.5],
        ]) {
          let falta = Math.round((alvo - (await saldo(fruta))) * 2) / 2;
          if (fruta === 'Morango' && vence) falta = Math.max(falta, 2);
          if (falta <= 0) continue;
          gasto += await comprar(dia, fruta, {
            qtd: falta,
            vence: fruta === 'Morango' ? vence : null,
            hora: 7,
          });
        }
      }
      if (gasto > 0 || dia === DIAS[0]) {
        await despesa(dia, 'Fruta na Ceasa', Math.round((gasto || 93) * 100) / 100, {
          forma: dia >= '2026-11-18' ? 'DINHEIRO' : 'PIX',
          fornecedor: 'Ceasa',
          hora: 8,
        });
      }
    }
    if (dia === '2026-11-28') {
      // a compra que vence em 01/12 já foi lançada acima, junto da fruta
    }
    if (dia === '2026-12-01') {
      // Leite condensado de promoção, com validade curta: vence 05/12
      await comprar(dia, 'Leite condensado', { qtd: 12, vence: '2026-12-05', hora: 9 });
      await despesa(dia, 'Leite condensado em promoção', 70.8, {
        forma: 'PIX',
        fornecedor: 'Savegnago',
        hora: 9,
      });
    }

    // ---------------------------------------------- produção
    if (!segunda && !domingo) {
      const plano = [];
      for (const nome of Object.keys(DOCES)) {
        const min = DOCES[nome].minimo;
        const tem = await pronto(nome);
        // Morango do amor para de ser feito no fim: chega acabando no dia 02.
        if (nome === 'Morango do amor' && dia >= '2026-11-27') continue;
        if (tem < min * 2) plano.push(nome);
      }
      for (const nome of plano) {
        const lotes = DOCES[nome].rende >= 30 ? entre(1, 2) : 1;
        await produzir(dia, nome, lotes, ehApresentacao ? 7 : 8);
      }
    }

    // ---------------------------------------------- vendas
    if (!segunda) {
      const fimDeSemana = semana === 5 || semana === 6;
      const quantas = ehApresentacao
        ? 3
        : domingo
          ? entre(2, 4)
          : fimDeSemana
            ? entre(7, 11)
            : entre(4, 7);
      for (let n = 0; n < quantas; n++) {
        const hora = ehApresentacao ? 9 + n : entre(10, 19);
        const itens = [];
        const escolha = [...new Set([sorteia(Object.keys(DOCES)), sorteia(Object.keys(DOCES))])];
        for (const nome of escolha) {
          const tem = await pronto(nome);
          if (tem < 1) continue;
          const caro = DOCES[nome].preco >= 10;
          const quer = caro ? entre(1, 3) : sorteia([4, 6, 10, 12, 20, 25]);
          const q = Math.min(quer, Math.floor(tem * 0.6) || 1);
          itens.push({ produtoId: doce[nome].id, quantidade: q });
        }
        if (!itens.length) continue;
        const v = await vendaService.criar(
          {
            itens,
            formaPagamento: sorteia(FORMAS),
            clienteNome: sorteia(CLIENTES),
            data: quando(dia, hora),
          },
          quem
        );
        vendido += Number(v.total);
        nVendas++;
      }
      // Entrada avulsa de vez em quando: a correria do balcão
      if (!ehApresentacao && aleatorio() < 0.35) {
        await vendaService.criar(
          {
            valor: sorteia([9, 12, 15, 18, 30]),
            formaPagamento: 'DINHEIRO',
            data: quando(dia, entre(11, 18)),
          },
          quem
        );
        nVendas++;
      }
    }

    // Encomenda grande de morango do amor: chega na apresentação acabando.
    if (dia === '2026-12-01') {
      const tem = await pronto('Morango do amor');
      if (tem > 5) {
        const v = await vendaService.criar(
          {
            itens: [{ produtoId: doce['Morango do amor'].id, quantidade: tem - 5 }],
            formaPagamento: 'PIX',
            clienteNome: 'Encomenda da Márcia (aniversário)',
            data: quando(dia, 17, 40),
          },
          quem
        );
        vendido += Number(v.total);
        nVendas++;
      }
    }
    // Morango fresco na manhã da apresentação (o vencido continua lá)
    if (ehApresentacao) {
      await comprar(dia, 'Morango', { qtd: 2, hora: 7 });
      await despesa(dia, 'Morango na Ceasa', 36, { forma: 'PIX', fornecedor: 'Ceasa', hora: 7 });
    }

    // ---------------------------------------------- saídas e retiradas
    if (dia === '2026-11-10')
      await despesa(dia, 'Conta de luz', 238.47, { recorrente: true, fornecedor: 'CPFL' });
    if (dia === '2026-11-12') await despesa(dia, 'Internet', 99.9, { recorrente: true });
    if (dia === '2026-11-14') await despesa(dia, 'Gás de cozinha (P13)', 125);
    if (dia === '2026-11-28')
      await despesa(dia, 'Gás de cozinha (P13)', 125, { forma: 'DINHEIRO' });
    if (dia === '2026-11-20')
      await despesa(dia, 'Fitas e etiquetas', 42.5, { fornecedor: 'Casa do Confeiteiro' });
    if (semana === 6 && !ehApresentacao) {
      await despesa(dia, 'Diária da ajudante', 120, {
        forma: dia >= '2026-11-18' ? 'DINHEIRO' : 'PIX',
        hora: 18,
      });
    }
    if (semana === 5 && aleatorio() < 0.6)
      await despesa(dia, 'Entrega de encomenda (Uber)', entre(14, 28), { hora: 17 });
    if (dia === '2026-11-17')
      await despesa(dia, 'Mercado de casa', 212.4, { retirada: true, hora: 12 });
    if (dia === '2026-12-01')
      await despesa(dia, 'Mercado de casa', 150, { retirada: true, forma: 'DINHEIRO', hora: 19 });
    if (dia === '2026-11-24')
      await despesa(dia, 'Farmácia', 64.9, { retirada: true, forma: 'PIX', hora: 13 });

    // ---------------------------------------------- perdas
    if (dia === '2026-11-19') {
      await movimentacaoService.registrar(
        {
          tipo: 'PERDA',
          insumoId: insumo['Creme de leite'].id,
          quantidade: 2,
          motivo: 'Lata estufada',
          data: quando(dia, 15),
        },
        quem
      );
    }
    if (dia === '2026-11-27') {
      // Coco que pegou umidade: chega na apresentação acabando.
      const tem = await saldo('Coco ralado');
      if (tem > 1.2) {
        await movimentacaoService.registrar(
          {
            tipo: 'PERDA',
            insumoId: insumo['Coco ralado'].id,
            quantidade: Math.round((tem - 1.2) * 1000) / 1000,
            motivo: 'Pegou umidade, joguei fora',
            data: quando(dia, 15),
          },
          quem
        );
      }
    }
    if (dia === '2026-11-25') {
      await movimentacaoService.registrar(
        {
          tipo: 'PERDA',
          produtoId: doce['Brownie'].id,
          quantidade: 3,
          motivo: 'Queimou a borda da forma',
          data: quando(dia, 16),
        },
        quem
      );
    }

    // ---------------------------------------------- fechamento
    if (!ehApresentacao) {
      const previa = await fechamentoService.previa(quando(dia, 12));
      // Quase sempre bate; de vez em quando falta ou sobra um trocado.
      const r = aleatorio();
      const dif = r < 0.12 ? -sorteia([2, 5, 0.5]) : r < 0.18 ? sorteia([1, 0.25]) : 0;
      await fechamentoService.fechar(
        {
          data: dia,
          saldoConferido: Math.max(0, Math.round((previa.saldoCalculado + dif) * 100) / 100),
          observacao: dif < 0 ? 'Faltou troco, conferir' : null,
        },
        quem
      );
      // Leva o dinheiro para o banco no sábado (fica o troco)
    }
  }

  // Confere: o cache de saldo bate com o razão em todos os itens.
  for (const i of Object.values(insumo)) {
    const antes = await saldo(i.nome);
    const depois = Number(
      (await estoqueService.recalcularSaldo({ insumoId: i.id })).quantidadeAtual
    );
    if (Math.abs(antes - depois) > 0.001) throw new Error(`Saldo divergente em ${i.nome}`);
  }

  console.log(`[apresentação] ${nVendas} vendas, R$ ${vendido.toFixed(2)} em doces.`);
  console.log(
    `[apresentação] ${DIAS.length} dias, de ${DIAS[0]} a ${APRESENTACAO} (sem fechar o ${APRESENTACAO}).`
  );
}

main()
  .catch((erro) => {
    console.error('[apresentação] Falhou:', erro.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
