import { useState } from 'react';

/**
 * Identidade visual da Delícia Doces: a medalha ao lado do nome.
 *
 * Por que os dois juntos e não só a logo: a medalha é muito detalhada
 * (laço, fouet, rosas, texto em dois tamanhos). Com 34px de altura no
 * cabeçalho esse detalhe vira um borrão ilegível. Ela entra como selo —
 * dá a cara da marca — e quem carrega a leitura é o nome ao lado.
 *
 * O <picture> serve WebP (64 KB) e cai para PNG (270 KB) em navegador
 * que não suporte. E se nenhum dos dois carregar, some a imagem e fica
 * só o nome — nunca o ícone de imagem quebrada.
 */
export function Marca({ tamanho = 'normal' }) {
  const [semLogo, setSemLogo] = useState(false);

  return (
    <span className={tamanho === 'grande' ? 'marca marca--grande' : 'marca'}>
      {!semLogo && (
        <picture>
          <source srcSet="/logo.webp" type="image/webp" />
          <img
            src="/logo.png"
            alt=""
            className="marca__logo"
            /* O nome está escrito ao lado, então a imagem é decorativa:
               alt vazio evita o leitor de tela repetir "Delícia Doces". */
            aria-hidden="true"
            width="400"
            height="400"
            onError={() => setSemLogo(true)}
          />
        </picture>
      )}
      <span className="marca__nome">Delícia Doces</span>
    </span>
  );
}
