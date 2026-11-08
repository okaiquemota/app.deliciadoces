# Publicação (deploy)

Como o sistema vai para o ar e como cuidar dele depois.

| Peça               | Onde                                                                 | Custo |
| ------------------ | -------------------------------------------------------------------- | ----- |
| Frontend + backend | Vercel (time `MovCode`, plano Hobby)                                 | R$ 0  |
| Banco de dados     | Supabase, projeto `app-deliciadoces`, região `sa-east-1` (São Paulo) | R$ 0  |
| Domínio            | — (usa a URL da Vercel)                                              | R$ 0  |

Região São Paulo foi escolhida de propósito: o banco perto de quem usa significa resposta mais rápida para a cliente.

---

## Como funciona a esteira

A `main` está ligada ao projeto na Vercel. **Todo push na `main` gera um deploy automático.** Não existe passo manual: mesclou a PR, o site atualiza sozinho em cerca de um minuto.

Pull requests geram um _preview_ com URL própria, o que permite mostrar uma tela para o grupo (ou para a Dalila) antes de mesclar.

---

## Variáveis de ambiente em produção

Configuradas em **Vercel → Settings → Environment Variables**. Nunca ficam no repositório.

| Variável              | Para que serve                                          |
| --------------------- | ------------------------------------------------------- |
| `DATABASE_URL`        | Conexão do dia a dia, via **pooler** (porta 6543)       |
| `DIRECT_DATABASE_URL` | Conexão **direta** (porta 5432), usada só por migration |
| `JWT_SECRET`          | Assina os tokens de sessão                              |
| `CORS_ORIGIN`         | URL do site em produção                                 |

As URLs saem do botão **Connect**, no topo da página do projeto no Supabase (a aba **ORM** já mostra no formato do Prisma).

### ⚠️ Na Vercel, use o pooler nas duas — nunca a "Direct connection"

A Vercel só faz conexão **IPv4**. A _Direct connection_ do Supabase (`db.<ref>.supabase.co:5432`) é **IPv6** no plano gratuito. Usar ela em produção resulta em erro de conexão com causa nada óbvia — parece banco fora do ar, mas é incompatibilidade de rede.

O pooler (Supavisor) é IPv4 em qualquer plano, e é por isso que as duas variáveis apontam para ele:

| Variável              | Qual copiar            | Porta  |
| --------------------- | ---------------------- | ------ |
| `DATABASE_URL`        | **Transaction pooler** | `6543` |
| `DIRECT_DATABASE_URL` | **Session pooler**     | `5432` |

A _Direct connection_ continua servindo para rodar migration e `pg_dump` **da máquina de vocês**, se a rede tiver IPv6.

### Por que duas URLs de banco

O modo transação distribui poucas conexões reais entre muitas chamadas — é o que permite ao serverless não estourar o limite do Postgres. Em compensação, ele não suporta os comandos de DDL (`CREATE TABLE`, `ALTER TABLE`) de que a migration precisa, nem _prepared statements_ nomeados. Daí a segunda URL, em modo sessão.

Localmente as duas apontam para o mesmo Postgres, e o código já trata isso: se `DIRECT_DATABASE_URL` não existir, ele usa `DATABASE_URL`.

---

## ⚠️ Segredos

**Nada de `.env` no Git.** Foi assim desde o primeiro commit e precisa continuar.

O `.env.example` tem valores de brincadeira (`troque-este-segredo-em-producao`, senha `deliciadoces123`). Eles servem para desenvolvimento e **não podem** ir para produção — qualquer pessoa que leia o repositório os conhece.

Para gerar um `JWT_SECRET` forte:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Trocar o `JWT_SECRET` **desloga todo mundo** na hora, porque invalida os tokens em circulação. É justamente o que se quer se houver suspeita de vazamento.

### ⚠️ Conta de apresentação

Existe em produção uma conta extra, de identificador e senha curtos, criada para demonstrar o sistema em projetor sem soletrar credencial longa. As credenciais **não ficam registradas aqui de propósito**: este repositório é público.

**Ela precisa ser removida antes de a cliente lançar dado real.** É uma credencial fraca num endereço público — enquanto existir, quem descobrir o link entra no financeiro da confeitaria.

O jeito certo é pelo próprio sistema: entrando com a conta da Dalila, **Minha conta → Equipe → a conta de apresentação → Tirar acesso**. Ela deixa de entrar na hora, inclusive quem estiver com o sistema aberto.

> ⚠️ **Não use `DELETE FROM usuarios WHERE email NOT LIKE '%@%'`**, que era a instrução antiga. Desde a tela Equipe, funcionárias podem entrar com usuário simples (sem `@`), e esse comando apagaria as contas delas junto.

> Por que dá para entrar com um identificador que não é e-mail: no **login** o campo serve apenas para localizar a conta, então aceita qualquer texto não vazio. E a tela **Equipe** cria conta com e-mail **ou** usuário simples (como `maria`), porque nem toda funcionária tem ou quer dar um e-mail.

### Senha da cliente

A conta da Dalila em produção é criada pela própria Equipe, com o link de acesso (abaixo): ela escolhe o e-mail e a senha, e ninguém mais sabe a senha. A conta que o seed criou, com o e-mail provisório `dalila@deliciadoces.com.br`, não era a dela e sai de produção (não tinha nenhum lançamento).

> **Não rode `npm run db:seed` em produção.** Ele recria a conta `dalila@deliciadoces.com.br` com a senha padrão do `.env.example`, que está neste repositório público.

A cliente troca a própria senha pelo sistema, em **Minha conta** (o nome dela no cabeçalho). A senha atual é exigida mesmo com a sessão aberta, para que quem encontre a tela destravada não consiga tomar a conta.

### Link de acesso: ela escolhe o e-mail e a senha

Para a Dalila (ou uma funcionária) entrar com um e-mail e uma senha que **só ela sabe**, sem ninguém ditar senha pelo WhatsApp.

**Pessoa nova:**

1. Entre com uma conta de administração.
2. **Minha conta → Equipe → Adicionar pessoa**: o nome, **E-mail e senha: Pelo link**, e o acesso (**Acesso completo** para a Dalila).
3. **Gerar link**, e toque em **WhatsApp** (ou **Copiar**).
4. Ela abre, escolhe o e-mail e a senha, e já entra no sistema.

Até ela usar o link, a Equipe mostra a pessoa como **esperando o link**, e ninguém consegue entrar na conta.

**Quem já tem conta** (esqueceu a senha, ou o e-mail mudou): **Equipe →** a pessoa **→ Link de acesso → Gerar e enviar**.

O link vale **uma vez só, por 3 dias**. Usado, morre; criar uma senha nova para a pessoa na Equipe também anula os links que estavam soltos. Perdeu o prazo, é só gerar outro. Não dá para gerar link da própria conta: a Minha conta exige a senha atual, e o link seria o atalho para pular essa conferência.

> O link vai depois do `#` no endereço (`/acesso#...`), parte que o navegador não envia ao servidor. Por isso ele não aparece nos logs da Vercel.

---

## ⚠️ Backup

O plano gratuito do Supabase **não faz backup automático**. Enquanto for dado de teste, tudo bem. No dia em que a Dalila lançar a primeira venda de verdade, deixa de ser.

Backup manual:

```bash
pg_dump "SUA_DIRECT_DATABASE_URL" > backup-$(date +%F).sql
```

Restaurar:

```bash
psql "SUA_DIRECT_DATABASE_URL" < backup-2026-09-14.sql
```

Duas coisas para combinar com o grupo antes do uso real:

1. **Quem roda o backup e com que frequência.** Semanal já resolve no começo. Um backup que ninguém roda não é backup.
2. **Onde o arquivo fica.** Não adianta guardar no mesmo lugar que pode falhar.

---

## ⚠️ Banco pausado

O Supabase **pausa o projeto gratuito** que passa uma semana com pouca consulta, e com ele o sistema inteiro sai do ar: o login responde "Erro interno do servidor". Segundo a documentação deles, "algumas requisições por dia" bastam para não pausar.

Já aconteceu duas vezes:

1. **Outubro de 2026**, depois de uma semana sem ninguém usar. A resposta foi um cron diário da Vercel chamando `/api/health`, que fazia um `SELECT 1`.
2. **Novembro de 2026**, mesmo com esse cron. Um `SELECT 1` por dia não bastou.

Por isso agora são **três agendadores independentes**, que chamam `/api/health` cerca de 9 vezes por dia. A rota lê a tabela `usuarios` (uma consulta de verdade, não um `SELECT 1`), e cada chamada faz o mesmo caminho de uma usuária: Vercel → pooler → banco. Se um deles parar, os outros seguram.

| Agendador          | Onde está                                                               | Quando (UTC)               | Onde conferir                                             |
| ------------------ | ----------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------- |
| **GitHub Actions** | `.github/workflows/manter-banco-ativo.yml`                              | 00:23, 06:23, 12:23, 18:23 | GitHub → **Actions** → _Manter banco ativo_               |
| **pg_cron**        | Dentro do próprio banco (migration `20261108200000_manter_banco_ativo`) | 03:47, 09:47, 15:47, 21:47 | Supabase → **Integrations → Cron** → `manter-banco-ativo` |
| **Vercel Cron**    | `vercel.json`, em `crons`                                               | 09:00                      | Vercel → o projeto → **Settings → Cron Jobs**             |

Por que cada um:

- **GitHub Actions** é o único que **avisa**. Se o banco não responder três vezes seguidas, a execução fica vermelha na aba Actions. Também dá para rodar na hora pelo botão **Run workflow**. O repositório é público, e o GitHub desliga agendamentos depois de 60 dias sem commit; o próprio workflow se religa a cada execução para isso não acontecer.
- **pg_cron** é o mesmo recurso usado no forlabs: o banco agenda a tarefa nele mesmo e faz a chamada HTTP com o `pg_net`. Não depende da Vercel nem do GitHub. A migration só age no Supabase; no Postgres local ela passa sem fazer nada.
- **Vercel Cron**: o plano Hobby só deixa rodar uma vez por dia, por isso sozinho não bastou. Fica como reforço.

> **A migration do pg_cron precisa ser aplicada em produção** (`npm run prisma:deploy --workspace=backend` com a `DIRECT_DATABASE_URL` de produção) depois que o banco estiver ativo. Ela pode rodar de novo sem problema.

**Se mesmo assim pausar:** Supabase → projeto `app-deliciadoces` → **Restore project**. Os dados continuam lá por até 90 dias. Atenção: o plano gratuito permite **só 2 projetos ativos por dono**, somando todas as organizações. Se o Supabase recusar a restauração por esse limite, é preciso pausar (ou excluir) outro projeto antes.

---

## Dados em produção

**O banco de produção contém apenas dados reais**, e é assim que deve continuar:

| O que tem                           | Por quê                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------- |
| A conta da Dalila                   | Acesso dela ao sistema (criada pelo link de acesso)                         |
| As 2 categorias internas de despesa | Engrenagem do lucro: separam saída de retirada pessoal. A cliente não as vê |

Nenhuma venda, produto, insumo ou despesa fictícia. Os números que aparecerem na tela serão os que a cliente (ou vocês, testando) realmente lançarem.

> Já houve dado de demonstração aqui e foi removido. A lição vale registrar: dado inventado em banco de produção parece inofensivo até alguém esquecer de limpar — e aí o primeiro fechamento de caixa da cliente vem com milhares de reais que nunca existiram.

### Se precisar de dados para testar

Existe um gerador (`npm run db:seed:demo`) que cria uma semana de operação fictícia: ingredientes, doces, produção, vendas e despesas. Ele passa pelos mesmos serviços que a interface usa, então os saldos ficam coerentes com o razão.

**Use só no banco local.** Para desfazer, no mesmo banco onde rodou:

```bash
npm run db:seed:demo -- --limpar
```

Remove tudo que ele criou, preservando a usuária.

---

## Segurança do banco

Todo projeto Supabase expõe automaticamente uma API REST (PostgREST) sobre as tabelas do schema `public`. Sem proteção, quem tivesse a chave anônima — que é pública por design — leria e escreveria direto nas tabelas, **passando por cima do login do sistema**.

Como esta aplicação não usa a API do Supabase (fala com o Postgres via Prisma, com o papel `postgres`, que ignora RLS), a proteção foi ligar **RLS em todas as tabelas sem criar nenhuma policy**. Resultado: a API pública não devolve nada e o sistema funciona normalmente.

> Se algum dia o projeto passar a usar o cliente do Supabase no frontend, este modelo muda por completo e cada tabela vai precisar de policy própria. Hoje não é o caso.

Para revisar: **Supabase → Advisors → Security**. O esperado é zero erro. Avisos do tipo "RLS enabled, no policy" são o comportamento desejado aqui, não um problema.

## Região da API

O `vercel.json` fixa as funções em **`gru1` (São Paulo)**, a mesma região do banco no Supabase (`sa-east-1`). Sem isso a Vercel usava `iad1` (Washington), e cada consulta ao banco atravessava o continente — e desde que a permissão passou a ser conferida no banco a cada requisição, toda chamada faz ao menos uma consulta. Se o banco mudar de região, esta linha muda junto.

## Limite de tentativas e o Firewall da Vercel

A API já freia quem erra senha demais e quem chama demais (`backend/src/middlewares/limites.js`). A contagem mora na memória de cada instância da função, então um ataque espalhado por várias instâncias é **freado, não barrado**.

O bloqueio forte é uma regra no **Firewall da Vercel**, que vale antes de a requisição chegar à função:

1. Vercel → projeto `app-deliciadoces` → **Firewall** → **Configure** → **New Rule**.
2. Se: **Request Path** igual a `/api/auth/login`.
3. Então: **Rate Limit**, por IP, 10 requisições a cada 60 segundos, ação **Deny** (ou **Challenge**).
4. **Save** e **Review Changes** → **Publish**.

> A regra de Rate Limit depende do plano da Vercel. Se a opção não aparecer em **Then**, o freio da própria API continua valendo sozinho.

## Cabeçalhos de segurança da página

Estão no `vercel.json`, em `headers`. O principal é a política de conteúdo (CSP): a página só carrega script, estilo, fonte e imagem do próprio sistema e só conversa com a própria API. Se algum dia entrar um recurso de fora (uma fonte do Google, um script de analytics), ele precisa ser liberado ali — senão o navegador bloqueia em silêncio, e o erro aparece no console como "Refused to load".

---

## Quando der problema

> **Variável nova exige deploy novo.** A Vercel congela as variáveis no momento do build: adicionar uma não afeta um deploy que já existe. Depois de mexer nelas, faça **Redeploy** (ou um push qualquer na `main`).

| Sintoma                                                  | Causa provável                                                          | Onde olhar                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| Site abre, login dá erro 500                             | Variável faltando, errada, ou adicionada sem redeploy                   | Vercel → Logs                       |
| `FUNCTION_INVOCATION_FAILED` sem log nenhum              | A função morreu ao carregar — quase sempre variável obrigatória ausente | Vercel → Runtime Logs               |
| Erro de conexão só em produção                           | Usou a _Direct connection_ (IPv6) em vez do pooler                      | Trocar pela Transaction pooler      |
| `Can't reach database server`                            | Projeto do Supabase pausado                                             | Painel do Supabase → despausar      |
| `/api/health` com 503 e `tenant/user … not found` no log | Projeto do Supabase pausado (o pooler não acha o banco)                 | Painel do Supabase → despausar      |
| Login diz "Erro interno do servidor"                     | Quase sempre o banco pausado (ver "Banco pausado")                      | Abrir `/api/health`                 |
| Deploy falha no build                                    | Erro de compilação                                                      | Vercel → Deployments → log do build |
| Login diz senha inválida                                 | Seed não rodou neste banco                                              | Conferir a tabela `usuarios`        |

Os logs do backend em produção ficam em **Vercel → o deploy → Runtime Logs**. Todo erro não tratado cai lá com a stack completa.
