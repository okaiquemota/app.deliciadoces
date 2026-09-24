/**
 * Tabela com os três estados que toda listagem tem: carregando, vazia e
 * com dados. Centralizar isso evita que cada tela invente o seu.
 */
export function Tabela({ colunas, dados, carregando, vazio = 'Nada por aqui ainda.', aoClicar }) {
  if (carregando) {
    return <p className="tabela__aviso">Carregando...</p>;
  }

  if (!dados?.length) {
    return <p className="tabela__aviso">{vazio}</p>;
  }

  return (
    <div className="tabela__rolagem">
      <table className="tabela">
        <thead>
          <tr>
            {/* Coluna sem título é a de ações ("editar", "cancelar"). Deixar
                o `th` vazio quebra a tabela para leitor de tela: ele lê a
                célula e não sabe dizer de que coluna ela é. O nome existe,
                só não é desenhado. */}
            {colunas.map((c) => (
              <th key={c.chave} style={c.alinhar ? { textAlign: c.alinhar } : undefined}>
                {c.titulo || <span className="so-leitor">{c.rotulo ?? 'Ações'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.map((linha) => (
            <tr
              key={linha.id}
              onClick={aoClicar ? () => aoClicar(linha) : undefined}
              className={aoClicar ? 'tabela__linha--clicavel' : undefined}
            >
              {colunas.map((c) => (
                <td key={c.chave} style={c.alinhar ? { textAlign: c.alinhar } : undefined}>
                  {c.render ? c.render(linha) : linha[c.chave]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
