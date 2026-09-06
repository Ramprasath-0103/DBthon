-- ---------------------------------------------------------------------------
-- The write gate, enforced in the database.
--
-- The API also checks this in middleware. This trigger exists because an
-- application bug must not become a data-integrity breach: even a direct SQL
-- connection that bypasses the API entirely cannot write a review from a
-- non-female account.
--
-- The same trigger derives time_bucket from visited_at in Asia/Kolkata, so the
-- API physically cannot desynchronise the two.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION safeway_review_gate() RETURNS trigger AS $$
DECLARE
  author_gender "Gender";
  ist_hour      int;
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'a review must have an author'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT gender INTO author_gender FROM users WHERE id = NEW.user_id;

  IF author_gender IS NULL THEN
    RAISE EXCEPTION 'unknown author %', NEW.user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF author_gender <> 'female' THEN
    RAISE EXCEPTION 'only accounts registered as female may post reviews'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- morning 05-11 · afternoon 11-17 · evening 17-21 · night 21-05, in IST.
  ist_hour := EXTRACT(HOUR FROM (NEW.visited_at AT TIME ZONE 'Asia/Kolkata'));
  NEW.time_bucket := (CASE
    WHEN ist_hour >= 5  AND ist_hour < 11 THEN 'morning'
    WHEN ist_hour >= 11 AND ist_hour < 17 THEN 'afternoon'
    WHEN ist_hour >= 17 AND ist_hour < 21 THEN 'evening'
    ELSE 'night'
  END)::"TimeBucket";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reviews_gate_and_derive
  BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION safeway_review_gate();
