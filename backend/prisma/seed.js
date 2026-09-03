import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

/**
 * Seed — popula o banco com dados mínimos para o time conseguir usar o
 * sistema logo após clonar o repositório.
 *
 * É idempotente (usa `upsert`): rodar duas vezes não duplica nada.
 *
 * ATENÇÃO: os produtos abaixo são exemplos genéricos de confeitaria,
 * inventados apenas para desenvolvimento. Os dados reais virão da
 * reunião com a cliente.
 */

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@deliciadoces.local';
const ADMIN_SENHA = process.env.SEED_ADMIN_SENHA ?? 'admin123';

async function main() {
  const senhaHash = await bcrypt.hash(ADMIN_SENHA, 10);

  const admin = await prisma.usuario.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      nome: 'Administrador',
      email: ADMIN_EMAIL,
      senhaHash,
      papel: 'ADMIN',
    },
  });

  console.log(`[seed] Usuário administrador pronto: ${admin.email}`);

  const produtosExemplo = [
    { nome: 'Farinha de trigo', unidadeMedida: 'kg', categoria: 'Insumo', custoUnitario: 4.5, estoqueMinimo: 5 },
    { nome: 'Açúcar refinado', unidadeMedida: 'kg', categoria: 'Insumo', custoUnitario: 3.9, estoqueMinimo: 5 },
    { nome: 'Chocolate meio amargo', unidadeMedida: 'kg', categoria: 'Insumo', custoUnitario: 32.0, estoqueMinimo: 2 },
    { nome: 'Caixa para bolo P', unidadeMedida: 'un', categoria: 'Embalagem', custoUnitario: 1.2, estoqueMinimo: 20 },
    { nome: 'Brigadeiro tradicional', unidadeMedida: 'un', categoria: 'Produto final', precoVenda: 3.5, estoqueMinimo: 0 },
  ];

  for (const produto of produtosExemplo) {
    const existente = await prisma.produto.findFirst({ where: { nome: produto.nome } });

    if (!existente) {
      await prisma.produto.create({ data: produto });
    }
  }

  console.log(`[seed] ${produtosExemplo.length} produtos de exemplo verificados.`);
  console.log('\n[seed] Concluído. Credenciais de acesso local:');
  console.log(`       e-mail: ${ADMIN_EMAIL}`);
  console.log(`       senha:  ${ADMIN_SENHA}\n`);
}

main()
  .catch((erro) => {
    console.error('[seed] Falhou:', erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
