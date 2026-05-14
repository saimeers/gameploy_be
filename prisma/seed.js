const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const roles = ['admin', 'estudiante', 'docente'];
  const roleDescriptions = {
    admin: 'Acceso total al sistema',
    estudiante: 'Puede crear y gestionar sus propios proyectos',
    docente: 'Puede visualizar proyectos y dejar retroalimentación',
  };

  for (const nombre of roles) {
    await prisma.rol.upsert({
      where: { nombre },
      update: {},
      create: { nombre, descripcion: roleDescriptions[nombre] },
    });
  }
  console.log('✓ Roles seeded');

  const categorias = [
    { nombre: 'Cognitivo', descripcion: 'Juegos orientados al entrenamiento de funciones cognitivas' },
    { nombre: 'Educativo', descripcion: 'Juegos con objetivos pedagógicos curriculares' },
    { nombre: 'Salud', descripcion: 'Juegos aplicados al área de salud y rehabilitación' },
    { nombre: 'Entrenamiento', descripcion: 'Juegos para simulación y entrenamiento profesional' },
    { nombre: 'Otro', descripcion: 'Otras categorías' },
  ];

  for (const cat of categorias) {
    await prisma.categoria.upsert({
      where: { nombre: cat.nombre },
      update: {},
      create: cat,
    });
  }
  console.log('✓ Categorias seeded');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());