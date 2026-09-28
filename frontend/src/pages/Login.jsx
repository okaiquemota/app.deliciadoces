import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { mensagemDeErro } from '../services/api.js';

/**
 * Entrar.
 *
 * No computador, a tela se divide em duas: à esquerda, a FOTO da
 * confeitaria (`--login-foto` no CSS); à direita, o formulário com a logo.
 * No celular a foto vira o topo, e o formulário sobe por cima dela como
 * uma folha, com a logo no meio da borda.
 */
export function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [semLogo, setSemLogo] = useState(false);

  const { entrar } = useAuth();
  const navegar = useNavigate();
  const localizacao = useLocation();

  // Se o usuário foi barrado tentando abrir uma página, volta para ela.
  const destino = localizacao.state?.de?.pathname ?? '/dashboard';

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErro('');
    setEnviando(true);

    try {
      await entrar(email, senha);
      navegar(destino, { replace: true });
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Não foi possível entrar. Tente novamente.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login">
      {/* A foto é enfeite: o nome da casa está no formulário ao lado. */}
      <div className="login__foto" aria-hidden="true" />

      <section className="login__lado">
        <form className="login__form" onSubmit={aoEnviar}>
          {!semLogo && (
            <span className="login__medalha">
              <picture>
                <source srcSet="/logo.webp" type="image/webp" />
                {/* O nome está escrito logo abaixo: a medalha é decorativa. */}
                <img
                  src="/logo.png"
                  alt=""
                  width="400"
                  height="400"
                  onError={() => setSemLogo(true)}
                />
              </picture>
            </span>
          )}
          <p className="login__nome">Delícia Doces</p>
          <h1 className="login__titulo">Entrar no sistema</h1>
          <p className="login__sub">Use seu e-mail ou usuário e a sua senha.</p>

          <label className="campo">
            <span className="campo__rotulo">E-mail ou usuário</span>
            <input
              className="campo__entrada"
              /*
               * `text` e não `email`: com `type="email"` o próprio navegador
               * barra qualquer valor sem "@" antes de a requisição sair, e a
               * conta de apresentação nunca chegaria no servidor. Quem valida
               * é o backend, que aceita e-mail ou usuário no login.
               */
              type="text"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="campo">
            <span className="campo__rotulo">Senha</span>
            {/* Mostrar a senha: no celular, com o teclado pequeno, é onde
                mais se erra — e sem ver, ela só descobre depois do erro. */}
            <span className="login__senha">
              <input
                className="campo__entrada"
                type={verSenha ? 'text' : 'password'}
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                autoComplete="current-password"
                required
              />
              {/* O botão diz o que vai fazer; "senha" completa o nome para o
                  leitor de tela, que não vê o campo ao lado. */}
              <button
                type="button"
                className="login__ver-senha"
                onClick={() => setVerSenha((v) => !v)}
              >
                {verSenha ? 'Ocultar' : 'Mostrar'}
                <span className="so-leitor"> senha</span>
              </button>
            </span>
          </label>

          {erro && (
            <p className="alerta alerta--erro" role="alert">
              {erro}
            </p>
          )}

          <button className="botao botao--primario login__entrar" type="submit" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="login__rodape">Delícia Doces · v1.0</p>
      </section>
    </main>
  );
}
