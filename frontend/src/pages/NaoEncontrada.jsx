import { Link } from 'react-router-dom';

/** Endereço que não existe: diz o que aconteceu e oferece o caminho de volta. */
export function NaoEncontrada() {
  return (
    <main className="pagina-erro">
      <h1 className="pagina-erro__titulo">Página não encontrada</h1>
      <p className="pagina-erro__texto">
        O endereço pode ter sido digitado errado, ou a página mudou de lugar.
      </p>
      <Link className="botao botao--primario botao--auto" to="/dashboard">
        Voltar ao início
      </Link>
    </main>
  );
}
