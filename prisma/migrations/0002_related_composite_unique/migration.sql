-- CreateIndex
CREATE UNIQUE INDEX "contacts_id_dataset_id_key" ON "contacts"("id", "dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_id_dataset_id_key" ON "opportunities"("id", "dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "signals_id_dataset_id_key" ON "signals"("id", "dataset_id");

