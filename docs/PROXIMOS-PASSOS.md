# Próximos passos técnicos

Continuação do setup inicial. A ordem abaixo é uma sugestão pensada para **destravar o time em paralelo** e chegar cedo a algo demonstrável para a cliente.

---

## 0. Antes de tudo: a reunião com a cliente 🎯

**Esta é a tarefa de maior prioridade.** Cada dia de código escrito sobre suposições é um dia de retrabalho em potencial.

Leve para a reunião com a Dalila:

- A lista de perguntas do [README](../README.md#️-perguntas-a-levar-para-a-reunião-com-a-dalila).
- As telas atuais (mesmo vazias) — mostrar algo concreto costuma render muito mais informação do que perguntar no abstrato.
- Pergunte **como ela faz hoje**: se usa caderno, planilha ou nada. O sistema precisa ser melhor que o processo atual dela, não melhor que um sistema ideal.

**Saída esperada:** documento de requisitos e ajustes no `schema.prisma`.

---

## 1. Fechar o schema após a reunião

Com as respostas em mãos, revisar o `schema.prisma`:

- [ ] Converter `unidadeMedida` e `formaPagamento` em `enum`, se a lista for fechada
- [ ] Decidir se `categoria` vira tabela própria
- [ ] Decidir se `Fornecedor` / `Cliente` viram entidades (hoje é só o texto em `contraparte`)
- [ ] Confirmar se `Produto` cobre insumos e produtos finais, ou se são coisas separadas

```bash
# Após qualquer alteração no schema:
npm run prisma:migrate
```

> ⚠️ **Nunca edite um arquivo de migration já commitado.** Faça uma migration nova. O histórico precisa rodar do zero na máquina de qualquer integrante.

---

## 2. Primeiro CRUD completo: Produtos

Sugerido como **primeiro módulo** porque é o mais simples e serve de **molde** para todos os outros. Quem fizer este deixa o padrão pronto para o resto do time.

Arquivos a criar:

```
backend/src/services/produtoService.js
backend/src/controllers/produtoController.js
backend/src/routes/produtoRoutes.js   → registrar em routes/index.js
```

Endpoints:

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/produtos` | Lista (com busca por nome e paginação) |
| `GET` | `/api/produtos/:id` | Detalhe |
| `POST` | `/api/produtos` | Cadastra |
| `PUT` | `/api/produtos/:id` | Atualiza |
| `DELETE` | `/api/produtos/:id` | Inativa (`ativo = false`, **não** apaga) |

Checklist do padrão:

- [ ] Schema Zod para o corpo da requisição
- [ ] Todas as rotas atrás de `autenticar`
- [ ] `DELETE` restrito a `ADMIN` via `autorizar('ADMIN')`
- [ ] Regra e acesso ao banco **no service**, não no controller
- [ ] Usar `AppError.naoEncontrado()` quando o id não existir

---

## 3. Movimentação de estoque

O ponto que exige mais atenção: registrar a movimentação **e** atualizar o saldo do produto.

As duas operações precisam acontecer **juntas ou nenhuma**. Se a movimentação for gravada e a atualização do saldo falhar, o estoque fica errado para sempre. Por isso, use **transação**:

```js
await prisma.$transaction(async (tx) => {
  await tx.movimentacaoEstoque.create({ data: { ... } });
  await tx.produto.update({
    where: { id: produtoId },
    data: { quantidadeEstoque: { increment: quantidade } }, // decrement na saída
  });
});
```

- [ ] `POST /api/estoque/movimentacoes` — registra entrada ou saída
- [ ] `GET /api/estoque/movimentacoes` — histórico com filtro por produto e período
- [ ] Bloquear saída maior que o saldo disponível (**confirmar essa regra com a cliente** — pode ser que ela prefira permitir e apenas avisar)

---

## 4. Fluxo de caixa

Estruturalmente mais simples que o estoque, por não mexer no saldo de outra tabela.

- [ ] `POST /api/caixa` — lançar entrada ou saída
- [ ] `GET /api/caixa` — listar com filtro por período, tipo e categoria
- [ ] `PUT` / `DELETE` de lançamento
- [ ] `GET /api/caixa/resumo` — totais de entrada, saída e saldo do período

> 💡 Somas de dinheiro devem ser feitas no **banco** (`aggregate` do Prisma), não trazendo todos os registros para o Node e somando em JavaScript. Com o tempo isso vira lentidão.

---

## 5. Contas a pagar/receber

- [ ] CRUD de contas
- [ ] `PATCH /api/contas/:id/quitar` — marca como `QUITADA` e **gera o lançamento de caixa** correspondente (também dentro de uma transação)
- [ ] Filtros por status, tipo e faixa de vencimento

---

## 6. Dashboard

Um único endpoint que devolve tudo que a tela precisa, para o frontend não fazer cinco chamadas:

```
GET /api/dashboard?inicio=2026-01-01&fim=2026-01-31
```

```json
{
  "entradas": 12500.00,
  "saidas": 8300.00,
  "saldo": 4200.00,
  "contasVencendo": 3,
  "produtosEstoqueBaixo": 5
}
```

- [ ] Endpoint no backend
- [ ] Ligar os cartões da tela `Dashboard.jsx` (hoje mostram `—`)
- [ ] Gráfico de evolução do caixa (sugestão: [Recharts](https://recharts.org), que integra bem com React)

---

## 7. Frontend dos módulos

Para cada módulo, o caminho é sempre o mesmo:

1. Criar `frontend/src/services/<modulo>Service.js` com as chamadas da API
2. Substituir o `<EmConstrucao />` da página pela tela real
3. Extrair para `components/` o que repetir (tabela, modal de formulário, filtro de período)

Componentes que provavelmente vão se repetir e valem ser genéricos desde o início:

- [ ] `Tabela` — listagem com estados de carregando e vazio
- [ ] `Modal` — usado por todos os formulários de cadastro
- [ ] `FiltroPeriodo` — usado em caixa, estoque e dashboard
- [ ] `Moeda` — formata valores em BRL (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`)

> ⚠️ **Atenção com `Decimal`:** o Prisma devolve valores decimais como **string** no JSON, para não perder precisão. No frontend, converta com `Number(valor)` antes de fazer contas ou formatar.

---

## 8. Qualidade (fazer cedo, não no fim)

- [ ] **ESLint + Prettier** na raiz, para o código do grupo sair no mesmo formato e evitar diffs poluídos por formatação
- [ ] **Testes** dos serviços com regra de negócio (movimentação de estoque e quitação de conta são os candidatos naturais) — sugestão: [Vitest](https://vitest.dev), que roda nos dois lados do monorepo
- [ ] **Collection do Insomnia/Postman** versionada, para o time testar a API sem depender do frontend

---

## 9. Fase 2

Só depois do MVP funcionando de ponta a ponta:

- [ ] Alerta de estoque abaixo do mínimo
- [ ] Alerta de contas vencendo nos próximos dias
- [ ] Exportação de relatórios (CSV é o caminho mais barato; PDF se a cliente pedir)
- [ ] Filtros e refinamentos de usabilidade a partir do feedback da Dalila

---

## Sugestão de divisão entre o grupo

A estrutura em camadas foi pensada para permitir trabalho em paralelo com pouco conflito de merge — cada módulo tem seus próprios arquivos de rota, controller e service.

| Frente | Escopo | Depende de |
|---|---|---|
| **A** | Produtos + Movimentação de estoque | Passo 2 |
| **B** | Fluxo de caixa + Contas | Passo 2 (como referência de padrão) |
| **C** | Dashboard + componentes compartilhados do frontend | A e B |

**Combinação importante:** quem fizer o passo 2 (Produtos) termina primeiro e avisa o grupo, porque ele estabelece o padrão que os outros vão seguir.

---

## Fluxo de trabalho no Git

Sugestão para o grupo evitar conflito e manter a `main` sempre funcionando:

```bash
git checkout -b feat/cadastro-produtos    # uma branch por funcionalidade
git add .
git commit -m "feat: cadastro de produtos"
git push -u origin feat/cadastro-produtos
# abrir Pull Request e pedir revisão de outro integrante
```

Prefixos de commit (padrão *Conventional Commits*): `feat:` funcionalidade nova, `fix:` correção, `docs:` documentação, `refactor:` melhoria sem mudar comportamento, `chore:` configuração e manutenção.

**Regra de ouro:** nunca commite o arquivo `.env`. Se uma variável nova for necessária, adicione-a ao `.env.example` (sem o valor real) e avise o grupo.
