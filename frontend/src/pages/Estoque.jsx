import { useCallback, useEffect, useState } from 'react';
import { Tabela } from '../components/Tabela.jsx';
import { Modal } from '../components/Modal.jsx';
import { Linha, Selecao, Texto } from '../components/Campo.jsx';
import {
  AjusteEstoque,
  SaldoComAlerta,
  avisarEstoqueMudou,
  lerNumero,
  quantosAcabando,
} from '../components/EstoqueComum.jsx';
import { estoque, insumos } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { data as formatarData, moeda, quantidade, UNIDADE_CURTA } from '../utils/formato.js';

const UNIDADES = Object.entries(UNIDADE_CURTA).map(([valor, rotulo]) => ({
  valor,
  rotulo: `${rotulo} (${valor.toLowerCase()})`,
}));

/** Dias até o vencimento que já pedem atenção — os mesmos 15 do menu. */
const AVISO_VALIDADE = 15;

/**
 * Estoque: o MATERIAL — ingredientes e embalagens. A pergunta desta tela
 * é "o que eu tenho para fazer os doces?".
 *
 * Os doces prontos moram na Produção, que responde "o que eu tenho para
 * vender?". O que já entrou e saiu, dos dois lados, mora no Kardex.
 *
 * Uma tabela só, com a VALIDADE como coluna. Antes ela tinha aba própria,
 * que listava compra por compra — inclusive as que já tinham sido usadas.
 * Aqui é uma data por ingrediente: a mais próxima do que está na
 * prateleira, contando que o mais antigo sai primeiro.
 *
 * As duas coisas que acontecem com um ingrediente estão na própria linha:
 * **Comprei** (o gesto de toda semana) e **Ajustar** (perdeu, ou a
 * contagem não bate).
 */
export function Estoque() {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);
  const [comprando, setComprando] = useState(null);
  const [ajustando, setAjustando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await insumos.listar());
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const acabando = quantosAcabando(lista);
  // Mesma régua do número no menu: vencido, ou vencendo em até 15 dias.
  const vencidos = lista.filter((i) => i.validade?.vencido).length;
  const vencendo = lista.filter(
    (i) => i.validade && !i.validade.vencido && i.validade.dias <= AVISO_VALIDADE
  ).length;

  const depoisDeSalvar = (fechar) => () => {
    fechar(null);
    carregar();
    avisarEstoqueMudou();
  };

  return (
    <section>
      <div className="barra-acoes">
        <span className="barra-acoes__resumo">
          {lista.length} ingrediente(s)
          {acabando > 0 && <span className="fechamento__falta"> · {acabando} acabando</span>}
          {vencidos > 0 && (
            <span className="fechamento__falta">
              {' '}
              · {vencidos} {vencidos === 1 ? 'vencido' : 'vencidos'}
            </span>
          )}
          {vencendo > 0 && <span className="fechamento__sobra"> · {vencendo} vencendo</span>}
        </span>
        <button className="botao botao--primario botao--auto" onClick={() => setEditando({})}>
          + Novo ingrediente
        </button>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      <Tabela
        carregando={carregando}
        dados={lista}
        vazio="Nenhum ingrediente cadastrado ainda."
        colunas={[
          { chave: 'nome', titulo: 'Ingrediente' },
          {
            chave: 'quantidadeAtual',
            titulo: 'Em estoque',
            render: (i) => <SaldoComAlerta item={i} />,
          },
          {
            chave: 'validade',
            titulo: 'Validade',
            render: (i) => <Validade insumo={i} />,
          },
          {
            chave: 'estoqueMinimo',
            titulo: 'Mínimo',
            render: (i) => quantidade(i.estoqueMinimo, i.unidade),
          },
          {
            chave: 'custoUnitario',
            titulo: 'Custo médio',
            alinhar: 'right',
            render: (i) => `${moeda(i.custoUnitario)}/${UNIDADE_CURTA[i.unidade] ?? i.unidade}`,
          },
          {
            chave: 'acoes',
            titulo: '',
            alinhar: 'right',
            render: (i) => (
              <span className="acoes-linha">
                <button className="botao botao--texto" onClick={() => setComprando(i)}>
                  Comprei
                </button>
                <button className="botao botao--texto" onClick={() => setAjustando(i)}>
                  Ajustar
                </button>
                <button className="botao botao--texto" onClick={() => setEditando(i)}>
                  Editar
                </button>
              </span>
            ),
          },
        ]}
      />

      {editando && (
        <FormularioInsumo
          insumo={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={depoisDeSalvar(setEditando)}
        />
      )}
      {comprando && (
        <FormularioCompra
          insumo={comprando}
          aoFechar={() => setComprando(null)}
          aoSalvar={depoisDeSalvar(setComprando)}
        />
      )}
      {ajustando && (
        <AjusteEstoque
          alvo={ajustando}
          tipoAlvo="insumo"
          aoFechar={() => setAjustando(null)}
          aoSalvar={depoisDeSalvar(setAjustando)}
        />
      )}
    </section>
  );
}

/**
 * A validade em palavras: "vencido há 3 dias" diz o que fazer; "-3" não.
 *
 * Vencido e vencendo têm cores diferentes porque a ação é oposta: um vai
 * pro lixo, o outro se usa primeiro. Longe do vencimento, a data basta.
 *
 * Quando só PARTE do que tem vence naquela data, a segunda linha diz
 * quanto — "vence em 5 dias" com 4 latas no estoque é outra urgência se
 * for uma lata só.
 */
function Validade({ insumo }) {
  const v = insumo.validade;
  if (!v) return <span className="validade__nada">—</span>;

  const d = Math.abs(v.dias);
  let texto;
  let classe;
  if (v.vencido) {
    texto = `vencido há ${d === 1 ? '1 dia' : `${d} dias`}`;
    classe = 'fechamento__falta';
  } else if (v.dias === 0) {
    texto = 'vence hoje';
    classe = 'fechamento__sobra';
  } else if (v.dias === 1) {
    texto = 'vence amanhã';
    classe = 'fechamento__sobra';
  } else if (v.dias <= 30) {
    texto = `vence em ${v.dias} dias`;
    classe = v.dias <= AVISO_VALIDADE ? 'fechamento__sobra' : undefined;
  } else {
    texto = `vence ${formatarData(v.validade)}`;
  }

  const parte = Number(v.quantidade) < Number(insumo.quantidadeAtual);
  return (
    <span className="validade">
      <span className={classe}>{texto}</span>
      {parte && (
        <span className="validade__parte">só {quantidade(v.quantidade, insumo.unidade)}</span>
      )}
    </span>
  );
}

function FormularioInsumo({ insumo, aoFechar, aoSalvar }) {
  const edicao = Boolean(insumo.id);
  const [form, setForm] = useState({
    nome: insumo.nome ?? '',
    unidade: insumo.unidade ?? 'KG',
    estoqueMinimo: insumo.estoqueMinimo ?? 0,
    controlaValidade: insumo.controlaValidade ?? false,
    fornecedorPadrao: insumo.fornecedorPadrao ?? '',
  });
  const [erro, setErro] = useState('');
  const campo = (nome) => (e) => setForm((f) => ({ ...f, [nome]: e.target.value }));

  async function enviar(e) {
    e.preventDefault();
    try {
      const corpo = {
        ...form,
        estoqueMinimo: Number(form.estoqueMinimo),
        fornecedorPadrao: form.fornecedorPadrao || null,
      };
      if (edicao) await insumos.atualizar(insumo.id, corpo);
      else await insumos.criar(corpo);
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={edicao ? 'Editar ingrediente' : 'Novo ingrediente'}>
      <form onSubmit={enviar}>
        <Texto rotulo="Nome" value={form.nome} onChange={campo('nome')} required />
        <Linha>
          <Selecao
            rotulo="Unidade"
            value={form.unidade}
            onChange={campo('unidade')}
            opcoes={UNIDADES}
          />
          <Texto
            rotulo="Estoque mínimo"
            type="number"
            step="any"
            min="0"
            value={form.estoqueMinimo}
            onChange={campo('estoqueMinimo')}
            dica="Avisa quando chegar nesse nível"
          />
        </Linha>
        <Texto
          rotulo="Fornecedor habitual (opcional)"
          value={form.fornecedorPadrao}
          onChange={campo('fornecedorPadrao')}
        />
        <label className="campo campo--inline">
          <input
            type="checkbox"
            checked={form.controlaValidade}
            onChange={(e) => setForm((f) => ({ ...f, controlaValidade: e.target.checked }))}
          />
          <span>Controlar validade nas compras</span>
        </label>

        {erro && <p className="alerta alerta--erro">{erro}</p>}
        <button type="submit" className="botao botao--primario">
          Salvar
        </button>
      </form>
    </Modal>
  );
}

/**
 * Comprei: quanto entrou e quanto pagou.
 *
 * Pede o TOTAL pago, e não o preço por unidade. É o número que está na
 * nota e no extrato; o preço do quilo, com a lata de 395 g, ela teria que
 * calcular de cabeça. A conta é do sistema, e é ela que atualiza o custo
 * médio que alimenta o custo de cada lote na Produção.
 */
function FormularioCompra({ insumo, aoFechar, aoSalvar }) {
  const [qtd, setQtd] = useState('');
  const [total, setTotal] = useState('');
  const [validade, setValidade] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const unidade = UNIDADE_CURTA[insumo.unidade] ?? insumo.unidade;
  const n = lerNumero(qtd);
  const pago = lerNumero(total);
  const porUnidade = n > 0 && pago > 0 ? pago / n : null;

  async function enviar(e) {
    e.preventDefault();
    if (!(n > 0)) {
      setErro('Informe quanto comprou.');
      return;
    }
    if (total.trim() && !(pago > 0)) {
      setErro('O valor pago não é um número válido.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await estoque.movimentar({
        tipo: 'ENTRADA_COMPRA',
        insumoId: insumo.id,
        quantidade: n,
        custoUnitario: porUnidade ? Number(porUnidade.toFixed(4)) : null,
        validade: validade || null,
      });
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  const mudar = (setter) => (e) => {
    setter(e.target.value);
    setErro('');
  };

  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Comprei ${insumo.nome}`} largura={460}>
      <form onSubmit={enviar}>
        <p className="ajuste__atual">
          Tem agora <strong>{quantidade(insumo.quantidadeAtual, insumo.unidade)}</strong>
          {n > 0 && (
            <>
              {' '}
              → vai ficar com{' '}
              <strong>{quantidade(Number(insumo.quantidadeAtual) + n, insumo.unidade)}</strong>
            </>
          )}
        </p>
        <Linha>
          <Texto
            rotulo={`Quanto comprou (${unidade})`}
            type="text"
            inputMode="decimal"
            value={qtd}
            onChange={mudar(setQtd)}
            required
            autoFocus
          />
          <Texto
            rotulo="Quanto pagou (R$)"
            type="text"
            inputMode="decimal"
            placeholder="Opcional"
            value={total}
            onChange={mudar(setTotal)}
          />
        </Linha>
        {porUnidade && (
          <p className="ajuste__atual">
            Sai a <strong>{moeda(porUnidade)}</strong> por {unidade}.
          </p>
        )}
        {insumo.controlaValidade && (
          <Texto rotulo="Validade" type="date" value={validade} onChange={mudar(setValidade)} />
        )}

        {erro && (
          <p className="alerta alerta--erro" role="alert">
            {erro}
          </p>
        )}
        <div className="modal__acoes">
          <button type="button" className="botao botao--auto" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao--primario botao--auto" disabled={salvando}>
            {salvando ? 'Registrando...' : 'Registrar compra'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
