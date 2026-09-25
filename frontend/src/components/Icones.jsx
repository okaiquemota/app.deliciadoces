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

/** Triângulo de atenção: acompanha a faixa de alerta. */
export const IconeAtencao = (p) => (
  <Base {...p}>
    <path d="M12 4.5 21 19.5H3Z" />
    <path d="M12 10v4" />
    <path d="M12 17h.01" />
  </Base>
);

/** Seta para a direita: indica que a faixa leva a outra tela. */
export const IconeSeta = (p) => (
  <Base {...p}>
    <path d="m9 5 7 7-7 7" />
  </Base>
);

/* ---------------------------------------------------------------------
   Ícones de navegação.

   Entram com a barra lateral/inferior: numa barra de quatro itens colados
   no rodapé, o rótulo sozinho é pequeno demais para mirar de relance — o
   desenho é o que ela reconhece antes de ler.
   --------------------------------------------------------------------- */

/** Casa: a tela para onde tudo volta. */
export const IconeInicio = (p) => (
  <Base {...p}>
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9.5v10h13v-10" />
    <path d="M9.75 19.5v-5.5h4.5v5.5" />
  </Base>
);

/** Cupom com linhas: o lançamento de caixa. */
export const IconeCaixa = (p) => (
  <Base {...p}>
    <path d="M5 3.5h14v17l-2.3-1.6-2.35 1.6L12 19l-2.35 1.5L7.3 18.9 5 20.5Z" />
    <path d="M8.75 8.5h6.5" />
    <path d="M8.75 12.5h6.5" />
  </Base>
);

/** Batedeira vista de frente: o que se faz na cozinha. */
export const IconeProducao = (p) => (
  <Base {...p}>
    <path d="M4 4.5h9a4.5 4.5 0 0 1 0 9H8.5" />
    <path d="M8.5 13.5 7 20.5" />
    <path d="M12.5 13.5 14 20.5" />
    <path d="M5.5 20.5h11" />
  </Base>
);

/** Caixas empilhadas: o estoque. */
export const IconeEstoque = (p) => (
  <Base {...p}>
    <path d="M3.5 7.5 12 3.5l8.5 4L12 11.5Z" />
    <path d="M3.5 7.5v9L12 20.5l8.5-4v-9" />
    <path d="M12 11.5v9" />
  </Base>
);

/** Porta com seta saindo: encerrar a sessão. */
export const IconeSair = (p) => (
  <Base {...p}>
    <path d="M14.5 4.5h-8v15h8" />
    <path d="M11 12h9.5" />
    <path d="m17.5 8.5 3.5 3.5-3.5 3.5" />
  </Base>
);

/* ---------------------------------------------------------------------
   Ícones da tela Minha conta: um por linha da lista, para ela achar o
   item pelo desenho antes de ler.
   --------------------------------------------------------------------- */

/** Crachá: nome da pessoa. */
export const IconeNome = (p) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="11" r="2" />
    <path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2" />
    <path d="M14.5 10h3" />
    <path d="M14.5 13.5h3" />
  </Base>
);

/** Envelope: e-mail. */
export const IconeEmail = (p) => (
  <Base {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Base>
);

/** Cadeado: senha. */
export const IconeSenha = (p) => (
  <Base {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
    <path d="M12 14.5v2" />
  </Base>
);
