# 🍰 app.deliciadoces

Sistema de gestão empresarial para a **Delícia Doces**, confeitaria com mais de 20 anos de mercado — controle de fluxo de caixa, estoque e contas a pagar/receber, com dashboard financeiro.

Projeto acadêmico da disciplina de **Fábrica de Software**.

> ⚠️ **Status: setup inicial.** A reunião de levantamento de requisitos com a cliente (Dalila) **ainda não aconteceu**. O modelo de dados e o escopo dos módulos são um primeiro rascunho e devem ser revisados após a reunião.

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

| Módulo | Descrição |
|---|---|
| **Financeiro / Fluxo de caixa** | Lançamento e acompanhamento de entradas e saídas |
| **Estoque** | Cadastro de produtos e controle de movimentações |
| **Relatórios / Dashboard** | Visão consolidada e exportação de dados |

## Estratégia de entrega

O prazo vai até o fim do semestre letivo, então o escopo foi dividido em duas fases. A ideia é ter algo **funcionando de ponta a ponta** cedo, em vez de vários módulos pela metade.

**Fase 1 — MVP**
- Lançamento de entradas e saídas de caixa
- Estoque básico (cadastro de produtos + movimentações)
- Dashboard simples com os números consolidados

**Fase 2 — Avançado**
- Alertas (estoque baixo, contas vencendo)
- Relatórios exportáveis
- Refinamentos de usabilidade

---

## Stack

| Camada | Tecnologia | Versão | Por quê |
|---|---|---|---|
| Backend | Node.js + Express | 5.x | Stack definida pelo grupo; Express 5 já trata erros de `async` automaticamente |
| Banco | PostgreSQL | 16+ | Relacional, adequado a dados financeiros |
| ORM | Prisma | 7.x | Schema declarativo e migrations versionadas |
| Autenticação | JWT | — | Stateless, simples de consumir pelo React |
| Frontend | React + Vite | 19.x / 8.x | Vite substitui o Create React App, que foi descontinuado |
| Roteamento | React Router | 7.x | Padrão de mercado para SPA |
| HTTP | Axios | 1.x | Interceptors facilitam anexar o token JWT |
| Validação | Zod | 4.x | Valida a entrada da API antes de chegar na regra de negócio |

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
e-mail: admin@deliciadoces.local
senha:  admin123
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

> 💡 O frontend chama a API através de um *proxy* configurado no Vite, então não é preciso mexer em CORS durante o desenvolvimento.

### Deu problema?

| Erro | Causa provável | Solução |
|---|---|---|
| `Variáveis de ambiente obrigatórias não definidas` | Falta o `.env` | Refaça o passo 4 |
| `Can't reach database server` | PostgreSQL parado ou senha errada | Confira se o serviço está no ar e revise a `DATABASE_URL` |
| `Database deliciadoces does not exist` | Banco não foi criado | Refaça o passo 3 |
| Tela de login não carrega | Backend fora do ar | Confira o Terminal 1 e acesse http://localhost:3333/api/health |
| `port 5173 is in use` | Outra aplicação na porta | Feche a outra ou mude a porta em `frontend/vite.config.js` |
| `Named export 'PrismaClient' not found` | Prisma Client não foi gerado | `npm run prisma:generate` |
| `relation "usuarios" does not exist` | Migrations não aplicadas | `npm run prisma:migrate` |
| Login diz "E-mail ou senha inválidos" com a senha certa | Seed não rodou | `npm run db:seed` |

---

## Scripts disponíveis

Rodando na **raiz** do projeto:

| Comando | O que faz |
|---|---|
| `npm run dev:backend` | Sobe a API em modo de desenvolvimento (reinicia ao salvar) |
| `npm run dev:frontend` | Sobe a interface em modo de desenvolvimento |
| `npm run build` | Gera a build de produção do frontend |
| `npm run prisma:migrate` | Cria/aplica migrations no banco |
| `npm run prisma:generate` | Regera o Prisma Client após mudar o schema |
| `npm run prisma:studio` | Abre uma interface visual para navegar no banco |
| `npm run db:seed` | Popula o banco com dados iniciais |

> Depois de **qualquer alteração** no `schema.prisma`, rode `npm run prisma:migrate`.

---

## Modelo de dados

> 🚧 **Rascunho v0.1** — criado antes da reunião com a cliente. Foi mantido simples de propósito, para ser fácil de mudar.

```
Usuario ──┬──< MovimentacaoCaixa >──── ContaPagarReceber
          ├──< MovimentacaoEstoque >── Produto
          └──< ContaPagarReceber
```

| Entidade | Representa | Observações |
|---|---|---|
| `Usuario` | Quem acessa o sistema | Papéis `ADMIN` e `OPERADOR` |
| `Produto` | Item de estoque | Guarda o saldo atual e o estoque mínimo |
| `MovimentacaoEstoque` | Entrada/saída de produto | Histórico completo, nunca apagado |
| `MovimentacaoCaixa` | Lançamento financeiro | Pode estar ligado a uma conta |
| `ContaPagarReceber` | Compromisso com vencimento | `PENDENTE`, `QUITADA` ou `CANCELADA` |

### Escolhas que valem explicar

- **Nada é apagado de verdade.** `Usuario` e `Produto` têm uma flag `ativo` (*soft delete*). Apagar um produto que já tem movimentações destruiria o histórico financeiro.
- **`dataMovimentacao` é diferente de `criadoEm`.** A cliente pode lançar hoje uma venda que aconteceu ontem. Uma data é a do fato, a outra é a do registro.
- **Quantidades são `Decimal(10,3)`.** Confeitaria trabalha com peso: `0,250 kg` de chocolate não cabe em um número inteiro.
- **Categoria e forma de pagamento são texto livre.** Viram lista fechada (`enum`) ou tabela própria só depois que soubermos os valores que a cliente realmente usa.
- **O vínculo entre conta e caixa é uma lista.** Uma conta pode gerar vários lançamentos, caso a cliente pague parcelado.

### ⚠️ Perguntas a levar para a reunião com a Dalila

- Quantas pessoas usam o sistema? Precisam de permissões diferentes?
- Quais unidades de medida ela usa no estoque? (kg, un, L, caixa...)
- Ela controla insumos (farinha, açúcar) ou só produtos prontos? Os dois?
- Como são as categorias de despesa e receita hoje?
- Quais formas de pagamento aceita?
- Ela precisa de cadastro de fornecedores e clientes, ou o nome em texto basta?
- Contas parceladas acontecem? Com que frequência?
- Qual relatório ela mais precisaria ter em mãos?

---

## Autenticação

O fluxo é o padrão JWT:

1. O usuário envia e-mail e senha em `POST /api/auth/login`.
2. A API confere a senha (comparando com o hash **bcrypt**) e devolve um token.
3. O frontend guarda o token e o envia em toda requisição no header `Authorization: Bearer <token>`.
4. O middleware `autenticar` valida o token e popula `req.usuario`.

### Endpoints já disponíveis

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/health` | Público | Verifica se a API está no ar |
| `POST` | `/api/auth/login` | Público | Autentica e devolve o token |
| `GET` | `/api/auth/eu` | Autenticado | Dados do usuário logado |
| `POST` | `/api/auth/registrar` | Apenas `ADMIN` | Cadastra um novo usuário |

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
- **sem correção disponível** no momento — `npm audit fix --force` só faria *downgrade* do Prisma para uma versão mais antiga, que tem o mesmo alerta.

Ou seja: é ruído conhecido, não uma falha do nosso código. Vale reavaliar quando o Prisma publicar uma correção.

---

## Próximos passos

Ver **[docs/PROXIMOS-PASSOS.md](docs/PROXIMOS-PASSOS.md)** para o detalhamento técnico e a sugestão de divisão de tarefas entre o grupo.

---

## Equipe

Projeto acadêmico — disciplina de Fábrica de Software.
**Cliente:** Delícia Doces (contato: Dalila).
