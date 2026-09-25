# Próximos passos técnicos

O setup (monorepo, banco, autenticação e seed) está pronto. Daqui em diante é construir os módulos, na ordem definida com a cliente.

---

## Regra que atravessa tudo: o saldo de estoque

Antes de escrever qualquer módulo, entenda este ponto — ele é a maior fonte de bug silencioso do projeto.

`Insumo.quantidadeAtual` e `Produto.quantidadeAtual` são um **cache** do que a `MovimentacaoEstoque` diz. As FKs de venda, produção e despesa usam `onDelete: Cascade`, então apagar uma venda apaga as movimentações **sem devolver a quantidade ao saldo**. O razão e o saldo passam a discordar, em silêncio, para sempre.

Como a Dalila edita e exclui o tempo todo, isso acontece cedo. As regras:

- [ ] Criar um `estoqueService` que é o **único** lugar autorizado a escrever `quantidadeAtual`
- [ ] Toda alteração de estoque acontece dentro de `$transaction` — movimentação e saldo mudam juntos ou nada muda
- [ ] Nenhum controller chama `prisma.venda.delete()` / `prisma.producao.delete()` direto
- [ ] Implementar `recalcularSaldo(tipo, id)` que rededuz o saldo somando o razão — serve para corrigir divergência e para checar em teste

```js
await prisma.$transaction(async (tx) => {
  await tx.movimentacaoEstoque.create({
    data: { tipo: 'SAIDA_VENDA', produtoId, quantidade, vendaId },
  });
  await tx.produto.update({
    where: { id: produtoId },
    data: { quantidadeAtual: { decrement: quantidade } },
  });
});
```

> A quantidade na `MovimentacaoEstoque` é **sempre positiva**. Quem diz a direção é o `tipo`.

---

## 1. Caixa

O primeiro módulo, e o que a cliente mais usa.

### Venda

- [ ] `POST /api/vendas` — cria a venda, os `ItemVenda` e as movimentações `SAIDA_VENDA`, tudo em uma transação
- [ ] `GET /api/vendas` — lista com filtro por período e forma de pagamento
- [ ] `PUT /api/vendas/:id` — editar é fluxo principal. Estornar as movimentações antigas e criar as novas, na mesma transação
- [ ] `PATCH /api/vendas/:id/cancelar` — é o que o botão "Excluir" da tela chama

**Combinado sobre desfazer venda:** a tela mostra "Excluir" (a palavra da cliente), mas por baixo marca `cancelada = true` e estorna o estoque. Nada é apagado de verdade — ela erra com frequência e precisa poder voltar atrás. `prisma.venda.delete()` não deve aparecer no código.

Cuidados:

- `precoUnitario` é **congelado** no item no momento da venda; nunca leia do `Produto` na hora de exibir uma venda antiga
- `subtotal`, `desconto` e `total` são calculados no servidor, nunca aceitos do cliente
- Venda sempre à vista: **não** existe conta a receber, parcela ou sinal

### Despesa

- [ ] CRUD completo em `/api/despesas`
- [ ] Filtro por período
- [ ] Sem categoria para a cliente: ela escolhe Saída ou Retirada pessoal (campo `retirada` da API) e o servidor usa uma das duas categorias internas

> **A retirada pessoal nunca entra no cálculo de lucro.** O dinheiro sai do caixa, mas não é custo do negócio. Errar isso faz o resultado dela aparecer pior do que é — e foi um ponto que ela levantou sozinha.

### Fechamento diário

- [ ] `POST /api/fechamentos` — grava o saldo calculado e o que ela contou de verdade, com a diferença
- [ ] Ela confere todo dia, então esta tela precisa ser rápida: abrir, digitar um número, salvar

---

## 2. Estoque

- [ ] CRUD de `Insumo` e de `Produto`
- [ ] `POST /api/estoque/movimentacoes` — compra, perda e ajuste
- [ ] `motivo` é **obrigatório na aplicação** quando o tipo for `PERDA` ou `AJUSTE` (o schema deixa nulo de propósito, a trava é nossa)
- [ ] Validade vai na **entrada**, não no insumo: cada compra tem a sua
- [ ] Recalcular o **custo médio** do insumo a cada compra
- [ ] `GET /api/estoque/alertas` — itens abaixo do mínimo e validade próxima

Ela já ficou sem ingrediente várias vezes e joga coisa fora às vezes. O alerta é o que ela pediu, não enfeite.

---

## 3. Produção e ficha técnica

- [ ] `POST /api/producoes` — consome insumo (`SAIDA_PRODUCAO`) e gera produto pronto (`ENTRADA_PRODUCAO`), em uma transação
- [ ] Com ficha técnica: calcula os insumos a partir do `rendimentoReceita`
- [ ] **Sem ficha técnica: ela informa os insumos na mão.** Este caminho não é plano B, é o caminho provável — ela só cadastraria receita "se for simples"
- [ ] `custoEstimado` = soma do custo médio dos insumos consumidos
- [ ] CRUD da ficha técnica, sempre opcional

> Se a ficha técnica virar obrigatória em algum ponto do fluxo, o módulo falhou. O sistema tem que ser inteiramente utilizável sem nenhuma receita cadastrada.

---

## 4. Dashboard semanal

Ela confere o caixa todo dia, mas **olha o resultado por semana**. A tela principal é semanal.

- [ ] `GET /api/dashboard?inicio=&fim=` devolvendo tudo de uma vez:

```json
{
  "vendas": 1850.0,
  "custos": 620.0,
  "retiradas": 300.0,
  "lucro": 1230.0,
  "vendasPorFormaPagamento": { "DINHEIRO": 900.0, "PIX": 700.0, "CARTAO_DEBITO": 250.0 },
  "itensEstoqueBaixo": 4,
  "validadeProxima": 2
}
```

- [ ] `lucro` = vendas − custos operacionais. **Retirada pessoal fica de fora da conta**, mas aparece na tela para ela enxergar quanto tirou
- [ ] Gráfico de evolução por semana (sugestão: [Recharts](https://recharts.org))

---

## 5. Qualidade

- [ ] **ESLint + Prettier** na raiz
- [ ] **Testes** ([Vitest](https://vitest.dev)) — priorize o `estoqueService`: venda, edição de venda, cancelamento e produção. É onde um bug corrompe dado de verdade
- [ ] Um teste que roda `recalcularSaldo()` depois de uma sequência de operações e confere que o saldo bate com o razão

---

## Cuidados no frontend

- **`Decimal` chega como string no JSON** (o Prisma faz isso para não perder precisão). Converta com `Number(valor)` antes de calcular ou formatar
- Formate dinheiro com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
- Ela pediu **simples e prático**: lançar uma venda tem que ser poucos cliques. Se a tela ficar cheia, provavelmente erramos o escopo

---

## Fluxo de trabalho no Git

```bash
git checkout -b feat/modulo-caixa
git commit -m "feat: lançamento de venda"
git push -u origin feat/modulo-caixa
```

Prefixos: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.

**Nunca commite o `.env`.** Variável nova vai para o `.env.example` sem o valor real.

Depois de mexer no `schema.prisma`, rode `npm run prisma:migrate` e **nunca edite uma migration já commitada** — faça outra.
