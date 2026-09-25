import { useId, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { authService } from '../services/authService.js';
import { mensagemDeErro } from '../services/api.js';

/**
 * Conta do usuário: nome, e-mail e senha.
 *
 * No desenho dos Ajustes do iPhone e da página de conta da Apple: uma
 * coluna, grupos de linhas, rótulo à esquerda e campo à direita, um fio
 * fino entre as linhas. Não há texto de apoio debaixo dos campos — o que
 * era essencial virou o texto de exemplo dentro do próprio campo.
 *
 * Continuam sendo dois formulários, um por grupo: trocar o nome e trocar
 * a senha acontecem em momentos diferentes, e num formulário só um erro
 * na senha impediria de salvar o nome.
 */
export function MinhaConta() {
  return (
    <section className="ajustes">
      <Perfil />
      <Senha />
    </section>
  );
}

/** Uma linha do grupo: rótulo à esquerda, campo sem borda à direita. */
function Linha({ rotulo, ...props }) {
  const id = useId();
  return (
    <div className="ajustes__linha">
      <label className="ajustes__rotulo" htmlFor={id}>
        {rotulo}
      </label>
      <input className="ajustes__campo" id={id} {...props} />
    </div>
  );
}

/**
 * Erro e confirmação. `role` para que quem usa leitor de tela saiba o
 * resultado depois de apertar o botão.
 */
function Aviso({ estado }) {
  if (estado.erro) {
    return (
      <p className="alerta alerta--erro ajustes__aviso" role="alert">
        {estado.erro}
      </p>
    );
  }
  if (estado.ok) {
    return (
      <p className="alerta alerta--ok ajustes__aviso" role="status">
        {estado.ok}
      </p>
    );
  }
  return null;
}

function Perfil() {
  const { usuario, atualizarSessao } = useAuth();
  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [estado, setEstado] = useState({ erro: '', ok: '' });
  const [salvando, setSalvando] = useState(false);

  const emailNovo = email.trim().toLowerCase();
  const mudouEmail = emailNovo !== (usuario?.email ?? '');
  const mudouNome = nome.trim() !== (usuario?.nome ?? '');

  const alterar = (setter) => (e) => {
    setter(e.target.value);
    setEstado({ erro: '', ok: '' });
  };

  async function salvar(e) {
    e.preventDefault();
    if (!mudouNome && !mudouEmail) return;

    // Conferido aqui porque o servidor, num formato inválido, responde só
    // "Dados inválidos." — sem dizer que o problema é o e-mail.
    if (mudouEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNovo)) {
      setEstado({ erro: 'Informe um e-mail válido, como nome@exemplo.com.', ok: '' });
      return;
    }

    setSalvando(true);
    setEstado({ erro: '', ok: '' });
    try {
      const resposta = await authService.atualizarPerfil({
        ...(mudouNome ? { nome: nome.trim() } : {}),
        ...(mudouEmail ? { email: emailNovo, senhaAtual } : {}),
      });
      atualizarSessao(resposta);
      setSenhaAtual('');
      setEstado({
        erro: '',
        ok: mudouEmail
          ? `Salvo. A partir de agora, entre com ${resposta.usuario.email}.`
          : 'Salvo.',
      });
    } catch (err) {
      setEstado({ erro: mensagemDeErro(err, 'Não foi possível salvar.'), ok: '' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="ajustes__secao" onSubmit={salvar} aria-labelledby="ajustes-perfil">
      <h2 className="ajustes__titulo" id="ajustes-perfil">
        Perfil
      </h2>

      <div className="ajustes__grupo">
        <Linha
          rotulo="Nome"
          value={nome}
          onChange={alterar(setNome)}
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
        />
        {/* `text` com teclado de e-mail, e não `type="email"`: a conta de
            apresentação entra como "admin", sem arroba, e com o tipo e-mail
            o navegador barraria o formulário inteiro — ela não conseguiria
            trocar nem o nome. */}
        <Linha
          rotulo="E-mail"
          type="text"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={alterar(setEmail)}
          autoComplete="email"
          required
        />
        {/* A senha só aparece quando o e-mail MUDA: o e-mail é o login, e é
            só aí que ela é cobrada. Mostrá-la sempre faria ela achar que
            precisa da senha para corrigir uma letra do nome. */}
        {mudouEmail && (
          <Linha
            rotulo="Senha atual"
            type="password"
            placeholder="Obrigatória"
            value={senhaAtual}
            onChange={alterar(setSenhaAtual)}
            autoComplete="current-password"
            required
          />
        )}
      </div>

      <Aviso estado={estado} />

      <div className="ajustes__acoes">
        <button
          type="submit"
          className="botao botao--primario botao--auto"
          disabled={salvando || (!mudouNome && !mudouEmail)}
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

function Senha() {
  const [form, setForm] = useState({ senhaAtual: '', senhaNova: '', confirmacao: '' });
  const [estado, setEstado] = useState({ erro: '', ok: '' });
  const [salvando, setSalvando] = useState(false);

  const campo = (nome) => (e) => {
    setForm((f) => ({ ...f, [nome]: e.target.value }));
    setEstado({ erro: '', ok: '' });
  };

  const preenchido = form.senhaAtual && form.senhaNova && form.confirmacao;

  async function enviar(e) {
    e.preventDefault();

    // Conferência de digitação: o servidor não tem como saber que ela
    // errou ao repetir, porque só recebe uma das duas.
    if (form.senhaNova !== form.confirmacao) {
      setEstado({ erro: 'A confirmação não bate com a nova senha.', ok: '' });
      return;
    }

    setSalvando(true);
    setEstado({ erro: '', ok: '' });
    try {
      await authService.trocarSenha({ senhaAtual: form.senhaAtual, senhaNova: form.senhaNova });
      setForm({ senhaAtual: '', senhaNova: '', confirmacao: '' });
      setEstado({ erro: '', ok: 'Senha alterada. Use a nova no próximo acesso.' });
    } catch (err) {
      setEstado({ erro: mensagemDeErro(err, 'Não foi possível alterar a senha.'), ok: '' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="ajustes__secao" onSubmit={enviar} aria-labelledby="ajustes-senha">
      <h2 className="ajustes__titulo" id="ajustes-senha">
        Senha
      </h2>

      {/* A regra dos 6 caracteres mora no texto de exemplo do campo, não
          numa frase embaixo dele. O navegador também a cobra (`minLength`)
          antes de enviar. */}
      <div className="ajustes__grupo">
        <Linha
          rotulo="Senha atual"
          type="password"
          placeholder="Obrigatória"
          value={form.senhaAtual}
          onChange={campo('senhaAtual')}
          autoComplete="current-password"
          required
        />
        <Linha
          rotulo="Nova senha"
          type="password"
          placeholder="Mínimo 6 caracteres"
          value={form.senhaNova}
          onChange={campo('senhaNova')}
          autoComplete="new-password"
          minLength={6}
          required
        />
        <Linha
          rotulo="Confirmar"
          type="password"
          placeholder="Repita a nova senha"
          value={form.confirmacao}
          onChange={campo('confirmacao')}
          autoComplete="new-password"
          required
        />
      </div>

      <Aviso estado={estado} />

      <div className="ajustes__acoes">
        <button
          type="submit"
          className="botao botao--primario botao--auto"
          disabled={salvando || !preenchido}
        >
          {salvando ? 'Alterando...' : 'Alterar senha'}
        </button>
      </div>
    </form>
  );
}
