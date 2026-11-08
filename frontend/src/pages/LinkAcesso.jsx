import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { authService } from '../services/authService.js';
import { mensagemDeErro } from '../services/api.js';
import { Medalha } from './Login.jsx';

/**
 * Página do link de acesso: a pessoa escolhe o e-mail e a senha dela.
 *
 * A administração gera o link na Equipe e manda pelo WhatsApp. Quem abre
 * ainda não tem senha, então a página é pública e tem a cara do Entrar.
 * Gravou, já entra no sistema.
 *
 * O link mora depois do `#` do endereço, e não no caminho: o que vem
 * depois do `#` o navegador não manda ao servidor, então não fica em log
 * de acesso nem vaza no cabeçalho Referer.
 */

/** Mesmo mínimo do servidor. */
const SENHA_MINIMA = 8;

/** Mesma regra do servidor: um e-mail, ou um usuário curto e sem espaço. */
const LOGIN_VALIDO = (v) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^[a-z0-9][a-z0-9._-]{2,29}$/.test(v);

const INCOMPLETO =
  'Este endereço está incompleto. Abra o link exatamente como ele chegou para você.';

export function LinkAcesso() {
  const [link] = useState(() => window.location.hash.slice(1));
  const [conta, setConta] = useState(null);
  const [invalido, setInvalido] = useState(link ? '' : INCOMPLETO);

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [repetida, setRepetida] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const { atualizarSessao } = useAuth();
  const navegar = useNavigate();

  useEffect(() => {
    if (!link) return;
    authService
      .conferirLink(link)
      .then((dados) => {
        setConta(dados);
        setEmail(dados.email);
      })
      .catch((falha) => setInvalido(mensagemDeErro(falha, 'Não foi possível abrir o link.')));
  }, [link]);

  async function aoEnviar(evento) {
    evento.preventDefault();
    const login = email.trim().toLowerCase();

    // Conferido aqui porque, num formato inválido, o servidor responde só
    // "Dados inválidos.", sem dizer qual campo nem o que fazer.
    if (!LOGIN_VALIDO(login)) return setErro('Use um e-mail válido, como nome@gmail.com.');
    if (senha.length < SENHA_MINIMA) return setErro('A senha precisa ter ao menos 8 caracteres.');
    if (senha !== repetida) return setErro('As duas senhas não estão iguais.');

    setErro('');
    setEnviando(true);
    try {
      atualizarSessao(await authService.usarLink(link, login, senha));
      navegar('/dashboard', { replace: true });
    } catch (falha) {
      // 410: o link morreu no meio do caminho (usado em outra aba, ou a
      // senha foi trocada). Não adianta tentar de novo neste formulário.
      if (falha.response?.status === 410) setInvalido(mensagemDeErro(falha));
      else setErro(mensagemDeErro(falha, 'Não foi possível salvar. Tente novamente.'));
      setEnviando(false);
    }
  }

  const primeiroNome = conta?.nome.split(' ')[0];

  return (
    <main className="login">
      <div className="login__foto" aria-hidden="true" />

      <section className="login__lado">
        {invalido ? (
          <div className="login__form">
            <Medalha />
            <p className="login__nome">Delícia Doces</p>
            <h1 className="login__titulo">Link sem validade</h1>
            <p className="alerta alerta--erro login__aviso" role="alert">
              {invalido}
            </p>
            <Link className="botao botao--primario login__entrar" to="/login" replace>
              Ir para o Entrar
            </Link>
          </div>
        ) : !conta ? (
          <p className="login__sub">Conferindo o link...</p>
        ) : (
          <form className="login__form" onSubmit={aoEnviar}>
            <Medalha />
            <p className="login__nome">Delícia Doces</p>
            <h1 className="login__titulo">Criar seu acesso</h1>
            <p className="login__sub">
              Olá, {primeiroNome}! Escolha o e-mail e a senha que você vai usar para entrar no
              sistema.
            </p>

            <label className="campo">
              <span className="campo__rotulo">E-mail</span>
              <input
                className="campo__entrada"
                // `text` e não `email`: funcionária pode entrar com um
                // usuário simples, sem arroba. Quem valida é o servidor.
                type="text"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErro('');
                }}
                required
              />
              <span className="campo__dica">É com ele que você vai entrar.</span>
            </label>

            <label className="campo">
              <span className="campo__rotulo">Senha</span>
              <span className="login__senha">
                <input
                  className="campo__entrada"
                  type={verSenha ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                    setErro('');
                  }}
                  required
                />
                <button
                  type="button"
                  className="login__ver-senha"
                  onClick={() => setVerSenha((v) => !v)}
                >
                  {verSenha ? 'Ocultar' : 'Mostrar'}
                  <span className="so-leitor"> senhas</span>
                </button>
              </span>
              <span className="campo__dica">Mínimo 8 caracteres. Só você vai saber.</span>
            </label>

            <label className="campo">
              <span className="campo__rotulo">Repita a senha</span>
              <input
                className="campo__entrada"
                type={verSenha ? 'text' : 'password'}
                autoComplete="new-password"
                value={repetida}
                onChange={(e) => {
                  setRepetida(e.target.value);
                  setErro('');
                }}
                required
              />
            </label>

            {erro && (
              <p className="alerta alerta--erro" role="alert">
                {erro}
              </p>
            )}

            <button
              className="botao botao--primario login__entrar"
              type="submit"
              disabled={enviando}
            >
              {enviando ? 'Salvando...' : 'Criar acesso e entrar'}
            </button>
          </form>
        )}

        <p className="login__rodape">Este link vale uma vez só, por 3 dias.</p>
      </section>
    </main>
  );
}
