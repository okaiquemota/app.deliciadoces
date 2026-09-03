import { Link } from 'react-router-dom';

export function NaoEncontrada() {
  return (
    <div className="pagina-erro">
      <h1>404</h1>
      <p>Esta página não existe.</p>
      <Link className="botao botao--primario" to="/dashboard">
        Voltar ao início
      </Link>
    </div>
  );
}
