-- AlterEnum
ALTER TYPE "RoleName" ADD VALUE 'pendiente';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "rol_solicitado" "RoleName";
