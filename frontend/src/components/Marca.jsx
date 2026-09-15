import { useState } from 'react';

/**
 * Identidade visual da Delícia Doces: a medalha ao lado do nome.
 *
 * Por que os dois juntos e não só a logo: a medalha é muito detalhada
 * (laço, fouet, rosas, texto em dois tamanhos). Com 30px de altura no
 * cabeçalho esse detalhe vira um borrão ilegível. Ela entra como selo —
 * dá a cara da marca — e quem carrega a leitura é o nome escrito ao lado.
 *
 * Se o arquivo da logo não existir, o componente mostra só o nome, sem
 * ícone quebrado. Assim o sistema funciona antes e depois de a imagem
 * entrar no projeto.
 */
export function Marca({ tamanho = 'normal' }) {
  const [semLogo, setSemLogo] = useState(false);

  return (
    <span className={tamanho === 'grande' ? 'marca marca--grande' : 'marca'}>
      {!semLogo && (
        <img
          src="/logo.png"
          alt=""
          className="marca__logo"
          /* O nome já está escrito ao lado, então a imagem é decorativa:
             alt vazio evita que o leitor de tela repita "Delícia Doces". */
          aria-hidden="true"
          onError={() => setSemLogo(true)}
        />
      )}
      <span className="marca__nome">Delícia Doces</span>
    </span>
  );
}
