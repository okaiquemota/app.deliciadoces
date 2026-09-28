import { digitarDinheiro } from '../utils/formato.js';

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

/**
 * Campo de DINHEIRO, o mesmo em todas as telas: preenche da direita para
 * a esquerda, como nos apps de banco (ver `digitarDinheiro`), com o
 * cursor sempre no fim — clicar no meio do número ou andar com as setas
 * não tira ele de lá, porque todo dígito entra pelos centavos. Selecionar
 * tudo continua valendo, para digitar um valor novo por cima.
 *
 * `inputMode="numeric"` abre o teclado só de números: sem vírgula, não
 * há vírgula a procurar.
 *
 * `justo` é para os valores grandes, soltos na linha ao lado do "R$": o
 * campo fica exatamente da largura do número (uma cópia invisível do
 * texto dá a medida). Com o atributo `size`, que reserva largura pela
 * média das letras, o cursor e o 0,00 ficavam longe um do outro.
 */
export function EntradaDinheiro({
  value,
  aoMudar,
  className = 'campo__entrada',
  placeholder = '0,00',
  justo = false,
  ref,
  ...props
}) {
  function cursorNoFim(evento) {
    const campo = evento.currentTarget;
    const fim = campo.value.length;
    if (campo.selectionStart === campo.selectionEnd && campo.selectionStart !== fim) {
      campo.setSelectionRange(fim, fim);
    }
  }

  const entrada = (
    <input
      ref={ref}
      className={`${className} dinheiro`}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      {...props}
      value={value}
      onChange={(evento) => aoMudar(digitarDinheiro(evento.target.value, value))}
      onSelect={cursorNoFim}
    />
  );

  if (!justo) return entrada;
  return (
    <span className="dinheiro-justo">
      <span className={`${className} dinheiro-justo__medida`} aria-hidden="true">
        {value || placeholder}
      </span>
      {entrada}
    </span>
  );
}

export function Dinheiro({ rotulo, dica, ...props }) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      <EntradaDinheiro {...props} />
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

/**
 * Liga/desliga no desenho do iPhone, no lugar da caixinha de marcar: a
 * frase inteira é o alvo, e a chave diz de longe se está ligado. Por
 * baixo é uma caixa de marcar com papel de interruptor — o leitor de tela
 * anuncia "ligado" e "desligado".
 */
export function Interruptor({ rotulo, dica, ...props }) {
  return (
    <label className="interruptor">
      <span className="interruptor__textos">
        <span className="interruptor__rotulo">{rotulo}</span>
        {dica && <span className="campo__dica">{dica}</span>}
      </span>
      <input type="checkbox" role="switch" {...props} />
    </label>
  );
}
