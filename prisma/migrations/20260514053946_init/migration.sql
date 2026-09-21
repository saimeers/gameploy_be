-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('admin', 'estudiante', 'docente');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('borrador', 'publicado', 'archivado');

-- CreateEnum
CREATE TYPE "ProjectVisibility" AS ENUM ('publico', 'privado', 'por_enlace');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('juego_webgl', 'portada', 'captura');

-- CreateEnum
CREATE TYPE "InputType" AS ENUM ('teclado', 'mouse', 'mando', 'mobile');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "nombre" "RoleName" NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_rol" INTEGER NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etiquetas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "etiquetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyectos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "instrucciones" TEXT,
    "slug" TEXT NOT NULL,
    "estado" "ProjectStatus" NOT NULL DEFAULT 'borrador',
    "visibilidad" "ProjectVisibility" NOT NULL DEFAULT 'privado',
    "destacado" BOOLEAN NOT NULL DEFAULT false,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_publicacion" TIMESTAMP(3),
    "id_usuario" TEXT NOT NULL,
    "id_categoria" INTEGER,

    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_etiquetas" (
    "id_proyecto" TEXT NOT NULL,
    "id_etiqueta" INTEGER NOT NULL,

    CONSTRAINT "proyecto_etiquetas_pkey" PRIMARY KEY ("id_proyecto","id_etiqueta")
);

-- CreateTable
CREATE TABLE "versiones_proyecto" (
    "id" TEXT NOT NULL,
    "numero_version" TEXT NOT NULL,
    "notas_version" TEXT,
    "es_activa" BOOLEAN NOT NULL DEFAULT false,
    "fecha_subida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_proyecto" TEXT NOT NULL,

    CONSTRAINT "versiones_proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos" (
    "id" TEXT NOT NULL,
    "tipo" "FileType" NOT NULL,
    "nombre_archivo" TEXT NOT NULL,
    "ruta_storage" TEXT NOT NULL,
    "tamanio_bytes" BIGINT NOT NULL,
    "fecha_subida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_version" TEXT NOT NULL,

    CONSTRAINT "archivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controles_juego" (
    "id" TEXT NOT NULL,
    "tipo_entrada" "InputType" NOT NULL,
    "tecla_boton" TEXT NOT NULL,
    "descripcion_accion" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "id_proyecto" TEXT NOT NULL,

    CONSTRAINT "controles_juego_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comentarios" (
    "id" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "calificacion" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_proyecto" TEXT NOT NULL,
    "id_usuario" TEXT NOT NULL,

    CONSTRAINT "comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitas" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origen" TEXT,
    "id_proyecto" TEXT NOT NULL,

    CONSTRAINT "visitas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_firebase_uid_key" ON "usuarios"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "etiquetas_nombre_key" ON "etiquetas"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "proyectos_slug_key" ON "proyectos"("slug");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_id_categoria_fkey" FOREIGN KEY ("id_categoria") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_etiquetas" ADD CONSTRAINT "proyecto_etiquetas_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_etiquetas" ADD CONSTRAINT "proyecto_etiquetas_id_etiqueta_fkey" FOREIGN KEY ("id_etiqueta") REFERENCES "etiquetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versiones_proyecto" ADD CONSTRAINT "versiones_proyecto_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_id_version_fkey" FOREIGN KEY ("id_version") REFERENCES "versiones_proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controles_juego" ADD CONSTRAINT "controles_juego_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
