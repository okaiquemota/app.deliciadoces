/**
 * Ícones de linha, desenhados inline.
 *
 * Inline e não arquivo de imagem: são poucos, mudam de cor junto com o
 * texto (`currentColor`) e não custam uma requisição cada. Nada de fonte
 * de ícone nem emoji — emoji muda de desenho conforme o aparelho e a
 * cliente pediu para tirar.
 *
 * Todos partem do mesmo traço de 1.8 e da mesma caixa de 24, senão um
 * ficaria visivelmente mais pesado que o outro na mesma fileira.
 */
function Base({ children, tamanho = 28 }) {
  return (
    <svg
      className="icone"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Sacola: o gesto de vender no balcão. */
export const IconeVenda = (p) => (
  <Base {...p}>
    <path d="M4 8h16l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H6.7a1.5 1.5 0 0 1-1.5-1.3Z" />
    <path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" />
  </Base>
);

/** Seta entrando na carteira. */
export const IconeEntrada = (p) => (
  <Base {...p}>
    <path d="M12 3v9" />
    <path d="m8.5 8.5 3.5 3.5 3.5-3.5" />
    <path d="M4 14v5.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V14" />
  </Base>
);

/** Seta saindo. */
export const IconeSaida = (p) => (
  <Base {...p}>
    <path d="M12 12V3" />
    <path d="m8.5 6.5 3.5-3.5 3.5 3.5" />
    <path d="M4 14v5.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V14" />
  </Base>
);

/** Mão com moeda: o dinheiro que ela tira para si. */
export const IconeRetirada = (p) => (
  <Base {...p}>
    <circle cx="12" cy="7" r="3.2" />
    <path d="M4 20a5.5 5.5 0 0 1 5.5-5h5A5.5 5.5 0 0 1 20 20" />
  </Base>
);

/** Prancheta conferida: o fechamento do dia. */
export const IconeFechamento = (p) => (
  <Base {...p}>
    <path d="M8 4h8a1.5 1.5 0 0 1 1.5 1.5V20a1 1 0 0 1-1 1H7.5a1 1 0 0 1-1-1V5.5A1.5 1.5 0 0 1 8 4Z" />
    <path d="M9.5 3h5v2.5h-5Z" />
    <path d="m9.5 13.5 1.8 1.8 3.2-3.6" />
  </Base>
);

/** Barras: o resultado do período. */
export const IconeResumo = (p) => (
  <Base {...p}>
    <path d="M4 20h16" />
    <path d="M7 20v-6" />
    <path d="M12 20V6" />
    <path d="M17 20v-9" />
  </Base>
);
