import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { mensagemDeErro } from '../services/api.js';
import { saudacao } from '../utils/formato.js';

/**
 * Entrar.
 *
 * É a primeira coisa que ela vê do sistema, e a única tela que é só da
 * marca: por isso é aqui que a paleta da Delícia Doces aparece inteira —
 * o painel em creme e rosa, com as bolinhas brancas da paleta, e a
 * medalha grande. O formulário ao lado continua o de sempre, sóbrio.
 *
 * No computador, o painel ocupa a metade esquerda. No celular ele vira o
 * topo da tela e o formulário sobe por cima dele como uma folha, no
 * desenho das janelas do resto do sistema.
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
      <section className="login__painel" aria-label="Delícia Doces">
        <div className="login__vitrine">
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
          <p className="login__frase">O caixa, o estoque e a produção num lugar só.</p>
        </div>
      </section>

      <section className="login__lado">
        <form className="login__form" onSubmit={aoEnviar}>
          <p className="login__saudacao">{saudacao()}!</p>
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
