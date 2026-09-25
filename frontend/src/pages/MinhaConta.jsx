import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Texto } from '../components/Campo.jsx';
import { authService } from '../services/authService.js';
import { mensagemDeErro } from '../services/api.js';

/**
 * Conta do usuário: nome, e-mail e senha.
 *
 * Dois cartões, dois formulários, dois botões — e não um formulário só
 * com tudo. Trocar o nome e trocar a senha são coisas que ela faz em
 * momentos diferentes, e num formulário único um erro na senha impediria
 * de salvar o nome (ou pior: salvaria metade e diria que deu erro).
 *
 * No computador ficam lado a lado; no celular, um embaixo do outro.
 */
export function MinhaConta() {
  return (
    <section className="conta-grade">
      <SeusDados />
      <Senha />
    </section>
  );
}

function SeusDados() {
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
          ? `Dados salvos. A partir de agora, entre com ${resposta.usuario.email}.`
          : 'Nome salvo.',
      });
    } catch (err) {
      setEstado({ erro: mensagemDeErro(err, 'Não foi possível salvar.'), ok: '' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <article className="cartao" aria-labelledby="titulo-dados">
      <h2 className="conta__titulo" id="titulo-dados">
        Seus dados
      </h2>

      <form onSubmit={salvar}>
        <Texto
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
            trocar nem o nome. Quem valida o formato é o servidor, e só
            quando o e-mail de fato muda. */}
        <Texto
          rotulo="E-mail"
          type="text"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={alterar(setEmail)}
          autoComplete="email"
          dica="É com ele que você entra no sistema."
          required
        />

        {/* A senha só aparece quando o e-mail MUDA. Mostrá-la sempre faria
            ela achar que precisa da senha para corrigir uma letra do nome.
            O e-mail é o login, e é só aí que a senha é cobrada — o servidor
            cobra de qualquer jeito; isto aqui só avisa antes de ela clicar. */}
        {mudouEmail && (
          <Texto
            rotulo="Senha atual"
            type="password"
            value={senhaAtual}
            onChange={alterar(setSenhaAtual)}
            autoComplete="current-password"
            dica="Pedida só para trocar o e-mail, que é o seu login."
            required
          />
        )}

        {/* `role` nas mensagens: sem isso, quem usa leitor de tela aperta
            Salvar e não fica sabendo se deu certo. */}
        {estado.erro && (
          <p className="alerta alerta--erro" role="alert">
            {estado.erro}
          </p>
        )}
        {estado.ok && (
          <p className="alerta alerta--ok" role="status">
            {estado.ok}
          </p>
        )}

        <button
          type="submit"
          className="botao botao--primario"
          disabled={salvando || (!mudouNome && !mudouEmail)}
        >
          {salvando ? 'Salvando...' : 'Salvar dados'}
        </button>
      </form>
    </article>
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
      setEstado({ erro: '', ok: 'Senha trocada. Use a nova no próximo acesso.' });
    } catch (err) {
      setEstado({ erro: mensagemDeErro(err, 'Não foi possível trocar a senha.'), ok: '' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <article className="cartao" aria-labelledby="titulo-senha">
      <h2 className="conta__titulo" id="titulo-senha">
        Senha
      </h2>

      {/* Os três campos um embaixo do outro. Lado a lado, a dica "ao menos
          6 caracteres" deixava a primeira coluna mais alta que a segunda,
          e os dois campos de senha nova ficavam desalinhados. */}
      <form onSubmit={enviar}>
        <Texto
          rotulo="Senha atual"
          type="password"
          value={form.senhaAtual}
          onChange={campo('senhaAtual')}
          autoComplete="current-password"
          required
        />
        <Texto
          rotulo="Nova senha"
          type="password"
          value={form.senhaNova}
          onChange={campo('senhaNova')}
          autoComplete="new-password"
          minLength={6}
          required
          dica="Ao menos 6 caracteres."
        />
        <Texto
          rotulo="Repita a nova senha"
          type="password"
          value={form.confirmacao}
          onChange={campo('confirmacao')}
          autoComplete="new-password"
          required
        />

        {estado.erro && (
          <p className="alerta alerta--erro" role="alert">
            {estado.erro}
          </p>
        )}
        {estado.ok && (
          <p className="alerta alerta--ok" role="status">
            {estado.ok}
          </p>
        )}

        <button type="submit" className="botao botao--primario" disabled={salvando}>
          {salvando ? 'Trocando...' : 'Trocar senha'}
        </button>
      </form>

      <p className="cartao__aviso">
        A senha atual é pedida mesmo você já estando dentro do sistema: assim, quem encontrar esta
        tela aberta não consegue trocar a senha e tomar a conta.
      </p>
    </article>
  );
}
