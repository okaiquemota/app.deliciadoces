import { prisma } from '../src/lib/prisma.js';
import { estoqueService } from '../src/services/estoqueService.js';

/**
 * Dados de DEMONSTRAÇÃO — para apresentar o sistema com as telas cheias.
 *
 * NÃO são dados da cliente. São plausíveis para uma confeitaria, criados
 * para que dashboard, caixa e estoque mostrem números reais numa demo.
 *
 * Passa pelos MESMOS serviços que a interface usa, então os saldos ficam
 * coerentes com o razão — não é dado injetado por fora.
 *
 *   Criar:   npm run db:seed:demo
 *   Limpar:  npm run db:seed:demo -- --limpar
 */

const LIMPAR = process.argv.includes('--limpar');

const INSUMOS = [
  { nome: 'Leite condensado', unidade: 'LATA', estoqueMinimo: 12, custo: 7.5, compra: 60 },
  { nome: 'Chocolate granulado', unidade: 'KG', estoqueMinimo: 2, custo: 28.0, compra: 10 },
  { nome: 'Manteiga', unidade: 'KG', estoqueMinimo: 1, custo: 42.0, compra: 3, validade: 25 },
  { nome: 'Açúcar refinado', unidade: 'KG', estoqueMinimo: 5, custo: 4.2, compra: 30 },
  { nome: 'Forminha nº 4', unidade: 'PACOTE', estoqueMinimo: 10, custo: 3.9, compra: 30 },
  { nome: 'Creme de leite', unidade: 'LATA', estoqueMinimo: 10, custo: 4.8, compra: 8 },
];

const PRODUTOS = [
  { nome: 'Brigadeiro', preco: 2.5, minimo: 50, rende: 40 },
  { nome: 'Beijinho', preco: 2.5, minimo: 50, rende: 40 },
  { nome: 'Bolo de pote', preco: 14.0, minimo: 6, rende: 10 },
  { nome: 'Trufa de maracujá', preco: 5.0, minimo: 20, rende: 25 },
];

/** Data N dias atrás, numa hora comercial plausível. */
function diasAtras(n, hora = 14) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hora, Math.floor(Math.random() * 59), 0, 0);
  return d;
}

const sorteia = (lista) => lista[Math.floor(Math.random() * lista.length)];

async function limpar() {
  // Ordem importa: filhos antes dos pais
  await prisma.movimentacaoEstoque.deleteMany({});
  await prisma.itemVenda.deleteMany({});
  await prisma.venda.deleteMany({});
  await prisma.producao.deleteMany({});
  await prisma.despesa.deleteMany({});
  await prisma.fichaTecnicaItem.deleteMany({});
  await prisma.produto.deleteMany({});
  await prisma.insumo.deleteMany({});
  console.log('[demo] Dados de demonstração removidos.');
  console.log('[demo] Usuária e categorias de despesa foram preservadas.');
}

async function main() {
  if (LIMPAR) return limpar();

  const dalila = await prisma.usuario.findFirst({ where: { papel: 'ADMIN' } });
  const categorias = await prisma.categoriaDespesa.findMany();
  const cat = (nome) => categorias.find((c) => c.nome === nome)?.id;

  if (!categorias.length) {
    throw new Error('Rode `npm run db:seed` antes: as categorias não existem.');
  }

  // ---------------------------------------------------------- insumos
  const insumos = {};
  for (const item of INSUMOS) {
    const insumo = await prisma.insumo.upsert({
      where: { nome: item.nome },
      update: {},
      create: {
        nome: item.nome,
        unidade: item.unidade,
        estoqueMinimo: item.estoqueMinimo,
        controlaValidade: Boolean(item.validade),
      },
    });
    insumos[item.nome] = insumo;

    // A compra passa pelo serviço, então o custo médio sai calculado
    await prisma.$transaction(async (tx) => {
      await estoqueService.movimentar(tx, {
        tipo: 'ENTRADA_COMPRA',
        insumoId: insumo.id,
        quantidade: item.compra,
        custoUnitario: item.custo,
        validade: item.validade ? diasAtras(-item.validade) : null,
        usuarioId: dalila?.id,
        data: diasAtras(6, 9),
      });
      await tx.insumo.update({
        where: { id: insumo.id },
        data: { custoUnitario: item.custo },
      });
    });
  }
  console.log(`[demo] ${INSUMOS.length} ingredientes com compra registrada.`);

  // --------------------------------------------------------- produtos
  const produtos = {};
  for (const item of PRODUTOS) {
    produtos[item.nome] = await prisma.produto.upsert({
      where: { nome: item.nome },
      update: {},
      create: {
        nome: item.nome,
        precoVenda: item.preco,
        unidade: 'UNIDADE',
        estoqueMinimo: item.minimo,
        rendimentoReceita: item.rende,
      },
    });
  }

  // Ficha técnica só para o brigadeiro: os outros ficam sem, de propósito,
  // porque o sistema precisa funcionar sem receita cadastrada.
  await prisma.fichaTecnicaItem.deleteMany({ where: { produtoId: produtos.Brigadeiro.id } });
  await prisma.fichaTecnicaItem.createMany({
    data: [
      {
        produtoId: produtos.Brigadeiro.id,
        insumoId: insumos['Leite condensado'].id,
        quantidade: 1,
      },
      {
        produtoId: produtos.Brigadeiro.id,
        insumoId: insumos['Chocolate granulado'].id,
        quantidade: 0.15,
      },
      { produtoId: produtos.Brigadeiro.id, insumoId: insumos['Manteiga'].id, quantidade: 0.02 },
    ],
  });
  console.log(`[demo] ${PRODUTOS.length} doces (brigadeiro com ficha técnica).`);

  // --------------------------------------------------------- produção
  const lotes = [
    { produto: 'Brigadeiro', qtd: 400, dia: 6 },
    {
      produto: 'Beijinho',
      qtd: 320,
      dia: 5,
      insumos: [
        { nome: 'Leite condensado', q: 8 },
        { nome: 'Açúcar refinado', q: 2 },
      ],
    },
    {
      produto: 'Bolo de pote',
      qtd: 60,
      dia: 4,
      insumos: [
        { nome: 'Creme de leite', q: 3 },
        { nome: 'Açúcar refinado', q: 1.2 },
      ],
    },
    {
      produto: 'Trufa de maracujá',
      qtd: 180,
      dia: 3,
      insumos: [{ nome: 'Chocolate granulado', q: 2.4 }],
    },
    { produto: 'Brigadeiro', qtd: 350, dia: 2 },
    {
      produto: 'Beijinho',
      qtd: 200,
      dia: 1,
      insumos: [
        { nome: 'Leite condensado', q: 5 },
        { nome: 'Açúcar refinado', q: 1.2 },
      ],
    },
  ];

  const { producaoService } = await import('../src/services/producaoService.js');
  for (const lote of lotes) {
    await producaoService.registrar(
      {
        produtoId: produtos[lote.produto].id,
        quantidade: lote.qtd,
        data: diasAtras(lote.dia, 8),
        insumos: lote.insumos?.map((i) => ({ insumoId: insumos[i.nome].id, quantidade: i.q })),
      },
      dalila?.id
    );
  }
  console.log(`[demo] ${lotes.length} lotes produzidos.`);

  // ----------------------------------------------------------- vendas
  const { vendaService } = await import('../src/services/caixaService.js');
  const formas = ['DINHEIRO', 'PIX', 'PIX', 'CARTAO_DEBITO', 'DINHEIRO', 'CARTAO_CREDITO'];
  const nomes = [null, null, 'Encomenda Sr. Antônio', null, 'Festa da Márcia', null];
  let totalVendas = 0;

  /**
   * A quantidade vendida respeita o que existe em estoque.
   *
   * O sistema PERMITE vender mais do que tem (decisão a confirmar com a
   * cliente — ela pode preferir ser avisada em vez de bloqueada). Mas numa
   * demonstração o saldo negativo parece defeito, então aqui limitamos ao
   * disponível, que é como o negócio funciona de verdade: ela não entrega
   * um doce que não fez.
   */
  async function disponivel(nome) {
    const p = await prisma.produto.findUnique({ where: { id: produtos[nome].id } });
    return Number(p.quantidadeAtual);
  }

  for (let dia = 6; dia >= 0; dia -= 1) {
    const quantas = dia === 0 ? 2 : 1 + Math.floor(Math.random() * 3);

    for (let n = 0; n < quantas; n += 1) {
      const escolhidos = [sorteia(PRODUTOS), sorteia(PRODUTOS)].filter(
        (p, i, arr) => arr.findIndex((x) => x.nome === p.nome) === i
      );

      const itens = [];
      for (const p of escolhidos) {
        const saldo = await disponivel(p.nome);
        if (saldo < 1) continue;

        // Vende no máximo um terço do que tem, para sobrar estoque na tela
        const teto = Math.max(1, Math.floor(saldo / 2));
        const desejado =
          p.preco > 10 ? 2 + Math.floor(Math.random() * 5) : 25 + Math.floor(Math.random() * 60);
        itens.push({ produtoId: produtos[p.nome].id, quantidade: Math.min(desejado, teto) });
      }

      if (!itens.length) continue;

      const venda = await vendaService.criar(
        {
          itens,
          formaPagamento: sorteia(formas),
          clienteNome: sorteia(nomes),
          data: diasAtras(dia, 10 + Math.floor(Math.random() * 8)),
        },
        dalila?.id
      );
      totalVendas += Number(venda.total);
    }
  }
  console.log(`[demo] Vendas da semana: R$ ${totalVendas.toFixed(2)}`);

  // --------------------------------------------------------- despesas
  const despesas = [
    { descricao: 'Compra no atacado', valor: 612.8, categoria: 'Ingredientes', dia: 6 },
    { descricao: 'Forminhas e embalagens', valor: 117.0, categoria: 'Embalagem', dia: 5 },
    {
      descricao: 'Conta de luz',
      valor: 214.3,
      categoria: 'Contas (gás/luz/água)',
      dia: 4,
      recorrente: true,
    },
    { descricao: 'Gás de cozinha', valor: 130.0, categoria: 'Contas (gás/luz/água)', dia: 3 },
    { descricao: 'Entrega de encomenda', valor: 45.0, categoria: 'Transporte e entrega', dia: 2 },
    { descricao: 'Diária da ajudante', valor: 120.0, categoria: 'Ajudante', dia: 2 },
    { descricao: 'Internet', valor: 99.9, categoria: 'Internet', dia: 1, recorrente: true },
    { descricao: 'Mercado de casa', valor: 320.0, categoria: 'Retirada pessoal', dia: 3 },
  ];

  for (const d of despesas) {
    await prisma.despesa.create({
      data: {
        descricao: d.descricao,
        valor: d.valor,
        categoriaId: cat(d.categoria),
        recorrente: Boolean(d.recorrente),
        usuarioId: dalila?.id,
        data: diasAtras(d.dia, 11),
      },
    });
  }
  console.log(`[demo] ${despesas.length} despesas lançadas.`);

  // Uma perda, porque ela mencionou que joga coisa fora às vezes
  await prisma.$transaction(async (tx) => {
    await estoqueService.movimentar(tx, {
      tipo: 'PERDA',
      insumoId: insumos['Creme de leite'].id,
      quantidade: 2,
      motivo: 'Lata estufada, descartei',
      usuarioId: dalila?.id,
      data: diasAtras(2, 16),
    });
  });

  console.log('\n[demo] Pronto. Dashboard, caixa e estoque com dados da última semana.');
  console.log('[demo] Para limpar: npm run db:seed:demo -- --limpar\n');
}

main()
  .catch((erro) => {
    console.error('[demo] Falhou:', erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
