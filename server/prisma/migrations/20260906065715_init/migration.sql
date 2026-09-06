-- PostGIS must exist before "locations".geog is created.
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('female', 'male', 'other');

-- CreateEnum
CREATE TYPE "TimeBucket" AS ENUM ('morning', 'afternoon', 'evening', 'night');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "location_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" INTEGER NOT NULL,
    "address" TEXT,
    "geog" geography(Point, 4326) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_factors" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "safety_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "location_id" INTEGER NOT NULL,
    "visited_at" TIMESTAMPTZ(6) NOT NULL,
    "time_bucket" "TimeBucket" NOT NULL,
    "body" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_factor_ratings" (
    "review_id" INTEGER NOT NULL,
    "factor_id" INTEGER NOT NULL,
    "score" SMALLINT NOT NULL,

    CONSTRAINT "review_factor_ratings_pkey" PRIMARY KEY ("review_id","factor_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "location_categories_name_key" ON "location_categories"("name");

-- CreateIndex
CREATE INDEX "locations_geog_idx" ON "locations" USING GIST ("geog");

-- CreateIndex
CREATE UNIQUE INDEX "safety_factors_code_key" ON "safety_factors"("code");

-- CreateIndex
CREATE INDEX "reviews_location_id_time_bucket_idx" ON "reviews"("location_id", "time_bucket");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_user_id_location_id_key" ON "reviews"("user_id", "location_id");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "location_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_factor_ratings" ADD CONSTRAINT "review_factor_ratings_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_factor_ratings" ADD CONSTRAINT "review_factor_ratings_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "safety_factors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints Prisma's schema language cannot express
-- ---------------------------------------------------------------------------

ALTER TABLE "review_factor_ratings"
  ADD CONSTRAINT "review_factor_ratings_score_check" CHECK ("score" BETWEEN 1 AND 5);

-- ---------------------------------------------------------------------------
-- location_safety_score — a VIEW, not a table.
--
-- Each review's rating is the mean of its 6 factor scores; a location's score
-- for a time bucket is the mean of those. Because this is a view there is no
-- recompute logic anywhere: posting a review moves the score on the next read.
--
-- Fewer than 3 reviews returns NULL, never a number. That is a hard display
-- rule: one review must not be able to colour a pin.
-- ---------------------------------------------------------------------------

CREATE VIEW "location_safety_score" AS
WITH review_means AS (
  SELECT r.id            AS review_id,
         r.location_id   AS location_id,
         r.time_bucket   AS time_bucket,
         AVG(rfr.score)::numeric AS review_mean
  FROM reviews r
  JOIN review_factor_ratings rfr ON rfr.review_id = r.id
  GROUP BY r.id, r.location_id, r.time_bucket
)
SELECT location_id,
       time_bucket,
       CASE WHEN COUNT(*) >= 3
            THEN ROUND(AVG(review_mean), 2)
            ELSE NULL
       END           AS score,
       COUNT(*)::int AS sample_size
FROM review_means
GROUP BY location_id, time_bucket;
