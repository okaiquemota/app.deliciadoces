import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { mensagemDeErro } from '../services/api.js';
import { Marca } from '../components/Marca.jsx';

export function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

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
    <div className="login">
      <form className="login__caixa" onSubmit={aoEnviar}>
        <h1 className="login__marca">
          <Marca tamanho="grande" />
        </h1>
        <p className="login__subtitulo">Sistema de gestão</p>

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
          <input
            className="campo__entrada"
            type="password"
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {erro && <p className="alerta alerta--erro">{erro}</p>}

        <button className="botao botao--primario" type="submit" disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
