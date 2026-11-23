import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import { movimentacaoService } from '../src/services/cadastroService.js';
import { producaoService } from '../src/services/producaoService.js';
import { vendaService, despesaService } from '../src/services/caixaService.js';
import { fechamentoService } from '../src/services/fechamentoService.js';

/**
 * Dados de DEMONSTRAÇÃO para os prints do banner (Feira de Tecnologia).
 *
 * Um mês fictício de uma confeitaria: ingredientes, doces com receita,
 * produção em lote, vendas com Pix/dinheiro/cartão, saídas e fechamentos
 * de caixa. NADA aqui é dado da cliente: nomes de cliente são claramente
 * de exemplo, e a usuária é a "Marina", que não existe.
 *
 * Tudo passa pelos MESMOS serviços que a interface usa (compra, produção,
 * venda, saída, fechamento): saldos, custo médio e razão saem coerentes.
 *
 * ⚠️ APAGA os dados de negócio do banco antes de criar os novos. Por isso
 * só roda contra PostgreSQL LOCAL — com a DATABASE_URL de produção (ou um
 * `.env` apontando para o Supabase), recusa antes de qualquer consulta.
 *
 *   DATABASE_URL="postgresql://postgres@localhost:5432/deliciadoces_banner" \
 *   DEMO_SENHA="uma-senha-qualquer" \
 *   npm run db:seed:banner
 *
 * Sem DEMO_SENHA, uma senha aleatória é gerada e mostrada no fim. A senha
 * nunca fica escrita no repositório.
 *
 * É determinístico (sorteio com semente fixa): rodar de novo dá os mesmos
 * números, relativos ao dia de hoje.
 */

// ------------------------------------------------------------ trava

const url = process.env.DATABASE_URL ?? '';
const LOCAL =
  /@(localhost|127\.0\.0\.1|host\.docker\.internal|postgres|db)[:/]/.test(url) ||
  url.startsWith('postgresql:///');
if (!LOCAL) {
  console.error(
    '\n[banner] Recusado: este seed APAGA os dados e só roda contra PostgreSQL local.\n' +
      `[banner] DATABASE_URL aponta para: ${url.replace(/:[^:@]*@/, ':***@') || '(vazio)'}\n`
  );
  process.exit(1);
}

// ------------------------------------------------------------ apoio

/** Sorteio com semente (mulberry32): mesmo resultado a cada execução. */
function criarSorteio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sorteio = criarSorteio(20261123);
const entre = (min, max) => min + Math.floor(sorteio() * (max - min + 1));
const um = (lista) => lista[Math.floor(sorteio() * lista.length)];
function pesado(pesos) {
  const total = Object.values(pesos).reduce((s, p) => s + p, 0);
  let r = sorteio() * total;
  for (const [chave, peso] of Object.entries(pesos)) {
    r -= peso;
    if (r <= 0) return chave;
  }
  return Object.keys(pesos)[0];
}

/**
 * Datas no horário de Brasília (UTC−3), seja qual for o fuso da máquina:
 * a venda das 15h aparece às 15h na tela, e "hoje" é o dia da cliente.
 */
const FUSO = 3;
const agoraBrasil = () => new Date(Date.now() - FUSO * 3_600_000);
function noBrasil(diasAtras, hora, minuto = 0) {
  const b = agoraBrasil();
  return new Date(
    Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() - diasAtras, hora + FUSO, minuto)
  );
}
const diaDaSemana = (diasAtras) => noBrasil(diasAtras, 12).getUTCDay(); // 0 = domingo
const arred = (n, casas = 3) => Number(n.toFixed(casas));

// ------------------------------------------------------------ catálogo

const DIAS = 30;

/**
 * Ingredientes. `sobra` é quanto fica no estoque hoje: as compras são
 * calculadas a partir do consumo das receitas para chegar nela.
 * Três ficam ABAIXO do mínimo e dois VENCEM em menos de 15 dias — é o que
 * faz a tela de Estoque mostrar os avisos.
 */
const INSUMOS = [
  { nome: 'Leite condensado', unidade: 'LATA', minimo: 12, custo: 7.49, sobra: 34 },
  { nome: 'Creme de leite', unidade: 'LATA', minimo: 8, custo: 4.79, sobra: 14, vence: 11 },
  { nome: 'Manteiga', unidade: 'KG', minimo: 1, custo: 41.9, sobra: 1.6, vence: 6 },
  { nome: 'Chocolate em pó', unidade: 'KG', minimo: 2, custo: 36.9, sobra: 1.2 },
  { nome: 'Chocolate granulado', unidade: 'KG', minimo: 1.5, custo: 27.5, sobra: 3.4 },
  { nome: 'Chocolate meio amargo', unidade: 'KG', minimo: 2, custo: 44.9, sobra: 3.1 },
  { nome: 'Coco ralado', unidade: 'KG', minimo: 1, custo: 32.0, sobra: 1.8 },
  { nome: 'Gelatina de morango', unidade: 'PACOTE', minimo: 4, custo: 2.79, sobra: 9 },
  { nome: 'Farinha de trigo', unidade: 'KG', minimo: 3, custo: 5.29, sobra: 6.5 },
  { nome: 'Açúcar refinado', unidade: 'KG', minimo: 5, custo: 4.39, sobra: 11 },
  { nome: 'Ovos', unidade: 'UNIDADE', minimo: 24, custo: 0.79, sobra: 42 },
  { nome: 'Forminha nº 4', unidade: 'UNIDADE', minimo: 300, custo: 0.04, sobra: 180 },
  { nome: 'Pote com tampa 250 ml', unidade: 'UNIDADE', minimo: 30, custo: 1.15, sobra: 14 },
  { nome: 'Caixa para doces', unidade: 'UNIDADE', minimo: 20, custo: 2.4, sobra: 48 },
];

/** Doces, com a receita (para `rende` unidades) — a ficha técnica. */
const PRODUTOS = [
  {
    nome: 'Brigadeiro',
    preco: 2.5,
    minimo: 40,
    rende: 40,
    receita: {
      'Leite condensado': 1,
      'Chocolate em pó': 0.025,
      Manteiga: 0.015,
      'Chocolate granulado': 0.15,
      'Forminha nº 4': 40,
    },
  },
  {
    nome: 'Beijinho',
    preco: 2.5,
    minimo: 40,
    rende: 40,
    receita: {
      'Leite condensado': 1,
      'Coco ralado': 0.1,
      Manteiga: 0.015,
      'Açúcar refinado': 0.04,
      'Forminha nº 4': 40,
    },
  },
  {
    nome: 'Bicho de pé',
    preco: 2.5,
    minimo: 40,
    rende: 40,
    receita: {
      'Leite condensado': 1,
      'Gelatina de morango': 1,
      Manteiga: 0.015,
      'Açúcar refinado': 0.04,
      'Forminha nº 4': 40,
    },
  },
  {
    nome: 'Bolo de pote',
    preco: 14,
    minimo: 6,
    rende: 10,
    receita: {
      'Farinha de trigo': 0.25,
      'Açúcar refinado': 0.2,
      Ovos: 4,
      'Chocolate em pó': 0.08,
      'Leite condensado': 1,
      'Creme de leite': 1,
      Manteiga: 0.08,
      'Pote com tampa 250 ml': 10,
    },
  },
  {
    nome: 'Brownie',
    preco: 8,
    minimo: 8,
    rende: 16,
    receita: {
      'Farinha de trigo': 0.18,
      'Chocolate em pó': 0.12,
      'Chocolate meio amargo': 0.2,
      Manteiga: 0.2,
      'Açúcar refinado': 0.3,
      Ovos: 4,
      'Caixa para doces': 16,
    },
  },
  {
    nome: 'Trufa',
    preco: 5,
    minimo: 20,
    rende: 25,
    receita: {
      'Chocolate meio amargo': 0.5,
      'Creme de leite': 1,
      'Forminha nº 4': 25,
    },
  },
];

/**
 * Lotes: de quanto em quanto tempo cada doce é feito, e quanto. É o
 * ritmo de uma confeitaria pequena: os docinhos a cada dois ou três dias,
 * o bolo de pote dia sim, dia não.
 */
const PRODUCAO = {
  Brigadeiro: { aCada: 2, desloca: 0, lote: 80 },
  Beijinho: { aCada: 3, desloca: 0, lote: 80 },
  'Bicho de pé': { aCada: 3, desloca: 1, lote: 50 },
  'Bolo de pote': { aCada: 4, desloca: 1, lote: 10 },
  Brownie: { aCada: 4, desloca: 2, lote: 16 },
  Trufa: { aCada: 6, desloca: 0, lote: 25 },
};

/** Ingredientes com validade controlada: uma compra só, no início do mês. */
const COMPRAS_NORMAIS = [DIAS - 1, 19, 9];

// Nomes de cliente claramente de exemplo (o campo é opcional; a maioria
// das vendas de balcão fica sem).
const CLIENTES = [
  'Ana Exemplo',
  'Bruno Exemplo',
  'Carla Exemplo',
  'Festa Exemplo',
  'Escola Exemplo',
];

// ------------------------------------------------------------ limpeza

async function limpar() {
  await prisma.fechamentoDiario.deleteMany({});
  await prisma.movimentacaoEstoque.deleteMany({});
  await prisma.itemVenda.deleteMany({});
  await prisma.venda.deleteMany({});
  await prisma.producao.deleteMany({});
  await prisma.despesa.deleteMany({});
  await prisma.fichaTecnicaItem.deleteMany({});
  await prisma.produto.deleteMany({});
  await prisma.insumo.deleteMany({});
}

// ------------------------------------------------------------ principal

async function main() {
  await limpar();

  // A usuária de demonstração. A senha vem do ambiente; sem ela, uma
  // aleatória, mostrada no fim — nunca escrita no código.
  const senha = process.env.DEMO_SENHA || crypto.randomBytes(9).toString('base64url');
  const email = process.env.DEMO_EMAIL || 'demo@exemplo.com';
  const marina = await prisma.usuario.upsert({
    where: { email },
    update: {
      nome: 'Marina',
      papel: 'ADMIN',
      ativo: true,
      senhaHash: await bcrypt.hash(senha, 10),
    },
    create: { nome: 'Marina', email, papel: 'ADMIN', senhaHash: await bcrypt.hash(senha, 10) },
  });
  const quem = marina.id;

  // ---------------------------------------------------- catálogo
  const insumos = {};
  for (const i of INSUMOS) {
    insumos[i.nome] = await prisma.insumo.create({
      data: {
        nome: i.nome,
        unidade: i.unidade,
        estoqueMinimo: i.minimo,
        controlaValidade: Boolean(i.vence),
      },
    });
  }
  const produtos = {};
  for (const p of PRODUTOS) {
    produtos[p.nome] = await prisma.produto.create({
      data: {
        nome: p.nome,
        precoVenda: p.preco,
        unidade: 'UNIDADE',
        estoqueMinimo: p.minimo,
        rendimentoReceita: p.rende,
        fichaTecnica: {
          create: Object.entries(p.receita).map(([nome, quantidade]) => ({
            insumoId: insumos[nome].id,
            quantidade,
          })),
        },
      },
    });
  }

  // ---------------------------------------------------- plano de produção
  const lotes = []; // { dia, produto, quantidade }
  for (let dia = DIAS - 1; dia >= 0; dia -= 1) {
    for (const p of PRODUTOS) {
      const { aCada, desloca, lote } = PRODUCAO[p.nome];
      if ((DIAS - 1 - dia - desloca) % aCada === 0 && DIAS - 1 - dia >= desloca) {
        lotes.push({ dia, produto: p, quantidade: lote });
      }
    }
  }

  // Consumo de cada ingrediente por dia, pela ficha técnica.
  const consumoNoDia = {}; // nome -> Map(dia -> qtd)
  for (const { dia, produto, quantidade } of lotes) {
    for (const [nome, q] of Object.entries(produto.receita)) {
      consumoNoDia[nome] ??= new Map();
      const m = consumoNoDia[nome];
      // O mesmo arredondamento do producaoService (3 casas por lote): a
      // conta daqui bate com o que o serviço baixa, sem sobrar 0,003.
      m.set(dia, arred((m.get(dia) ?? 0) + arred((q * quantidade) / produto.rende)));
    }
  }
  const consumoEntre = (nome, de, ate) => {
    let s = 0;
    for (const [dia, q] of consumoNoDia[nome] ?? []) if (dia <= de && dia > ate) s += q;
    return arred(s);
  };

  // ---------------------------------------------------- compras
  // Cada compra cobre o consumo até a próxima; a última leva também a
  // sobra planejada. Assim o estoque nunca fica negativo no meio do mês e
  // termina exatamente onde a demonstração precisa.
  let compras = 0;
  for (const i of INSUMOS) {
    const dias = i.vence ? [DIAS - 1] : COMPRAS_NORMAIS;
    for (let k = 0; k < dias.length; k += 1) {
      const de = dias[k];
      const ate = k + 1 < dias.length ? dias[k + 1] : -1;
      const ultima = k === dias.length - 1;
      const quantidade = arred(consumoEntre(i.nome, de, ate) + (ultima ? i.sobra : 0));
      if (quantidade <= 0) continue;
      // Preço de mercado oscila um pouco de uma compra para outra.
      const custo = arred(i.custo * (0.95 + sorteio() * 0.1), 2);
      await movimentacaoService.registrar(
        {
          tipo: 'ENTRADA_COMPRA',
          insumoId: insumos[i.nome].id,
          quantidade,
          custoUnitario: custo,
          validade: i.vence
            ? noBrasil(-i.vence, 12)
            : i.unidade === 'LATA'
              ? noBrasil(-240, 12)
              : null,
          data: noBrasil(de, 6, entre(0, 40)), // antes da produção, que começa às 7h
        },
        quem
      );
      compras += 1;
    }
  }

  // ---------------------------------------------------- dia a dia
  const horaAgora = agoraBrasil().getUTCHours();
  const PESOS_FORMA = { PIX: 45, DINHEIRO: 25, CARTAO_DEBITO: 17, CARTAO_CREDITO: 13 };
  const PESOS_DOCE = {
    Brigadeiro: 30,
    Beijinho: 20,
    'Bicho de pé': 14,
    'Bolo de pote': 16,
    Brownie: 10,
    Trufa: 10,
  };
  let vendas = 0;
  let faturamento = 0;

  const saldo = async (nome) =>
    Number((await prisma.produto.findUnique({ where: { id: produtos[nome].id } })).quantidadeAtual);

  for (let dia = DIAS - 1; dia >= 0; dia -= 1) {
    // Produção de manhã cedo, antes de abrir.
    for (const lote of lotes.filter((l) => l.dia === dia)) {
      await producaoService.registrar(
        {
          produtoId: produtos[lote.produto.nome].id,
          quantidade: lote.quantidade,
          data: noBrasil(dia, 7, entre(0, 50)),
        },
        quem
      );
    }

    // Vendas do dia: mais no fim de semana. Hoje, só até uma hora atrás.
    const fimDeSemana = [0, 6].includes(diaDaSemana(dia));
    const quantas = fimDeSemana ? entre(5, 8) : entre(3, 6);
    const ultimaHora = dia === 0 ? Math.max(9, horaAgora - 1) : 19;
    const horas = Array.from({ length: quantas }, () => entre(9, ultimaHora)).sort((a, b) => a - b);

    for (const hora of horas) {
      const encomenda = sorteio() < 0.1;
      const escolhidos = [
        ...new Set([pesado(PESOS_DOCE), ...(sorteio() < 0.4 ? [pesado(PESOS_DOCE)] : [])]),
      ];
      const itens = [];
      for (const nome of escolhidos) {
        const p = PRODUTOS.find((x) => x.nome === nome);
        const tem = await saldo(nome);
        const desejado =
          p.preco >= 10
            ? entre(1, 3)
            : p.preco >= 5
              ? entre(2, 8)
              : encomenda
                ? um([50, 60, 80, 100])
                : um([6, 10, 12, 15, 20, 25]);
        // Não vende o que não fez: o saldo negativo pareceria defeito.
        const qtd = Math.min(desejado, Math.floor(tem * 0.6));
        if (qtd >= 1) itens.push({ produtoId: produtos[nome].id, quantidade: qtd });
      }
      if (!itens.length) continue;
      const venda = await vendaService.criar(
        {
          itens,
          formaPagamento: pesado(PESOS_FORMA),
          clienteNome: encomenda ? `Encomenda — ${um(CLIENTES)}` : null,
          data: noBrasil(dia, hora, entre(0, 59)),
        },
        quem
      );
      vendas += 1;
      faturamento += Number(venda.total);
    }
  }

  // Entradas avulsas: dinheiro que entrou sem baixar doce do estoque.
  const avulsas = [
    { dia: 24, valor: 120, obs: 'Sinal de encomenda de aniversário' },
    { dia: 16, valor: 85, obs: 'Venda na feirinha do bairro' },
    { dia: 8, valor: 150, obs: 'Sinal de encomenda de casamento' },
    { dia: 0, valor: 60, obs: 'Sinal de encomenda' },
  ];
  for (const a of avulsas) {
    await vendaService.criar(
      {
        valor: a.valor,
        formaPagamento: 'PIX',
        observacao: a.obs,
        data: noBrasil(a.dia, Math.min(10, Math.max(9, horaAgora - 2)), entre(0, 59)),
      },
      quem
    );
  }

  // ---------------------------------------------------- saídas
  // O sistema separa só "saída" (custo do negócio) de "retirada pessoal";
  // o tipo da despesa vai no "Com o quê", como a cliente escreve.
  const saidas = [
    { dia: 29, valor: 642.3, descricao: 'Ingredientes — compra no atacado', forma: 'PIX' },
    { dia: 29, valor: 138.6, descricao: 'Embalagens — potes e forminhas', forma: 'CARTAO_DEBITO' },
    { dia: 27, valor: 198.4, descricao: 'Conta de luz', recorrente: true, forma: 'PIX' },
    { dia: 25, valor: 42.0, descricao: 'Transporte — entrega de encomenda', forma: 'DINHEIRO' },
    { dia: 22, valor: 125.0, descricao: 'Gás de cozinha', forma: 'DINHEIRO' },
    { dia: 20, valor: 120.0, descricao: 'Diária da ajudante', forma: 'DINHEIRO' },
    { dia: 19, valor: 588.9, descricao: 'Ingredientes — compra no atacado', forma: 'PIX' },
    { dia: 17, valor: 99.9, descricao: 'Internet', recorrente: true, forma: 'CARTAO_CREDITO' },
    { dia: 15, valor: 300.0, descricao: 'Retirada pessoal', retirada: true, forma: 'PIX' },
    { dia: 13, valor: 38.0, descricao: 'Transporte — entrega de encomenda', forma: 'DINHEIRO' },
    { dia: 11, valor: 85.0, descricao: 'Manutenção da batedeira', forma: 'PIX' },
    { dia: 9, valor: 604.5, descricao: 'Ingredientes — compra no atacado', forma: 'PIX' },
    { dia: 9, valor: 96.4, descricao: 'Embalagens — caixas para doces', forma: 'CARTAO_DEBITO' },
    { dia: 6, valor: 120.0, descricao: 'Diária da ajudante', forma: 'DINHEIRO' },
    { dia: 4, valor: 45.0, descricao: 'Transporte — entrega de encomenda', forma: 'DINHEIRO' },
    { dia: 2, valor: 150.0, descricao: 'Retirada pessoal', retirada: true, forma: 'DINHEIRO' },
    { dia: 0, valor: 35.0, descricao: 'Gasolina da entrega', forma: 'DINHEIRO' },
  ];
  for (const s of saidas) {
    await despesaService.criar(
      {
        descricao: s.descricao,
        valor: s.valor,
        retirada: Boolean(s.retirada),
        recorrente: Boolean(s.recorrente),
        // Com a forma, a gaveta do Fechar dia só desconta o que saiu em
        // dinheiro — atacado e contas vão no Pix ou no cartão.
        formaPagamento: s.forma,
        data: noBrasil(
          s.dia,
          s.dia === 0 ? Math.max(9, horaAgora - 2) : entre(10, 17),
          entre(0, 59)
        ),
      },
      quem
    );
  }

  // ---------------------------------------------------- fechamentos
  // Os últimos 14 dias fechados (hoje fica aberto, para a tela de Fechar
  // dia ter o que conferir). No primeiro, ela pôs R$ 200 de troco na
  // gaveta; depois quase sempre bate, e um dia sobrou uma moeda.
  const fechar = 14;
  for (let dia = fechar; dia >= 1; dia -= 1) {
    const dataDia = noBrasil(dia, 20);
    const previa = await fechamentoService.previa(dataDia);
    const calculado = Number(previa.saldoCalculado);
    const diferenca = dia === fechar ? 200 : dia === 5 ? 2.5 : 0;
    await fechamentoService.fechar(
      {
        data: dataDia,
        saldoConferido: arred(calculado + diferenca, 2),
        observacao:
          dia === fechar
            ? 'Troco de R$ 200 colocado na gaveta'
            : diferenca
              ? 'Moeda esquecida na gaveta'
              : undefined,
      },
      quem
    );
  }

  // ---------------------------------------------------- relatório
  const finais = await prisma.insumo.findMany({ orderBy: { nome: 'asc' } });
  const doces = await prisma.produto.findMany({ orderBy: { nome: 'asc' } });
  console.log(
    `\n[banner] ${compras} compras, ${lotes.length} lotes, ${vendas} vendas (R$ ${faturamento.toFixed(2)}), ${saidas.length} saídas, ${fechar} fechamentos.`
  );
  console.log('[banner] Estoque de ingredientes hoje:');
  for (const i of finais) {
    const baixo = Number(i.quantidadeAtual) < Number(i.estoqueMinimo) ? '  ← abaixo do mínimo' : '';
    console.log(
      `  ${i.nome.padEnd(24)} ${Number(i.quantidadeAtual).toFixed(3).padStart(9)} (mín. ${Number(i.estoqueMinimo)})${baixo}`
    );
  }
  console.log('[banner] Doces prontos hoje:');
  for (const d of doces) {
    const baixo = Number(d.quantidadeAtual) <= Number(d.estoqueMinimo) ? '  ← acabando' : '';
    console.log(
      `  ${d.nome.padEnd(24)} ${Number(d.quantidadeAtual).toFixed(0).padStart(9)} (mín. ${Number(d.estoqueMinimo)})${baixo}`
    );
  }
  console.log(`\n[banner] Usuária de demonstração: ${email}`);
  if (!process.env.DEMO_SENHA) console.log(`[banner] Senha gerada agora: ${senha}`);
  console.log('');
}

main()
  .catch((erro) => {
    console.error('[banner] Falhou:', erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
