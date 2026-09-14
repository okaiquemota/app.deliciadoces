import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

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
 * Categorias de despesa levantadas com a cliente.
 *
 * A distinção entre os dois tipos é o que faz o lucro não mentir:
 * RETIRADA_PESSOAL sai do caixa (o dinheiro realmente saiu) mas não conta
 * como custo do negócio. Ela mistura dinheiro pessoal e da confeitaria,
 * então sem isso o resultado apareceria pior do que é.
 */
const CATEGORIAS = [
  { nome: 'Ingredientes', tipo: 'CUSTO_OPERACIONAL' },
  { nome: 'Embalagem', tipo: 'CUSTO_OPERACIONAL' },
  { nome: 'Contas (gás/luz/água)', tipo: 'CUSTO_OPERACIONAL' },
  { nome: 'Transporte e entrega', tipo: 'CUSTO_OPERACIONAL' },
  { nome: 'Ajudante', tipo: 'CUSTO_OPERACIONAL' },
  { nome: 'Aluguel', tipo: 'CUSTO_OPERACIONAL' },
  { nome: 'Internet', tipo: 'CUSTO_OPERACIONAL' },
  { nome: 'Retirada pessoal', tipo: 'RETIRADA_PESSOAL' },
];

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

  const operacionais = CATEGORIAS.filter((c) => c.tipo === 'CUSTO_OPERACIONAL').length;
  const retiradas = CATEGORIAS.length - operacionais;

  console.log(
    `[seed] ${CATEGORIAS.length} categorias de despesa prontas ` +
      `(${operacionais} de custo operacional, ${retiradas} de retirada pessoal).`
  );

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
