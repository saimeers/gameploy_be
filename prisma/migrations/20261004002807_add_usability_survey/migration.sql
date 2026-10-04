-- CreateEnum
CREATE TYPE "SurveyProfile" AS ENUM ('estudiante', 'docente', 'visitante');

-- CreateEnum
CREATE TYPE "SurveyMoment" AS ENUM ('primer_proyecto', 'uso_prolongado', 'tras_jugar', 'voluntaria');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "dias_activos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "encuesta_pospuesta_hasta" TIMESTAMP(3),
ADD COLUMN     "encuesta_pospuestas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "encuesta_respondida" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ultimo_dia_activo" DATE;

-- CreateTable
CREATE TABLE "respuestas_encuesta" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL,
    "perfil" "SurveyProfile" NOT NULL,
    "momento" "SurveyMoment" NOT NULL,
    "edad" TEXT,
    "genero" TEXT,
    "experiencia_videojuegos" TEXT,
    "frecuencia_juego" TEXT,
    "juegos_serios_previos" TEXT,
    "sus" INTEGER[],
    "ux" INTEGER[],
    "sus_puntaje" DOUBLE PRECISION NOT NULL,
    "ux_puntaje" DOUBLE PRECISION NOT NULL,
    "comentario" TEXT,

    CONSTRAINT "respuestas_encuesta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "respuestas_encuesta_fecha_idx" ON "respuestas_encuesta"("fecha");
