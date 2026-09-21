# app.deliciadoces

Sistema de gestão para a **Delícia Doces**, confeitaria com mais de 20 anos de mercado — controle de caixa, estoque em dois níveis (ingredientes e doces prontos), produção e resultado semanal.

Projeto acadêmico da disciplina de **Fábrica de Software**.

> **Status: setup concluído, módulos a construir.** O levantamento de requisitos com a cliente (Dalila) foi feito em 14/09 e o modelo de dados já reflete as respostas dela. O que existe hoje é a base: monorepo, banco, autenticação e seed. Os módulos de caixa, estoque, produção e dashboard ainda não foram implementados.

---

## Sumário

- [Módulos do sistema](#módulos-do-sistema)
- [Estratégia de entrega](#estratégia-de-entrega)
- [Stack](#stack)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Como rodar localmente](#como-rodar-localmente)
- [Scripts disponíveis](#scripts-disponíveis)
- [Modelo de dados](#modelo-de-dados)
- [Autenticação](#autenticação)
- [Padrões de código](#padrões-de-código)
- [Próximos passos](#próximos-passos)

---

## Módulos do sistema

| Módulo        | Descrição                                                                     |
| ------------- | ----------------------------------------------------------------------------- |
| **Caixa**     | Vendas (sempre à vista) e despesas, com edição e exclusão                     |
| **Estoque**   | Ingredientes e doces prontos, movimentações, perdas e aviso de item acabando  |
| **Produção**  | Lote produzido consome ingrediente e gera doce pronto; ficha técnica opcional |
| **Dashboard** | Resultado por semana, que é como a cliente prefere olhar                      |

## O que a cliente definiu

O levantamento com a Dalila fechou pontos que moldam o sistema inteiro:

- **Não vende fiado.** O cliente paga tudo na entrega — não existe conta a receber, parcela nem sinal. Toda venda é à vista.
- **Produz em lote antes de vender.** Por isso a venda baixa o _doce pronto_, e quem consome ingrediente é a _produção_.
- **Controla os dois níveis:** ingredientes e doces prontos.
- **Ficha técnica é opcional.** Ela sabe as quantidades de cabeça e só cadastraria "se for simples" — então o sistema tem que funcionar sem ficha nenhuma.
- **Erra e corrige.** Editar e excluir lançamento é fluxo principal, não exceção.
- **Mistura dinheiro pessoal e do negócio.** Daí a categoria "Retirada pessoal": sai do caixa, mas não conta como custo no lucro.
- **Confere o caixa todo dia, mas olha o resultado por semana.**
- **Quer simplicidade.** Ela não tem tempo de ficar mexendo no sistema.

## Ordem de construção

1. **Caixa** — venda e despesa, com edição e exclusão
2. **Estoque** — ingrediente, doce pronto, movimentação e perda
3. **Produção e ficha técnica**
4. **Dashboard semanal**

O detalhamento técnico de cada etapa está em [docs/PROXIMOS-PASSOS.md](docs/PROXIMOS-PASSOS.md).

---

## Stack

| Camada       | Tecnologia        | Versão     | Por quê                                                                        |
| ------------ | ----------------- | ---------- | ------------------------------------------------------------------------------ |
| Backend      | Node.js + Express | 5.x        | Stack definida pelo grupo; Express 5 já trata erros de `async` automaticamente |
| Banco        | PostgreSQL        | 16+        | Relacional, adequado a dados financeiros                                       |
| ORM          | Prisma            | 7.x        | Schema declarativo e migrations versionadas                                    |
| Autenticação | JWT               | —          | Stateless, simples de consumir pelo React                                      |
| Frontend     | React + Vite      | 19.x / 8.x | Vite substitui o Create React App, que foi descontinuado                       |
| Roteamento   | React Router      | 7.x        | Padrão de mercado para SPA                                                     |
| HTTP         | Axios             | 1.x        | Interceptors facilitam anexar o token JWT                                      |
| Validação    | Zod               | 4.x        | Valida a entrada da API antes de chegar na regra de negócio                    |

### Decisões de arquitetura

<details>
<summary><strong>Por que monorepo com npm workspaces?</strong></summary>

Backend e frontend no mesmo repositório facilitam a vida do grupo: um único `git clone`, um único `npm install`, e mudanças que afetam os dois lados (ex.: alterar o formato de uma resposta da API) entram no mesmo commit e no mesmo PR.

Usamos **npm workspaces**, que já vem com o npm. Ferramentas como Turborepo ou Nx resolvem problemas de escala que este projeto não tem.
</details>

<details>
<summary><strong>Por que Vite e não Create React App?</strong></summary>

O CRA foi oficialmente descontinuado pelo time do React. O Vite é o caminho recomendado hoje: build muito mais rápido e configuração mínima.
</details>

<details>
<summary><strong>Por que a conexão do banco não está no <code>schema.prisma</code>?</strong></summary>

A partir do **Prisma 7**, a URL do banco saiu do `schema.prisma`. Agora:

- `backend/prisma/schema.prisma` descreve **só o modelo de dados**;
- `backend/prisma.config.js` informa a conexão para a **CLI** (migrations, studio);
- `backend/src/lib/prisma.js` passa um **driver adapter** (`@prisma/adapter-pg`) para o cliente em tempo de execução.

Vale saber disso porque a maioria dos tutoriais na internet ainda mostra o formato antigo (`url = env("DATABASE_URL")` dentro do schema), que **não funciona** nesta versão.
</details>

<details>
<summary><strong>Por que valores monetários são <code>Decimal</code> e não <code>Float</code>?</strong></summary>

`Float` usa ponto flutuante binário e não representa valores decimais com exatidão — o clássico `0.1 + 0.2 = 0.30000000000000004`. Em um sistema financeiro isso vira divergência de centavos no fechamento de caixa. Por isso todo dinheiro usa `Decimal(10,2)`.
</details>

---

## Estrutura de pastas

```
app.deliciadoces/
├── backend/                     # API REST (Node.js + Express + Prisma)
│   ├── prisma/
│   │   ├── migrations/          # Histórico de migrations (versionado!)
│   │   ├── schema.prisma        # Modelo de dados
│   │   └── seed.js              # Popula o banco para desenvolvimento
│   ├── prisma.config.js         # Config da CLI do Prisma (conexão, seed)
│   ├── src/
│   │   ├── config/              # Leitura e validação das variáveis de ambiente
│   │   ├── controllers/         # Traduzem HTTP <-> serviço (sem regra de negócio)
│   │   ├── lib/                 # Prisma Client (singleton)
│   │   ├── middlewares/         # Autenticação, validação, tratamento de erros
│   │   ├── routes/              # Definição dos endpoints
│   │   ├── services/            # Regras de negócio e acesso ao banco
│   │   ├── utils/               # Utilitários (AppError)
│   │   ├── app.js               # Montagem do Express
│   │   └── server.js            # Sobe o servidor
│   └── .env.example             # Modelo das variáveis de ambiente
│
├── frontend/                    # Interface web (React + Vite)
│   ├── src/
│   │   ├── components/          # Componentes reutilizáveis
│   │   ├── contexts/            # Estado global (autenticação)
│   │   ├── pages/               # Uma pasta por tela
│   │   ├── routes/              # Rotas e proteção de rota
│   │   ├── services/            # Chamadas à API
│   │   ├── styles/              # CSS global
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── .env.example
│
├── package.json                 # Workspaces + scripts que rodam os dois projetos
└── .gitignore
```

### A ideia por trás da divisão do backend

O caminho de uma requisição é sempre o mesmo:

```
rota  →  middleware  →  controller  →  service  →  Prisma  →  PostgreSQL
```

- **Rota**: diz qual URL existe e quais middlewares ela usa.
- **Middleware**: autentica, autoriza e valida os dados. Barra o que não deve passar.
- **Controller**: lê o request, chama o service, devolve a resposta. Não tem regra de negócio.
- **Service**: onde mora a regra de negócio e o acesso ao banco.

Isso evita o problema clássico de rotas com 200 linhas misturando validação, regra e SQL — e permite que dois integrantes mexam em módulos diferentes sem conflito de merge.

---

## Como rodar localmente

### Pré-requisitos

- **Node.js 20+** ([download](https://nodejs.org))
- **PostgreSQL 14+** rodando localmente ([download](https://www.postgresql.org/download/))
- **Git**

### 1. Clonar o repositório

```bash
git clone https://github.com/okaiquemota/app.deliciadoces.git
cd app.deliciadoces
```

### 2. Instalar as dependências

Um único comando na raiz instala backend e frontend (é o workspaces trabalhando):

```bash
npm install
```

> Esse comando também gera o **Prisma Client** automaticamente (script `postinstall`), então não é preciso rodar nenhum passo extra depois de clonar.

### 3. Criar o banco de dados

```bash
# Entre no psql (o usuário pode variar conforme sua instalação)
psql -U postgres

# Já dentro do psql:
CREATE DATABASE deliciadoces;
\q
```

### 4. Configurar as variáveis de ambiente

```bash
cp backend/.env.example backend/.env
```

Abra `backend/.env` e ajuste a `DATABASE_URL` com **o seu usuário e senha** do PostgreSQL:

```env
DATABASE_URL="postgresql://SEU_USUARIO:SUA_SENHA@localhost:5432/deliciadoces?schema=public"
JWT_SECRET="qualquer-coisa-para-desenvolvimento"
```

> 🔐 O arquivo `.env` **nunca** vai para o Git (já está no `.gitignore`). Cada pessoa do grupo tem o seu.

### 5. Criar as tabelas e popular o banco

```bash
npm run prisma:migrate    # cria as tabelas no PostgreSQL
npm run db:seed           # cria o usuário admin e produtos de exemplo
```

O seed mostra as credenciais de acesso ao final:

```
e-mail: dalila@deliciadoces.com.br
senha:  deliciadoces123  (provisória — trocar no primeiro uso real)
```

### 6. Rodar o projeto

Abra **dois terminais**:

```bash
# Terminal 1 — backend (http://localhost:3333)
npm run dev:backend

# Terminal 2 — frontend (http://localhost:5173)
npm run dev:frontend
```

Acesse **http://localhost:5173** e faça login com as credenciais acima. 🎉

> 💡 O frontend chama a API através de um _proxy_ configurado no Vite, então não é preciso mexer em CORS durante o desenvolvimento.

### Deu problema?

| Erro                                                    | Causa provável                    | Solução                                                        |
| ------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| `Variáveis de ambiente obrigatórias não definidas`      | Falta o `.env`                    | Refaça o passo 4                                               |
| `Can't reach database server`                           | PostgreSQL parado ou senha errada | Confira se o serviço está no ar e revise a `DATABASE_URL`      |
| `Database deliciadoces does not exist`                  | Banco não foi criado              | Refaça o passo 3                                               |
| Tela de login não carrega                               | Backend fora do ar                | Confira o Terminal 1 e acesse http://localhost:3333/api/health |
| `port 5173 is in use`                                   | Outra aplicação na porta          | Feche a outra ou mude a porta em `frontend/vite.config.js`     |
| `Named export 'PrismaClient' not found`                 | Prisma Client não foi gerado      | `npm run prisma:generate`                                      |
| `relation "usuarios" does not exist`                    | Migrations não aplicadas          | `npm run prisma:migrate`                                       |
| Login diz "E-mail ou senha inválidos" com a senha certa | Seed não rodou                    | `npm run db:seed`                                              |

---

## Onde este sistema vive

Uma dúvida que bate em todo mundo que clona o projeto: _"cadê o sistema? tem algo no ar?"_

Existem **dois lugares diferentes**, e eles não se misturam:

### 1. Na sua máquina (desenvolvimento)

Quando você segue o passo a passo acima, tudo roda no seu computador:

```
seu PC:  frontend (localhost:5173)  →  backend (localhost:3333)  →  PostgreSQL local
```

O banco é **seu**: os dados que você cadastrar testando não aparecem para mais ninguém do grupo, e os dados do colega não aparecem para você. **O que o grupo compartilha é o código, não os dados.** Isso é o normal em desenvolvimento.

O banco não vem pronto no repositório — o que está versionado é a _receita_ dele (a pasta `prisma/migrations`). O comando `prisma:migrate` lê essa receita e constrói as tabelas vazias na hora. O `db:seed` cria a conta da Dalila e as categorias.

### 2. Em produção (o que a cliente usa)

```
Vercel  ├── frontend (arquivos estáticos)
        └── backend (função serverless em /api)   →   PostgreSQL no Supabase
```

Detalhes que valem entender:

- **Frontend e backend saem do mesmo endereço.** O navegador chama `/api/...` na própria origem, e por isso não existe configuração de CORS para dar errado em produção.
- **Na Vercel não há servidor ligado o tempo todo.** Cada requisição acorda uma função, que morre logo depois. Por isso o backend separa `app.js` (monta o Express) de `server.js` (chama `listen`): em produção só o primeiro é usado, pelo arquivo `api/[...rota].mjs`.
- **A conexão com o banco passa pelo pooler do Supabase** (porta 6543). Como cada requisição pode acordar uma função nova, sem pooler o Postgres esgotaria o limite de conexões. As migrations usam a conexão direta (5432), porque o pooler não aguenta comandos de DDL.

O passo a passo de publicar está em [docs/DEPLOY.md](docs/DEPLOY.md).

---

## Scripts disponíveis

Rodando na **raiz** do projeto:

| Comando                   | O que faz                                                  |
| ------------------------- | ---------------------------------------------------------- |
| `npm run dev:backend`     | Sobe a API em modo de desenvolvimento (reinicia ao salvar) |
| `npm run dev:frontend`    | Sobe a interface em modo de desenvolvimento                |
| `npm run build`           | Gera a build de produção do frontend                       |
| `npm run prisma:migrate`  | Cria/aplica migrations no banco                            |
| `npm run prisma:generate` | Regera o Prisma Client após mudar o schema                 |
| `npm run prisma:studio`   | Abre uma interface visual para navegar no banco            |
| `npm run db:seed`         | Popula o banco com dados iniciais                          |
| `npm test`                | Roda os testes automatizados                               |

> Depois de **qualquer alteração** no `schema.prisma`, rode `npm run prisma:migrate`.

---

## Testes

```bash
npm test
```

36 testes cobrindo onde um erro corrompe dado em vez de só quebrar tela: direção das movimentações, transação, estorno na edição de venda, custo médio, ficha técnica opcional e a separação entre lucro e saldo de caixa.

Rodam contra um **PostgreSQL de verdade**, não contra simulação. O que está sendo verificado é justamente o comportamento transacional — saldo e razão mudando juntos — e um banco falso apenas confirmaria a nossa suposição em vez do comportamento real.

> ⚠️ **Os testes apagam todas as tabelas de negócio.** Existe uma trava que recusa rodar contra qualquer banco que não seja local, porque apontar para produção por engano destruiria os dados da cliente.

A qualidade dos testes foi verificada quebrando o código de propósito: inverter a direção das movimentações, remover a exigência de motivo na perda, esquecer o estorno ao editar venda e trocar o custo médio por média simples. **Todas as sabotagens foram detectadas** — teste que passa em código quebrado não serve para nada.

---

## Modelo de dados

O `schema.prisma` reflete as respostas da cliente. As entidades:

| Entidade                       | Representa                                                       |
| ------------------------------ | ---------------------------------------------------------------- |
| `Usuario`                      | Quem acessa o sistema                                            |
| `Insumo`                       | Ingrediente ou embalagem                                         |
| `Produto`                      | Doce pronto, o que ela vende                                     |
| `FichaTecnicaItem`             | Quanto de cada insumo um produto consome por lote (**opcional**) |
| `Producao`                     | Lote produzido: consome insumo, gera produto pronto              |
| `Venda` / `ItemVenda`          | Venda à vista e seus itens                                       |
| `CategoriaDespesa` / `Despesa` | Saídas, separadas entre custo do negócio e retirada pessoal      |
| `MovimentacaoEstoque`          | O razão: tudo que entra e sai, de insumo ou de produto           |
| `FechamentoDiario`             | Conferência de caixa do dia                                      |

### Escolhas que valem explicar

- **`MovimentacaoEstoque` é o razão de tudo.** Insumo e produto passam pela mesma tabela: `insumoId` e `produtoId` são opcionais e exatamente um é preenchido (validado na aplicação). O campo `tipo` diz a direção — a quantidade é sempre positiva.
- **Validade fica na entrada de estoque, não no insumo.** Cada compra tem uma validade diferente.
- **`custoUnitario` do insumo é custo médio**, recalculado a cada compra.
- **Precisão monetária.** Dinheiro em `Decimal(10,2)`, quantidade em `Decimal(12,3)`, custo unitário em `Decimal(12,4)` — `Float` causaria divergência de centavos.
- **`RETIRADA_PESSOAL` não polui o lucro.** O dinheiro sai do caixa, mas não entra na conta de custo do negócio.
- **`precoUnitario` é congelado no `ItemVenda`.** Se o preço do brigadeiro mudar amanhã, a venda de ontem continua valendo o que valeu.

### ⚠️ A armadilha do saldo em cache

`Insumo.quantidadeAtual` e `Produto.quantidadeAtual` são um **cache** do que a `MovimentacaoEstoque` diz. Isso deixa as telas rápidas, mas cria um risco real: as FKs de venda, produção e despesa usam `onDelete: Cascade`, então **apagar uma venda apaga as movimentações dela sem devolver a quantidade ao saldo**. O razão e o saldo passam a discordar em silêncio.

Como editar e excluir é o fluxo principal da cliente, isso não é caso raro. A regra do projeto:

- **Só o `estoqueService` escreve `quantidadeAtual`**, e sempre dentro de `$transaction`.
- **Nenhum controller chama `prisma.venda.delete()` direto.**
- Existe um `recalcularSaldo()` que rededuz o saldo a partir do razão — para corrigir divergência e para usar em teste.

Pelo mesmo motivo, desfazer uma venda **não apaga**: a tela mostra "Excluir" (a palavra da cliente), mas por baixo marca `cancelada = true` e estorna o estoque na mesma transação. Nada some e dá para auditar.

## Autenticação

O fluxo é o padrão JWT:

1. O usuário envia e-mail e senha em `POST /api/auth/login`.
2. A API confere a senha (comparando com o hash **bcrypt**) e devolve um token.
3. O frontend guarda o token e o envia em toda requisição no header `Authorization: Bearer <token>`.
4. O middleware `autenticar` valida o token e popula `req.usuario`.

### Endpoints já disponíveis

| Método  | Rota                  | Acesso         | Descrição                    |
| ------- | --------------------- | -------------- | ---------------------------- |
| `GET`   | `/api/health`         | Público        | Verifica se a API está no ar |
| `POST`  | `/api/auth/login`     | Público        | Autentica e devolve o token  |
| `GET`   | `/api/auth/eu`        | Autenticado    | Dados do usuário logado      |
| `POST`  | `/api/auth/registrar` | Apenas `ADMIN` | Cadastra um novo usuário     |
| `PATCH` | `/api/auth/senha`     | Autenticado    | Troca a própria senha        |

### Cuidados de segurança já aplicados

- A senha **nunca** é gravada em texto puro — só o hash bcrypt.
- O `senhaHash` **nunca** aparece em nenhuma resposta da API.
- E-mail inexistente e senha errada devolvem **a mesma mensagem**, para não permitir descobrir quais e-mails estão cadastrados.
- **Não existe cadastro público.** Este é um sistema interno: quem cria contas é o `ADMIN`. O primeiro administrador nasce do `seed`.
- A proteção de rotas no React é apenas conveniência visual — **quem protege os dados de verdade é o backend**.

---

## Padrões de código

Para o código do grupo ficar coeso:

- **Nomes em português** (`Usuario`, `movimentacaoService`), acompanhando o domínio do negócio. Termos técnicos consagrados seguem em inglês (`token`, `router`, `middleware`).
- **Regra de negócio mora no `service`**, nunca no controller nem na rota.
- **Todo dado que entra na API passa por validação Zod** antes de chegar na regra.
- **Erros esperados usam `AppError`** (`AppError.naoEncontrado(...)`), que vira resposta HTTP automaticamente. Qualquer outro erro vira `500` sem vazar detalhes internos.
- **Componente React só chama a API através de `services/`**, nunca usando `axios` direto.

### Sobre `npm audit`

O `npm audit` aponta alertas nas dependências **internas do CLI do Prisma** (`mysql2`, `deepmerge-ts`). Elas são:

- de **desenvolvimento** apenas (não vão para produção);
- referentes a um driver de **MySQL que este projeto não usa** (usamos PostgreSQL);
- **sem correção disponível** no momento — `npm audit fix --force` só faria _downgrade_ do Prisma para uma versão mais antiga, que tem o mesmo alerta.

Ou seja: é ruído conhecido, não uma falha do nosso código. Vale reavaliar quando o Prisma publicar uma correção.

---

## Documentação

| Documento                                              | O que traz                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **[docs/REQUISITOS.md](docs/REQUISITOS.md)**           | Requisitos funcionais e não funcionais, regras de negócio e a matriz de rastreabilidade (requisito → rota → tela → teste) |
| **[docs/MODELO-DE-DADOS.md](docs/MODELO-DE-DADOS.md)** | MER, DER, modelo lógico e as decisões de modelagem                                                                        |
| **[docs/DEPLOY.md](docs/DEPLOY.md)**                   | Como o sistema vai para o ar e como cuidar dele depois                                                                    |
| **[docs/PROXIMOS-PASSOS.md](docs/PROXIMOS-PASSOS.md)** | Detalhamento técnico e sugestão de divisão de tarefas entre o grupo                                                       |

---

## Próximos passos

Ver **[docs/PROXIMOS-PASSOS.md](docs/PROXIMOS-PASSOS.md)** para o detalhamento técnico e a sugestão de divisão de tarefas entre o grupo.

---

## Equipe

Projeto acadêmico — disciplina de Fábrica de Software.
**Cliente:** Delícia Doces (contato: Dalila).
