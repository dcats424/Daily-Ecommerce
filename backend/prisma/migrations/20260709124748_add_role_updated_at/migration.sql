/*
  Warnings:

  - Added the required column `updated_at` to the `roles` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "roles" ALTER COLUMN "updated_at" DROP DEFAULT;
