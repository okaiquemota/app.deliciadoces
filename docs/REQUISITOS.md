# Documento de Requisitos

**Projeto:** app.deliciadoces — sistema de gestão para confeitaria
**Cliente:** Delícia Doces (contato: Dalila)
**Origem dos requisitos:** formulário de levantamento respondido pela cliente em 14/09, mais os ajustes pedidos por ela ao longo do desenvolvimento

---

## 1. Contexto

A Delícia Doces é uma confeitaria de pequeno porte. Hoje o controle é feito no papel e na memória, o que gera três problemas que a cliente relatou:

1. **Ela não sabe se o mês fechou no lucro.** Dinheiro pessoal e do negócio se misturam, então o que sobra na conta não diz nada sobre o resultado.
2. **Falta ingrediente no meio da produção.** Não há aviso de que algo está acabando.
3. **Ingrediente vence sem ser usado**, e o prejuízo só aparece na hora de jogar fora.

A restrição que atravessa todo o projeto está na palavra dela: _"o sistema precisa ser simples e prático pois devido à correria não tenho muito tempo pra mexer"_. Isso não é um desejo estético — é um critério de aceitação. Funcionalidade que exige muitos passos não vai ser usada, e sistema não usado não resolve nenhum dos três problemas.

---

## 2. Escopo

### 2.1 Dentro do escopo

Controle de caixa (entradas e saídas), controle de estoque em dois níveis (ingredientes e doces prontos), registro de produção, fechamento diário de caixa, controle de validade e visão de resultado por período.

### 2.2 Fora do escopo, e por quê

| Não incluído                          | Motivo                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Contas a receber                      | A cliente não vende fiado: recebe tudo na entrega                                                             |
| Parcelamento e sinal                  | Mesma razão                                                                                                   |
| Emissão de nota fiscal                | Não solicitado; exigiria integração com SEFAZ                                                                 |
| Cadastro de clientes                  | Ela não costuma anotar quem comprou                                                                           |
| Multiusuário com permissões distintas | Só ela opera hoje. O campo `papel` existe no modelo, preparado, mas a regra de restrição não foi implementada |
| Saldo por lote de validade            | Exigiria amarrar cada saída a uma entrada específica; ver §6.2                                                |

---

## 3. Atores

| Ator              | Descrição                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Administrador** | A Dalila. Acesso total: lança, edita, cancela e vê resultado financeiro                                           |
| **Operador**      | Previsto no modelo para uso futuro: lançaria venda e estoque sem ver o resultado financeiro. **Não implementado** |

---

## 4. Requisitos Funcionais

Prioridade: **E** = essencial · **I** = importante · **D** = desejável

### 4.1 Autenticação e conta

| ID   | Requisito                                                                              | Prior. |
| ---- | -------------------------------------------------------------------------------------- | ------ |
| RF01 | O sistema deve exigir autenticação para qualquer operação que não seja o login         | E      |
| RF02 | O sistema deve permitir que o usuário troque a própria senha, informando a senha atual | I      |
| RF03 | O sistema deve encerrar a sessão quando o token expirar, levando o usuário ao login    | E      |

### 4.2 Caixa — entradas e saídas

| ID   | Requisito                                                                                                | Prior. |
| ---- | -------------------------------------------------------------------------------------------------------- | ------ |
| RF04 | O sistema deve registrar venda com os doces vendidos, calculando o total a partir do preço cadastrado    | E      |
| RF05 | O sistema deve registrar entrada de dinheiro **sem identificar produto**, informando apenas o valor      | E      |
| RF06 | O sistema deve avisar, ao registrar entrada sem produto, que aquele lançamento não baixa estoque         | E      |
| RF07 | O sistema deve registrar saída de dinheiro (despesa), com a descrição do que foi, sem pedir categoria    | E      |
| RF08 | O sistema deve registrar retirada pessoal separadamente das despesas do negócio                          | E      |
| RF09 | O sistema deve permitir editar uma venda já lançada, corrigindo o estoque de acordo                      | E      |
| RF10 | O sistema deve permitir cancelar uma venda, devolvendo os produtos ao estoque, **sem apagar o registro** | E      |
| RF11 | O sistema deve permitir reabrir uma venda cancelada                                                      | D      |
| RF12 | O sistema deve listar vendas e despesas por período                                                      | E      |

### 4.3 Estoque

| ID   | Requisito                                                                                     | Prior. |
| ---- | --------------------------------------------------------------------------------------------- | ------ |
| RF13 | O sistema deve manter cadastro de ingredientes com unidade, estoque mínimo e custo            | E      |
| RF14 | O sistema deve manter cadastro de doces prontos com preço de venda e estoque mínimo           | E      |
| RF15 | O sistema deve registrar entrada de ingrediente por compra, com validade e custo              | E      |
| RF16 | O sistema deve registrar perda, exigindo motivo                                               | I      |
| RF17 | O sistema deve registrar ajuste manual de saldo, exigindo motivo                              | I      |
| RF18 | O sistema deve baixar o doce do estoque automaticamente quando ele é vendido                  | E      |
| RF19 | O sistema deve manter histórico de toda entrada e saída, com a origem do lançamento           | E      |
| RF20 | O sistema deve avisar quando um item estiver no estoque mínimo ou abaixo                      | E      |
| RF21 | O sistema deve listar os lotes com validade, filtrando por vencidos, 7 dias, 30 dias ou todos | I      |
| RF22 | O sistema deve distinguir visualmente lote **vencido** de lote **a vencer**                   | I      |
| RF23 | O sistema deve recalcular o saldo a partir do histórico, para corrigir divergência            | D      |

### 4.4 Produção

| ID   | Requisito                                                                                            | Prior. |
| ---- | ---------------------------------------------------------------------------------------------------- | ------ |
| RF24 | O sistema deve registrar lote produzido, gerando doce pronto e consumindo ingredientes               | E      |
| RF25 | O sistema deve permitir registrar produção **sem ficha técnica**, informando os ingredientes na hora | E      |
| RF26 | O sistema deve permitir cadastrar ficha técnica opcional por produto                                 | I      |
| RF27 | O sistema deve prever o consumo de ingredientes antes de confirmar a produção                        | D      |

### 4.5 Fechamento diário

| ID   | Requisito                                                                                                   | Prior. |
| ---- | ----------------------------------------------------------------------------------------------------------- | ------ |
| RF28 | O sistema deve calcular quanto deveria haver na gaveta ao fim do dia, considerando **apenas dinheiro vivo** | E      |
| RF29 | O sistema deve registrar quanto foi contado de fato e apresentar a diferença                                | E      |
| RF30 | O sistema deve usar como saldo de abertura o valor **contado** no dia anterior                              | I      |
| RF31 | O sistema deve recalcular a diferença se houver lançamento posterior ao fechamento                          | I      |
| RF32 | O sistema deve impedir fechar o mesmo dia duas vezes                                                        | I      |

### 4.6 Resultado

| ID   | Requisito                                                                       | Prior. |
| ---- | ------------------------------------------------------------------------------- | ------ |
| RF33 | O sistema deve apresentar vendas, custos e lucro por período                    | E      |
| RF34 | O sistema deve separar retirada pessoal do custo do negócio no cálculo de lucro | E      |
| RF35 | O sistema deve apresentar o movimento diário do período em gráfico              | D      |
| RF36 | O sistema deve apresentar a distribuição de vendas por forma de pagamento       | D      |

---

## 5. Requisitos Não Funcionais

| ID    | Requisito                                                                                  | Critério de verificação                              |
| ----- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| RNF01 | O sistema deve funcionar em celular, onde a cliente lança venda no balcão                  | Nenhuma tela rola lateralmente em 390px nem em 360px |
| RNF02 | Alvos de toque devem ter no mínimo 44px de altura nos controles de uso constante           | Medição em navegador com ponteiro grosso             |
| RNF03 | O contraste de texto deve atender WCAG AA (4,5:1 para texto normal)                        | Cálculo de razão de contraste da paleta              |
| RNF04 | Registrar uma venda comum deve levar no máximo 3 toques além da escolha dos produtos       | Contagem no fluxo real                               |
| RNF05 | O saldo de estoque nunca pode divergir do histórico de movimentações                       | Teste automatizado que soma o histórico e compara    |
| RNF06 | Toda alteração de estoque deve ser atômica: movimentação e saldo mudam juntos ou nada muda | Uso de transação; teste de falha no meio             |
| RNF07 | O preço de venda deve ser definido pelo servidor, nunca pelo cliente da API                | Teste que envia preço adulterado e confere o total   |
| RNF08 | Senhas devem ser armazenadas como hash, nunca em texto                                     | Teste que inspeciona o campo gravado                 |
| RNF09 | O sistema deve estar disponível pela internet, sem instalação                              | Publicado em URL pública                             |
| RNF10 | O código deve seguir um padrão único entre os integrantes do grupo                         | ESLint e Prettier no monorepo, sem erro              |

---

## 6. Regras de Negócio

| ID   | Regra                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| RN01 | Toda venda é à vista. Não existe fiado, parcela ou sinal                                                                       |
| RN02 | O preço do item é **congelado** no momento da venda: mudar o preço do produto depois não altera venda antiga                   |
| RN03 | Venda cancelada **não é apagada**: a linha permanece marcada como cancelada e o estoque é devolvido                            |
| RN04 | `quantidadeAtual` é cache do histórico de movimentações. Só o `estoqueService` escreve nesse campo, sempre dentro de transação |
| RN05 | Uma movimentação se refere a **exatamente um** entre ingrediente e produto, nunca aos dois                                     |
| RN06 | Perda e ajuste exigem motivo registrado                                                                                        |
| RN07 | Retirada pessoal reduz o caixa mas **não** é custo do negócio: não entra no cálculo de lucro                                   |
| RN08 | No fechamento diário, retirada pessoal **conta** como saída: da gaveta o dinheiro saiu de verdade                              |
| RN09 | Só dinheiro vivo entra no cálculo do fechamento. Venda no Pix ou cartão não passa pela gaveta                                  |
| RN10 | Despesa sem forma de pagamento informada é contada como dinheiro, e a tela informa quantas foram assumidas assim               |
| RN11 | O dia abre com o saldo **contado** no dia anterior, não com o calculado                                                        |
| RN12 | Entrada de dinheiro sem produto informado **não** movimenta estoque                                                            |
| RN13 | Não é permitido informar produtos e valor avulso na mesma venda                                                                |
| RN14 | Ingrediente e produto têm nome único: cadastro duplicado racharia o saldo em dois                                              |
| RN15 | Cadastro não é excluído, é inativado, para não quebrar o histórico                                                             |

### 6.1 Sobre RN09 — por que só dinheiro vivo

Se o saldo esperado somasse todas as vendas, a diferença daria errada todo dia, sempre no mesmo sentido, e a cliente aprenderia a ignorar o número — o pior resultado possível para uma ferramenta de conferência. As demais formas de pagamento aparecem à parte na tela, para não parecer que o sistema perdeu venda.

### 6.2 Limite conhecido — saldo por lote

O sistema registra a validade na entrada de compra, mas **não sabe quanto resta de cada lote**, porque as saídas não apontam para qual entrada baixaram. A tela de validade mostra a quantidade que **entrou** e declara isso explicitamente.

Rastrear saldo por lote exigiria amarrar cada saída a uma entrada, alterando como a venda dá baixa. Foi avaliado e adiado: mostrar o número certo com o rótulo certo é mais honesto do que apresentar um saldo por lote que o dado não sustenta.

### 6.3 Limite conhecido — estoque negativo

Uma venda pode levar o estoque a negativo, porque a produção nem sempre é lançada. Isso é **deliberado**: travar a venda por causa de registro pendente impediria a cliente de registrar dinheiro que entrou de verdade. O saldo negativo funciona como sinal de que falta lançar produção.

---

## 7. Rastreabilidade

Cada requisito, onde ele vive no código.

| Requisito  | Rota da API                                   | Tela                              | Teste                                            |
| ---------- | --------------------------------------------- | --------------------------------- | ------------------------------------------------ |
| RF01, RF03 | `POST /api/auth/login`                        | Login                             | —                                                |
| RF02       | `PATCH /api/auth/senha`                       | Minha conta                       | `tests/senha.test.js`                            |
| RF04, RF09 | `POST` e `PUT /api/vendas`                    | Início → Venda; Caixa             | `tests/caixa.test.js`                            |
| RF05, RF06 | `POST /api/vendas` (campo `valor`)            | Início → Entrada avulsa           | `tests/caixa.test.js`                            |
| RF07, RF08 | `POST /api/despesas`                          | Início → Saída / Retirada pessoal | `tests/caixa.test.js`, `tests/dashboard.test.js` |
| RF10, RF11 | `PATCH /api/vendas/:id/cancelar` e `/reabrir` | Caixa                             | `tests/caixa.test.js`                            |
| RF12       | `GET /api/vendas`, `GET /api/despesas`        | Caixa (extrato)                   | `tests/periodo.test.js`                          |
| RF13, RF14 | `/api/insumos`, `/api/produtos`               | Estoque                           | —                                                |
| RF15–RF17  | `POST /api/estoque/movimentacoes`             | Estoque → Movimentar              | `tests/estoque.test.js`                          |
| RF18       | (efeito de `POST /api/vendas`)                | —                                 | `tests/caixa.test.js`                            |
| RF19       | `GET /api/estoque/movimentacoes`              | Estoque → Histórico               | `tests/estoque.test.js`                          |
| RF20       | `GET /api/estoque/alertas`                    | Início (faixa de alerta)          | `tests/validade.test.js`                         |
| RF21, RF22 | `GET /api/estoque/validades`                  | Estoque → Validade                | `tests/validade.test.js`                         |
| RF23       | `POST /api/estoque/recalcular`                | —                                 | `tests/estoque.test.js`                          |
| RF24–RF26  | `POST /api/producoes`                         | Produção                          | `tests/producao.test.js`                         |
| RF27       | `GET /api/producoes/previsao`                 | Produção                          | `tests/producao.test.js`                         |
| RF28–RF32  | `/api/fechamentos`                            | Fechamento                        | `tests/fechamento.test.js`                       |
| RF33–RF36  | `GET /api/dashboard`                          | Resumo                            | —                                                |

---

## 8. Validação dos requisitos

A suíte automatizada tem **79 testes**, concentrados nas regras onde um erro corrompe dado em silêncio — estoque, caixa, produção, fechamento e validade.

Para conferir que os testes pegam erro de verdade e não apenas acompanham o código, foram introduzidas **sabotagens propositais** no comportamento e verificado que a suíte falha em cada uma. Entre elas: inverter a direção da movimentação de estoque, aceitar preço vindo do cliente, cancelar venda sem devolver o estoque, somar Pix no fechamento de gaveta, abrir o dia pelo saldo calculado em vez do contado, e tratar lote que vence hoje como já vencido. Todas foram detectadas.

Os requisitos não funcionais de interface (RNF01 a RNF04) foram verificados por medição em navegador nas resoluções 360×800, 390×844 e 1280×800.
