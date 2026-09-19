import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Linha, Texto } from '../components/Campo.jsx';
import { api, mensagemDeErro } from '../services/api.js';

/**
 * Conta do usuário: por enquanto, trocar a própria senha.
 *
 * Existe porque o sistema nasceu com senha definida no seed, e não havia
 * nenhum caminho para a cliente trocar — o que impedia o uso real.
 */
export function MinhaConta() {
  const { usuario } = useAuth();
  const [form, setForm] = useState({ senhaAtual: '', senhaNova: '', confirmacao: '' });
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const campo = (nome) => (e) => {
    setForm((f) => ({ ...f, [nome]: e.target.value }));
    setErro('');
    setSucesso(false);
  };

  async function enviar(e) {
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
      await api.patch('/auth/senha', {
        senhaAtual: form.senhaAtual,
        senhaNova: form.senhaNova,
      });
      setSucesso(true);
      setForm({ senhaAtual: '', senhaNova: '', confirmacao: '' });
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível trocar a senha.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section>
      <h1 className="pagina__titulo">Minha conta</h1>
      <p className="pagina__texto">
        {usuario?.nome} · {usuario?.email}
      </p>

      <article className="cartao cartao--estreito">
        <h2 className="cartao__subtitulo">Trocar senha</h2>

        <form onSubmit={enviar}>
          <Texto
            rotulo="Senha atual"
            type="password"
            value={form.senhaAtual}
            onChange={campo('senhaAtual')}
            autoComplete="current-password"
            required
          />
          <Linha>
            <Texto
              rotulo="Nova senha"
              type="password"
              value={form.senhaNova}
              onChange={campo('senhaNova')}
              autoComplete="new-password"
              minLength={6}
              required
              dica="Ao menos 6 caracteres"
            />
            <Texto
              rotulo="Repita a nova senha"
              type="password"
              value={form.confirmacao}
              onChange={campo('confirmacao')}
              autoComplete="new-password"
              required
            />
          </Linha>

          {erro && <p className="alerta alerta--erro">{erro}</p>}
          {sucesso && <p className="alerta alerta--ok">Senha trocada. Use a nova no próximo acesso.</p>}

          <button type="submit" className="botao botao--primario" disabled={salvando}>
            {salvando ? 'Trocando...' : 'Trocar senha'}
          </button>
        </form>

        <p className="cartao__aviso">
          A senha atual é pedida mesmo você já estando dentro do sistema: assim, quem encontrar
          esta tela aberta não consegue trocar a senha e tomar a conta.
        </p>
      </article>
    </section>
  );
}
