-- CreateTable
CREATE TABLE "slugs_anteriores" (
    "slug" TEXT NOT NULL,
    "fecha_cambio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_proyecto" TEXT NOT NULL,

    CONSTRAINT "slugs_anteriores_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "slugs_anteriores_id_proyecto_idx" ON "slugs_anteriores"("id_proyecto");

-- AddForeignKey
ALTER TABLE "slugs_anteriores" ADD CONSTRAINT "slugs_anteriores_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
