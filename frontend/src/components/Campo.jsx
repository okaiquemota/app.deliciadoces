/**
 * Campos de formulário. Existem para que rótulo, foco e espaçamento sejam
 * iguais em todas as telas sem repetir markup.
 */
export function Campo({ rotulo, children, dica }) {
  return (
    <label className="campo">
      <span className="campo__rotulo">{rotulo}</span>
      {children}
      {dica && <span className="campo__dica">{dica}</span>}
    </label>
  );
}

export function Texto({ rotulo, dica, ...props }) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      <input className="campo__entrada" {...props} />
    </Campo>
  );
}

export function Selecao({ rotulo, dica, opcoes, ...props }) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      <select className="campo__entrada" {...props}>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </Campo>
  );
}

export function Linha({ children }) {
  return <div className="form__linha">{children}</div>;
}
