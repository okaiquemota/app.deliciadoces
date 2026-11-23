/**
 * O lugar da lista enquanto ela carrega: linhas com a forma das que vão
 * chegar (o círculo, o nome, o detalhe e o valor), no lugar de um
 * "Carregando..." solto. A tela não pula quando os dados chegam.
 *
 * Para o leitor de tela, o desenho não existe (`aria-hidden`): ele ouve
 * "Carregando", uma vez, pela região de status.
 */
export function Esqueleto({ linhas = 5, rotulo = 'Carregando' }) {
  return (
    <div role="status">
      <span className="so-leitor">{rotulo}…</span>
      <ul className="esqueleto" aria-hidden="true">
        {Array.from({ length: linhas }, (_, i) => (
          <li key={i} className="esqueleto__linha">
            <span className="esqueleto__bloco esqueleto__bloco--circulo" />
            <span className="esqueleto__textos">
              <span className="esqueleto__bloco esqueleto__bloco--titulo" />
              <span className="esqueleto__bloco esqueleto__bloco--detalhe" />
            </span>
            <span className="esqueleto__bloco esqueleto__bloco--valor" />
          </li>
        ))}
      </ul>
    </div>
  );
}
