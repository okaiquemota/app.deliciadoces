# Publicação (deploy)

Como o sistema vai para o ar e como cuidar dele depois.

| Peça | Onde | Custo |
|---|---|---|
| Frontend + backend | Vercel (time `MovCode`, plano Hobby) | R$ 0 |
| Banco de dados | Supabase, projeto `app-deliciadoces`, região `sa-east-1` (São Paulo) | R$ 0 |
| Domínio | — (usa a URL da Vercel) | R$ 0 |

Região São Paulo foi escolhida de propósito: o banco perto de quem usa significa resposta mais rápida para a cliente.

---

## Como funciona a esteira

A `main` está ligada ao projeto na Vercel. **Todo push na `main` gera um deploy automático.** Não existe passo manual: mesclou a PR, o site atualiza sozinho em cerca de um minuto.

Pull requests geram um *preview* com URL própria, o que permite mostrar uma tela para o grupo (ou para a Dalila) antes de mesclar.

---

## Variáveis de ambiente em produção

Configuradas em **Vercel → Settings → Environment Variables**. Nunca ficam no repositório.

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Conexão do dia a dia, via **pooler** (porta 6543) |
| `DIRECT_DATABASE_URL` | Conexão **direta** (porta 5432), usada só por migration |
| `JWT_SECRET` | Assina os tokens de sessão |
| `CORS_ORIGIN` | URL do site em produção |

As URLs saem do botão **Connect**, no topo da página do projeto no Supabase (a aba **ORM** já mostra no formato do Prisma).

### ⚠️ Na Vercel, use o pooler nas duas — nunca a "Direct connection"

A Vercel só faz conexão **IPv4**. A *Direct connection* do Supabase (`db.<ref>.supabase.co:5432`) é **IPv6** no plano gratuito. Usar ela em produção resulta em erro de conexão com causa nada óbvia — parece banco fora do ar, mas é incompatibilidade de rede.

O pooler (Supavisor) é IPv4 em qualquer plano, e é por isso que as duas variáveis apontam para ele:

| Variável | Qual copiar | Porta |
|---|---|---|
| `DATABASE_URL` | **Transaction pooler** | `6543` |
| `DIRECT_DATABASE_URL` | **Session pooler** | `5432` |

A *Direct connection* continua servindo para rodar migration e `pg_dump` **da máquina de vocês**, se a rede tiver IPv6.

### Por que duas URLs de banco

O modo transação distribui poucas conexões reais entre muitas chamadas — é o que permite ao serverless não estourar o limite do Postgres. Em compensação, ele não suporta os comandos de DDL (`CREATE TABLE`, `ALTER TABLE`) de que a migration precisa, nem *prepared statements* nomeados. Daí a segunda URL, em modo sessão.

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

### Senha da cliente

A conta da Dalila em produção tem senha própria, forte, diferente da do seed local.

> **Falta implementar:** o sistema ainda não tem tela de "trocar senha". Enquanto não existir, a troca é feita gerando um novo hash e atualizando o registro no banco. Vale priorizar isso antes de entregar o sistema para uso diário dela.

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

> Projeto gratuito do Supabase **pausa por inatividade** depois de alguns dias sem uso. Despausar é um clique no painel, mas se isso acontecer na véspera da apresentação, dá susto. Vale abrir o sistema uma vez por semana.

---

## Segurança do banco

Todo projeto Supabase expõe automaticamente uma API REST (PostgREST) sobre as tabelas do schema `public`. Sem proteção, quem tivesse a chave anônima — que é pública por design — leria e escreveria direto nas tabelas, **passando por cima do login do sistema**.

Como esta aplicação não usa a API do Supabase (fala com o Postgres via Prisma, com o papel `postgres`, que ignora RLS), a proteção foi ligar **RLS em todas as tabelas sem criar nenhuma policy**. Resultado: a API pública não devolve nada e o sistema funciona normalmente.

> Se algum dia o projeto passar a usar o cliente do Supabase no frontend, este modelo muda por completo e cada tabela vai precisar de policy própria. Hoje não é o caso.

Para revisar: **Supabase → Advisors → Security**. O esperado é zero erro. Avisos do tipo "RLS enabled, no policy" são o comportamento desejado aqui, não um problema.

---

## Quando der problema

> **Variável nova exige deploy novo.** A Vercel congela as variáveis no momento do build: adicionar uma não afeta um deploy que já existe. Depois de mexer nelas, faça **Redeploy** (ou um push qualquer na `main`).

| Sintoma | Causa provável | Onde olhar |
|---|---|---|
| Site abre, login dá erro 500 | Variável faltando, errada, ou adicionada sem redeploy | Vercel → Logs |
| `FUNCTION_INVOCATION_FAILED` sem log nenhum | A função morreu ao carregar — quase sempre variável obrigatória ausente | Vercel → Runtime Logs |
| Erro de conexão só em produção | Usou a *Direct connection* (IPv6) em vez do pooler | Trocar pela Transaction pooler |
| `Can't reach database server` | Projeto do Supabase pausado | Painel do Supabase → despausar |
| Deploy falha no build | Erro de compilação | Vercel → Deployments → log do build |
| Login diz senha inválida | Seed não rodou neste banco | Conferir a tabela `usuarios` |

Os logs do backend em produção ficam em **Vercel → o deploy → Runtime Logs**. Todo erro não tratado cai lá com a stack completa.
