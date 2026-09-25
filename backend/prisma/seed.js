import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import { CATEGORIAS_INTERNAS } from '../src/services/caixaService.js';

/**
 * Seed — dados mínimos para o sistema ser utilizável logo após o clone.
 *
 * É idempotente (usa `upsert`): rodar duas vezes não duplica nada e não
 * sobrescreve o que já existe. Em particular, NÃO reseta a senha da Dalila
 * se ela já tiver trocado.
 *
 * Só entra aqui o que a cliente confirmou no levantamento. Nada de insumo
 * ou produto inventado: o cadastro real é dela.
 */

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'dalila@deliciadoces.com.br';
const ADMIN_SENHA = process.env.SEED_ADMIN_SENHA ?? 'deliciadoces123';

/**
 * As duas categorias INTERNAS de despesa.
 *
 * A cliente não usa categoria — ela escolhe entre Saída e Retirada
 * pessoal, e diz o que foi no "Com o quê". A tabela existe porque o
 * schema a exige em toda despesa, e o TIPO dela é o que faz o lucro não
 * mentir: retirada sai do caixa mas não é custo do negócio.
 *
 * O servidor cria as duas sozinho na primeira despesa; semear só adianta.
 */
const CATEGORIAS = Object.values(CATEGORIAS_INTERNAS);

async function main() {
  const senhaHash = await bcrypt.hash(ADMIN_SENHA, 10);

  const dalila = await prisma.usuario.upsert({
    where: { email: ADMIN_EMAIL },
    update: {}, // não mexe em quem já existe — preserva senha trocada
    create: {
      nome: 'Dalila',
      email: ADMIN_EMAIL,
      senhaHash,
      papel: 'ADMIN',
    },
  });

  console.log(`[seed] Usuária administradora pronta: ${dalila.email}`);

  for (const categoria of CATEGORIAS) {
    await prisma.categoriaDespesa.upsert({
      where: { nome: categoria.nome },
      update: {},
      create: categoria,
    });
  }

  console.log('[seed] Categorias internas de despesa prontas (saída e retirada pessoal).');

  console.log('\n[seed] Concluído. Acesso local:');
  console.log(`       e-mail: ${ADMIN_EMAIL}`);
  console.log(`       senha:  ${ADMIN_SENHA}  (provisória — trocar no primeiro uso real)\n`);
}

main()
  .catch((erro) => {
    console.error('[seed] Falhou:', erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
