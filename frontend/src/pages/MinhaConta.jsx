import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Modal } from '../components/Modal.jsx';
import { Texto } from '../components/Campo.jsx';
import { IconeNome, IconeEmail, IconeSenha, IconeSeta } from '../components/Icones.jsx';
import { authService } from '../services/authService.js';
import { mensagemDeErro } from '../services/api.js';

/**
 * Conta do usuário: nome, e-mail de acesso e senha.
 *
 * A tela MOSTRA os dados, e cada um se edita à parte — o desenho da
 * página de perfil do Mercado Livre. Uma lista com ícone, o valor, uma
 * legenda dizendo o que ele é, e a seta indicando que a linha abre.
 *
 * Formulário aberto o tempo todo convida a mexer sem querer, e obriga a
 * ler seis campos para achar o nome. Aqui ela vê os três dados de relance
 * e só encontra campo quando decidiu mudar alguma coisa. Cada edição mora
 * numa janela própria, a mesma da Venda e da Entrada.
 */
export function MinhaConta() {
  const { usuario } = useAuth();
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
      <header>
        <h2 className="perfil__titulo">Informações da conta</h2>
        <p className="perfil__descricao">Altere seu nome, o e-mail de acesso e a senha.</p>
      </header>

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
          rotulo="E-mail de acesso"
          onClick={() => abrir('email')}
        />
      </Grupo>

      <Grupo titulo="Segurança">
        <Item Icone={IconeSenha} valor="••••••••" rotulo="Senha" onClick={() => abrir('senha')} />
      </Grupo>

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
    <section className="perfil__grupo">
      <h3 className="perfil__grupo-titulo">{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * Uma linha da lista. A linha inteira é o botão — o alvo é a largura toda,
 * não a setinha.
 */
function Item({ Icone, valor, rotulo, onClick }) {
  return (
    <button type="button" className="perfil__item" onClick={onClick}>
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
      <span className="so-leitor">, alterar</span>
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
