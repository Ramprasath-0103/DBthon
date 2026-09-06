-- One review per person per place PER TIME BUCKET.
--
-- The same woman can rate a bus stop separately for morning, afternoon, evening
-- and night — a place genuinely is different at different hours, which is the
-- product's whole premise.
--
-- time_bucket is written by the BEFORE INSERT trigger, and unique constraints are
-- checked after BEFORE triggers run, so this constrains the derived value rather
-- than whatever the client happened to send.

DROP INDEX "reviews_user_id_location_id_key";

CREATE UNIQUE INDEX "reviews_user_id_location_id_time_bucket_key"
  ON "reviews"("user_id", "location_id", "time_bucket");
