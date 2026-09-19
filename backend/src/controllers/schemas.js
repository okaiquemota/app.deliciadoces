import { z } from 'zod';

/**
 * Schemas de entrada da API, reunidos aqui porque vários são compartilhados
 * entre módulos (período, unidade, forma de pagamento).
 *
 * Tudo que entra passa por aqui antes de chegar na regra de negócio.
 */

export const UNIDADES = ['G', 'KG', 'ML', 'L', 'UNIDADE', 'PACOTE', 'LATA', 'CAIXA'];
export const FORMAS_PAGAMENTO = ['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO'];

/** Aceita número ou string numérica (o formulário manda string). */
const numero = (min = 0, mensagem) =>
  z.coerce.number({ message: 'Informe um número válido.' }).min(min, mensagem);

const dataOpcional = z.coerce.date().optional();

export const periodoSchema = z.object({
  inicio: z.coerce.date().optional(),
  fim: z.coerce.date().optional(),
});

// ---------------------------------------------------------------- insumo
export const insumoSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto.'),
  unidade: z.enum(UNIDADES),
  estoqueMinimo: numero().default(0),
  custoUnitario: numero().default(0),
  controlaValidade: z.boolean().default(false),
  fornecedorPadrao: z.string().trim().optional().nullable(),
});

export const insumoUpdateSchema = insumoSchema.partial();

// --------------------------------------------------------------- produto
export const produtoSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto.'),
  precoVenda: numero(0.01, 'O preço precisa ser maior que zero.'),
  unidade: z.enum(UNIDADES).default('UNIDADE'),
  estoqueMinimo: numero().default(0),
  rendimentoReceita: z.coerce.number().int().positive().optional().nullable(),
});

export const produtoUpdateSchema = produtoSchema.partial();

export const fichaTecnicaSchema = z.object({
  rendimentoReceita: z.coerce.number().int().positive().optional().nullable(),
  itens: z
    .array(
      z.object({
        insumoId: z.string().uuid('Insumo inválido.'),
        quantidade: numero(0.001),
      })
    )
    .default([]),
});

// ----------------------------------------------------------- movimentação
export const movimentacaoSchema = z
  .object({
    tipo: z.enum(['ENTRADA_COMPRA', 'PERDA', 'AJUSTE']),
    insumoId: z.string().uuid().optional().nullable(),
    produtoId: z.string().uuid().optional().nullable(),
    quantidade: z.coerce.number().refine((v) => v !== 0, 'A quantidade não pode ser zero.'),
    custoUnitario: numero().optional().nullable(),
    validade: dataOpcional.nullable(),
    motivo: z.string().trim().optional().nullable(),
    data: dataOpcional,
  })
  .refine((d) => Boolean(d.insumoId) !== Boolean(d.produtoId), {
    message: 'Informe exatamente um entre insumo e produto.',
    path: ['insumoId'],
  });

// ----------------------------------------------------------------- venda
export const vendaSchema = z.object({
  itens: z
    .array(
      z.object({
        produtoId: z.string().uuid('Produto inválido.'),
        quantidade: numero(0.001),
      })
    )
    .min(1, 'Informe ao menos um item.'),
  desconto: numero().default(0),
  formaPagamento: z.enum(FORMAS_PAGAMENTO),
  clienteNome: z.string().trim().optional().nullable(),
  observacao: z.string().trim().optional().nullable(),
  data: dataOpcional,
});

// --------------------------------------------------------------- despesa
export const despesaSchema = z.object({
  descricao: z.string().trim().min(2, 'Descreva a despesa.'),
  valor: numero(0.01, 'O valor precisa ser maior que zero.'),
  categoriaId: z.string().uuid('Selecione uma categoria.'),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).optional().nullable(),
  recorrente: z.boolean().default(false),
  fornecedor: z.string().trim().optional().nullable(),
  data: dataOpcional,
});

export const despesaUpdateSchema = despesaSchema.partial();

// -------------------------------------------------------------- produção
export const producaoSchema = z.object({
  produtoId: z.string().uuid('Selecione o produto.'),
  quantidade: numero(0.001),
  insumos: z
    .array(
      z.object({
        insumoId: z.string().uuid(),
        quantidade: numero(0.001),
      })
    )
    .optional(),
  observacao: z.string().trim().optional().nullable(),
  data: dataOpcional,
});

// ------------------------------------------------------- fechamento diário
/**
 * `saldoConferido` aceita zero: gaveta vazia é contagem legítima, e um
 * `min(0.01)` como o dos outros valores recusaria o fechamento de um dia
 * em que ela levou todo o dinheiro para o banco.
 */
export const fechamentoSchema = z.object({
  data: dataOpcional,
  saldoConferido: z.coerce
    .number()
    .min(0, 'O valor contado não pode ser negativo.')
    .optional()
    .nullable(),
  observacao: z.string().trim().optional().nullable(),
});

export const conferenciaSchema = z.object({
  saldoConferido: z.coerce
    .number()
    .min(0, 'O valor contado não pode ser negativo.')
    .optional()
    .nullable(),
  observacao: z.string().trim().optional().nullable(),
});
