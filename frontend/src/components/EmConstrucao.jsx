/**
 * Marcador visual para os módulos ainda não implementados.
 *
 * Existe para que a navegação fique completa desde o início: o grupo
 * consegue demonstrar o fluxo das telas antes de as regras estarem
 * prontas, e cada um substitui o seu placeholder pelo módulo real.
 */
export function EmConstrucao({ titulo, descricao, itens = [] }) {
  return (
    <section className="cartao">
      <h1 className="cartao__titulo">{titulo}</h1>
      <p className="cartao__texto">{descricao}</p>

      {itens.length > 0 && (
        <>
          <h2 className="cartao__subtitulo">Previsto para este módulo</h2>
          <ul className="cartao__lista">
            {itens.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}

      <p className="cartao__aviso">
        Escopo a confirmar na reunião de levantamento de requisitos com a cliente.
      </p>
    </section>
  );
}
