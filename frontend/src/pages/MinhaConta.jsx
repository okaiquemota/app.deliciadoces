import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Modal } from '../components/Modal.jsx';
import { Texto } from '../components/Campo.jsx';
import { Segmentado } from '../components/Segmentado.jsx';
import { Dado } from '../components/Extrato.jsx';
import {
  IconeNome,
  IconeEmail,
  IconeSenha,
  IconeSeta,
  IconePessoa,
  IconeMais,
} from '../components/Icones.jsx';
import { authService } from '../services/authService.js';
import { equipe } from '../services/recursos.js';
import { mensagemDeErro } from '../services/api.js';
import { data as formatarData } from '../utils/formato.js';

/**
 * Conta do usuário: nome, e-mail de acesso e senha.
 *
 * A tela MOSTRA os dados, e cada um se edita à parte — o desenho da
 * página de perfil do Mercado Livre. Uma lista com ícone, o valor, uma
 * legenda dizendo o que ele é, e a seta indicando que a linha abre.
 *
 * O resto segue as outras telas: largura toda a partir da mesma margem,
 * sem título visível no topo (o nome da seção está no menu e no `h1`
 * do leitor de tela), e cartões com o título em versalete, como os do
 * Resumo e do Fechamento.
 *
 * Formulário aberto o tempo todo convida a mexer sem querer, e obriga a
 * ler seis campos para achar o nome. Aqui ela vê os três dados de relance
 * e só encontra campo quando decidiu mudar alguma coisa. Cada edição mora
 * numa janela própria, a mesma da Venda e da Entrada.
 *
 * Para a administração, embaixo, a Equipe: quem tem acesso ao sistema.
 */
export function MinhaConta() {
  const { usuario, admin } = useAuth();
  const [editando, setEditando] = useState(null);
  const [aviso, setAviso] = useState('');

  function abrir(item) {
    setAviso('');
    setEditando(item);
  }

  function concluir(mensagem) {
    setEditando(null);
    setAviso(mensagem);
  }

  const fechar = () => setEditando(null);

  return (
    <section className="perfil">
      {/* A confirmação aparece na página, depois que a janela fecha: é
          aqui que ela vê o valor novo já no lugar. */}
      {aviso && (
        <p className="alerta alerta--ok" role="status">
          {aviso}
        </p>
      )}

      <Grupo titulo="Informações pessoais">
        <Item Icone={IconeNome} valor={usuario?.nome} rotulo="Nome" onClick={() => abrir('nome')} />
        <Item
          Icone={IconeEmail}
          valor={usuario?.email}
          rotulo={usuario?.email?.includes('@') ? 'E-mail de acesso' : 'Usuário de acesso'}
          onClick={() => abrir('email')}
        />
      </Grupo>

      <Grupo titulo="Segurança">
        <Item Icone={IconeSenha} valor="••••••••" rotulo="Senha" onClick={() => abrir('senha')} />
      </Grupo>

      {admin && <Equipe aoAviso={setAviso} />}

      {/* Montadas só enquanto abertas: cada abertura começa com o
          formulário limpo, sem resto da tentativa anterior. */}
      {editando === 'nome' && <EditarNome aoFechar={fechar} aoConcluir={concluir} />}
      {editando === 'email' && <EditarEmail aoFechar={fechar} aoConcluir={concluir} />}
      {editando === 'senha' && <EditarSenha aoFechar={fechar} aoConcluir={concluir} />}
    </section>
  );
}

function Grupo({ titulo, children }) {
  return (
    <section className="cartao perfil__grupo">
      <h2 className="cartao__subtitulo">{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * Uma linha da lista. A linha inteira é o botão — o alvo é a largura toda,
 * não a setinha.
 */
function Item({ Icone, valor, rotulo, onClick, apagado = false, leitor = ', alterar' }) {
  return (
    <button
      type="button"
      className={apagado ? 'perfil__item perfil__item--apagado' : 'perfil__item'}
      onClick={onClick}
    >
      <span className="perfil__icone">
        <Icone tamanho={22} />
      </span>
      <span className="perfil__textos">
        <span className="perfil__valor">{valor}</span>
        <span className="perfil__rotulo">{rotulo}</span>
      </span>
      <span className="perfil__seta">
        <IconeSeta tamanho={18} />
      </span>
      {/* Sem isto o leitor de tela leria "Admin, Nome" sem dizer que é
          um botão para alterar. */}
      {leitor && <span className="so-leitor">{leitor}</span>}
    </button>
  );
}

/** Erro dentro da janela: ela continua aberta para a correção. */
function Erro({ texto }) {
  if (!texto) return null;
  return (
    <p className="alerta alerta--erro" role="alert">
      {texto}
    </p>
  );
}

function Acoes({ salvando, rotulo, desabilitado, aoFechar }) {
  return (
    <div className="modal__acoes">
      <button type="button" className="botao botao--auto" onClick={aoFechar}>
        Cancelar
      </button>
      <button
        type="submit"
        className="botao botao--primario botao--auto"
        disabled={salvando || desabilitado}
      >
        {salvando ? 'Salvando...' : rotulo}
      </button>
    </div>
  );
}

function EditarNome({ aoFechar, aoConcluir }) {
  const { usuario, atualizarSessao } = useAuth();
  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const mudou = nome.trim() !== (usuario?.nome ?? '') && nome.trim().length >= 2;

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      atualizarSessao(await authService.atualizarPerfil({ nome: nome.trim() }));
      aoConcluir('Nome alterado.');
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível alterar o nome.'));
      setSalvando(false);
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Alterar nome" largura={440}>
      <form onSubmit={salvar}>
        <Texto
          rotulo="Nome"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value);
            setErro('');
          }}
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          autoFocus
        />
        <Erro texto={erro} />
        <Acoes salvando={salvando} rotulo="Salvar" desabilitado={!mudou} aoFechar={aoFechar} />
      </form>
    </Modal>
  );
}

/**
 * O e-mail pede a senha atual. Ele é o login: com a sessão aberta numa
 * máquina esquecida, bastaria trocá-lo para trancar a dona fora da conta.
 */
function EditarEmail({ aoFechar, aoConcluir }) {
  const { usuario, atualizarSessao } = useAuth();
  const [email, setEmail] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const emailNovo = email.trim().toLowerCase();

  async function salvar(e) {
    e.preventDefault();

    // Conferido aqui porque o servidor, num formato inválido, responde só
    // "Dados inválidos." — sem dizer que o problema é o e-mail.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNovo)) {
      setErro('Informe um e-mail válido, como nome@exemplo.com.');
      return;
    }
    if (emailNovo === usuario?.email) {
      setErro('Este já é o seu e-mail de acesso.');
      return;
    }

    setSalvando(true);
    setErro('');
    try {
      const resposta = await authService.atualizarPerfil({ email: emailNovo, senhaAtual });
      atualizarSessao(resposta);
      aoConcluir(`E-mail alterado. A partir de agora, entre com ${resposta.usuario.email}.`);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível alterar o e-mail.'));
      setSalvando(false);
    }
  }

  const limparErro = (setter) => (e) => {
    setter(e.target.value);
    setErro('');
  };

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Alterar e-mail" largura={440}>
      <form onSubmit={salvar}>
        {/* `text` com teclado de e-mail, e não `type="email"`: com o tipo
            e-mail o navegador mostra o próprio balão de erro, com texto e
            desenho que mudam de um navegador para outro, antes da nossa
            mensagem — que é a que diz o que fazer. */}
        <Texto
          rotulo="Novo e-mail"
          type="text"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="nome@exemplo.com"
          value={email}
          onChange={limparErro(setEmail)}
          autoComplete="email"
          required
          autoFocus
        />
        <Texto
          rotulo="Senha atual"
          type="password"
          value={senhaAtual}
          onChange={limparErro(setSenhaAtual)}
          autoComplete="current-password"
          required
        />
        <Erro texto={erro} />
        <Acoes
          salvando={salvando}
          rotulo="Salvar"
          desabilitado={!email.trim() || !senhaAtual}
          aoFechar={aoFechar}
        />
      </form>
    </Modal>
  );
}

function EditarSenha({ aoFechar, aoConcluir }) {
  const [form, setForm] = useState({ senhaAtual: '', senhaNova: '', confirmacao: '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const campo = (nome) => (e) => {
    setForm((f) => ({ ...f, [nome]: e.target.value }));
    setErro('');
  };

  async function salvar(e) {
    e.preventDefault();

    // Conferência de digitação: o servidor não tem como saber que ela
    // errou ao repetir, porque só recebe uma das duas.
    if (form.senhaNova !== form.confirmacao) {
      setErro('A confirmação não bate com a nova senha.');
      return;
    }

    setSalvando(true);
    setErro('');
    try {
      await authService.trocarSenha({ senhaAtual: form.senhaAtual, senhaNova: form.senhaNova });
      aoConcluir('Senha alterada. Use a nova no próximo acesso.');
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível alterar a senha.'));
      setSalvando(false);
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Alterar senha" largura={440}>
      <form onSubmit={salvar}>
        <Texto
          rotulo="Senha atual"
          type="password"
          value={form.senhaAtual}
          onChange={campo('senhaAtual')}
          autoComplete="current-password"
          required
          autoFocus
        />
        <Texto
          rotulo="Nova senha"
          type="password"
          placeholder="Mínimo 6 caracteres"
          value={form.senhaNova}
          onChange={campo('senhaNova')}
          autoComplete="new-password"
          minLength={6}
          required
        />
        <Texto
          rotulo="Confirmar nova senha"
          type="password"
          value={form.confirmacao}
          onChange={campo('confirmacao')}
          autoComplete="new-password"
          required
        />
        <Erro texto={erro} />
        <Acoes
          salvando={salvando}
          rotulo="Alterar senha"
          desabilitado={!form.senhaAtual || !form.senhaNova || !form.confirmacao}
          aoFechar={aoFechar}
        />
      </form>
    </Modal>
  );
}

// ============================================================ equipe

/**
 * Os dois acessos, pelo que a pessoa FAZ — e não por cargo. "Balcão e
 * cozinha" diz à Dalila o que a pessoa vai conseguir usar; "operador"
 * não diria nada.
 */
const ACESSOS = [
  { id: 'OPERADOR', rotulo: 'Balcão e cozinha' },
  { id: 'ADMIN', rotulo: 'Acesso completo' },
];

const NOME_DO_ACESSO = Object.fromEntries(ACESSOS.map((a) => [a.id, a.rotulo]));

const O_QUE_FAZ = {
  OPERADOR:
    'Lança venda, entrada, saída, produção e estoque, e corrige o que lançou no dia. Não vê totais, fechamento, resumo nem custos.',
  ADMIN: 'Vê e mexe em tudo, inclusive no dinheiro e na equipe.',
};

/** Mesma regra do servidor: um e-mail, ou um usuário curto e sem espaço. */
const LOGIN_VALIDO = (v) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^[a-z0-9][a-z0-9._-]{2,29}$/.test(v);

/**
 * Quem tem acesso ao sistema. A Dalila adiciona, muda o acesso, redefine
 * a senha de quem esqueceu e tira o acesso de quem saiu — ninguém é
 * apagado, porque o histórico guarda quem lançou cada coisa.
 */
function Equipe({ aoAviso }) {
  const { usuario } = useAuth();
  const [pessoas, setPessoas] = useState(null);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setPessoas(await equipe.listar());
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar a equipe.'));
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrir(alvo) {
    aoAviso('');
    setAberta(alvo);
  }

  function concluir(mensagem) {
    setAberta(null);
    aoAviso(mensagem);
    carregar();
  }

  const fechar = () => setAberta(null);

  return (
    <Grupo titulo="Equipe">
      {erro && (
        <p className="alerta alerta--erro perfil__alerta" role="alert">
          {erro}
        </p>
      )}
      {pessoas === null && !erro && <p className="perfil__carregando">Carregando...</p>}
      {pessoas?.map((p) => (
        <Item
          key={p.id}
          Icone={IconePessoa}
          valor={p.id === usuario?.id ? `${p.nome} (você)` : p.nome}
          rotulo={[p.email, p.ativo ? NOME_DO_ACESSO[p.papel] : 'sem acesso']
            .filter(Boolean)
            .join(' · ')}
          apagado={!p.ativo}
          leitor=", ver"
          onClick={() => abrir(p)}
        />
      ))}
      <Item
        Icone={IconeMais}
        valor="Adicionar pessoa"
        rotulo="Dar acesso a alguém da equipe"
        leitor=""
        onClick={() => abrir('nova')}
      />

      {aberta === 'nova' && <NovaPessoa aoFechar={fechar} aoConcluir={concluir} />}
      {aberta && aberta !== 'nova' && (
        <Pessoa
          pessoa={aberta}
          propria={aberta.id === usuario?.id}
          aoFechar={fechar}
          aoConcluir={concluir}
        />
      )}
    </Grupo>
  );
}

/** A escolha do acesso, com a frase do que ele deixa fazer logo embaixo. */
function EscolherAcesso({ valor, aoTrocar }) {
  return (
    <div className="campo">
      <span className="campo__rotulo" aria-hidden="true">
        Acesso
      </span>
      <Segmentado rotulo="Acesso" opcoes={ACESSOS} valor={valor} aoTrocar={aoTrocar} cheio />
      <span className="campo__dica">{O_QUE_FAZ[valor]}</span>
    </div>
  );
}

function NovaPessoa({ aoFechar, aoConcluir }) {
  const [form, setForm] = useState({ nome: '', email: '', senha: '', papel: 'OPERADOR' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const campo = (nome) => (e) => {
    setForm((f) => ({ ...f, [nome]: e.target.value }));
    setErro('');
  };

  async function salvar(e) {
    e.preventDefault();
    const login = form.email.trim().toLowerCase();

    // Conferido aqui porque, num formato inválido, o servidor responde só
    // "Dados inválidos." — sem dizer qual campo nem o que fazer.
    if (form.nome.trim().length < 2) return setErro('Informe o nome.');
    if (!LOGIN_VALIDO(login)) {
      return setErro('Para entrar, use um e-mail ou um usuário sem espaço, como maria.');
    }
    if (form.senha.length < 6) return setErro('A senha precisa ter ao menos 6 caracteres.');

    setSalvando(true);
    setErro('');
    try {
      const nova = await equipe.criar({
        nome: form.nome.trim(),
        email: login,
        senha: form.senha,
        papel: form.papel,
      });
      aoConcluir(`${nova.nome} já pode entrar com ${nova.email} e a senha que você criou.`);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível adicionar.'));
      setSalvando(false);
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Adicionar pessoa" largura={480}>
      <form onSubmit={salvar}>
        <Texto
          rotulo="Nome"
          value={form.nome}
          onChange={campo('nome')}
          autoComplete="off"
          maxLength={80}
          autoFocus
        />
        <Texto
          rotulo="Entra com"
          dica="Um e-mail, ou um usuário simples, como maria."
          type="text"
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          value={form.email}
          onChange={campo('email')}
        />
        <Texto
          rotulo="Senha para o primeiro acesso"
          dica="Mínimo 6 caracteres. Depois a pessoa troca na Minha conta."
          type="text"
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="new-password"
          value={form.senha}
          onChange={campo('senha')}
        />
        <EscolherAcesso
          valor={form.papel}
          aoTrocar={(papel) => setForm((f) => ({ ...f, papel }))}
        />
        <Erro texto={erro} />
        <Acoes
          salvando={salvando}
          rotulo="Adicionar"
          desabilitado={!form.nome.trim() || !form.email.trim() || !form.senha}
          aoFechar={aoFechar}
        />
      </form>
    </Modal>
  );
}

/**
 * Uma pessoa da equipe: o acesso dela, e as duas ações que a Dalila vai
 * precisar — nova senha para quem esqueceu, e tirar (ou devolver) o
 * acesso. A própria conta aparece, mas não se mexe por aqui: tirar o
 * próprio acesso trancaria a dona fora, e a senha dela se troca em
 * Segurança, que pede a atual.
 */
function Pessoa({ pessoa, propria, aoFechar, aoConcluir }) {
  const [modo, setModo] = useState('ver');
  const [papel, setPapel] = useState(pessoa.papel);
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function executar(acao, mensagem) {
    setSalvando(true);
    setErro('');
    try {
      await acao();
      aoConcluir(mensagem);
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  if (modo === 'senha') {
    return (
      <Modal aberto aoFechar={aoFechar} titulo="Nova senha" largura={440}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (senha.length < 6) return setErro('A senha precisa ter ao menos 6 caracteres.');
            executar(
              () => equipe.redefinirSenha(pessoa.id, senha),
              `Senha de ${pessoa.nome} trocada. Passe a nova para a pessoa.`
            );
          }}
        >
          <p className="lancamento__pergunta">
            Para quando {pessoa.nome} esquecer a senha. Depois de entrar, a pessoa troca na Minha
            conta.
          </p>
          <Texto
            rotulo="Nova senha"
            dica="Mínimo 6 caracteres."
            type="text"
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="new-password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value);
              setErro('');
            }}
            autoFocus
          />
          <Erro texto={erro} />
          <Acoes
            salvando={salvando}
            rotulo="Trocar senha"
            desabilitado={!senha}
            aoFechar={() => setModo('ver')}
          />
        </form>
      </Modal>
    );
  }

  if (modo === 'tirar') {
    return (
      <Modal aberto aoFechar={aoFechar} titulo={`Tirar o acesso de ${pessoa.nome}?`} largura={440}>
        <p className="lancamento__pergunta">
          {pessoa.nome} não consegue mais entrar, nem com o sistema já aberto no celular. Tudo o que
          foi lançado na conta continua no histórico, e dá para devolver o acesso depois.
        </p>
        <Erro texto={erro} />
        <div className="modal__acoes">
          <button type="button" className="botao botao--auto" onClick={() => setModo('ver')}>
            Voltar
          </button>
          <button
            type="button"
            className="botao botao--auto botao--perigo"
            disabled={salvando}
            onClick={() =>
              executar(
                () => equipe.alterar(pessoa.id, { ativo: false }),
                `${pessoa.nome} não tem mais acesso.`
              )
            }
          >
            {salvando ? 'Tirando...' : 'Tirar acesso'}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={pessoa.nome} largura={480}>
      <dl className="lancamento__dados">
        <Dado rotulo="Entra com">{pessoa.email}</Dado>
        {/* A nova senha mora na linha da senha, e não no pé da janela: lá
            já estão tirar o acesso e salvar, e três botões não cabem numa
            fileira do celular. */}
        {!propria && pessoa.ativo && (
          <Dado rotulo="Senha">
            <button
              type="button"
              className="botao botao--texto perfil__senha"
              onClick={() => setModo('senha')}
            >
              Criar uma nova
            </button>
          </Dado>
        )}
        <Dado rotulo="Desde">{formatarData(pessoa.criadoEm)}</Dado>
        {!pessoa.ativo && <Dado rotulo="Acesso">Sem acesso</Dado>}
      </dl>

      {propria ? (
        <p className="lancamento__pergunta">
          É a sua conta. Nome, acesso e senha se mudam em Informações pessoais e Segurança, aqui na
          Minha conta.
        </p>
      ) : (
        pessoa.ativo && <EscolherAcesso valor={papel} aoTrocar={setPapel} />
      )}

      <Erro texto={erro} />

      {!propria && (
        <div className="modal__acoes modal__acoes--separadas">
          {pessoa.ativo ? (
            <>
              <button
                type="button"
                className="botao botao--auto botao--perigo"
                onClick={() => setModo('tirar')}
              >
                Tirar acesso
              </button>
              <button
                type="button"
                className="botao botao--primario botao--auto"
                disabled={salvando || papel === pessoa.papel}
                onClick={() =>
                  executar(
                    () => equipe.alterar(pessoa.id, { papel }),
                    `Acesso de ${pessoa.nome}: ${NOME_DO_ACESSO[papel].toLowerCase()}.`
                  )
                }
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="botao botao--primario botao--auto"
              disabled={salvando}
              onClick={() =>
                executar(
                  () => equipe.alterar(pessoa.id, { ativo: true }),
                  `${pessoa.nome} tem acesso de novo.`
                )
              }
            >
              {salvando ? 'Devolvendo...' : 'Devolver acesso'}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
