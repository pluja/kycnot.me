-- AlterTable
ALTER TABLE "CaseEvidence" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CaseUpdate" ADD COLUMN     "staffOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "_CaseParticipants" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CaseParticipants_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_CaseParticipants_B_index" ON "_CaseParticipants"("B");

-- AddForeignKey
ALTER TABLE "_CaseParticipants" ADD CONSTRAINT "_CaseParticipants_A_fkey" FOREIGN KEY ("A") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseParticipants" ADD CONSTRAINT "_CaseParticipants_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

