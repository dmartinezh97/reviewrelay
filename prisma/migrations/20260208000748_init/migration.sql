-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_map" (
    "id" SERIAL NOT NULL,
    "gitea_repo" TEXT NOT NULL,
    "gitea_pr_number" INTEGER NOT NULL,
    "github_repo" TEXT NOT NULL,
    "github_pr_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pr_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_reviews" (
    "id" SERIAL NOT NULL,
    "github_repo" TEXT NOT NULL,
    "github_pr_number" INTEGER NOT NULL,
    "github_review_id" BIGINT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_source_delivery_id_key" ON "webhook_deliveries"("source", "delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "pr_map_gitea_repo_gitea_pr_number_key" ON "pr_map"("gitea_repo", "gitea_pr_number");

-- CreateIndex
CREATE UNIQUE INDEX "processed_reviews_github_repo_github_pr_number_github_revie_key" ON "processed_reviews"("github_repo", "github_pr_number", "github_review_id");
