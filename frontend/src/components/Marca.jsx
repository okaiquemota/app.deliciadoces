/**
 * Identidade visual da Delícia Doces.
 *
 * Fica num componente só porque a marca aparece no login e no cabeçalho:
 * quando a logo da cliente entrar, muda aqui e reflete nos dois lugares.
 *
 * Para usar a logo, coloque o arquivo em `frontend/public/logo.png` (ou
 * .svg) e troque o <span> pela <img> comentada abaixo.
 */
export function Marca({ tamanho = 'normal' }) {
  return (
    <span className={tamanho === 'grande' ? 'marca marca--grande' : 'marca'}>
      {/*
        <img src="/logo.png" alt="Delícia Doces" className="marca__logo" />
      */}
      <span className="marca__nome">Delícia Doces</span>
    </span>
  );
}
