-- AlterTable
ALTER TABLE "visitas" ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "codigo_pais" CHAR(2),
ADD COLUMN     "region" TEXT;

-- CreateIndex
CREATE INDEX "visitas_id_proyecto_fecha_idx" ON "visitas"("id_proyecto", "fecha");
