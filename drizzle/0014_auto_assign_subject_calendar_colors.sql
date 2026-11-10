WITH ranked_subjects AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY child_profile_id ORDER BY sort_order, created_at, id) - 1 AS subject_index
  FROM child_subjects
)
UPDATE child_subjects AS subjects
SET calendar_color = CASE (ranked_subjects.subject_index % 8)
  WHEN 0 THEN '#2563EB'
  WHEN 1 THEN '#16A34A'
  WHEN 2 THEN '#F59E0B'
  WHEN 3 THEN '#EF4444'
  WHEN 4 THEN '#A855F7'
  WHEN 5 THEN '#EC4899'
  WHEN 6 THEN '#0D9488'
  ELSE '#64748B'
END
FROM ranked_subjects
WHERE subjects.id = ranked_subjects.id
  AND subjects.calendar_color = '#2563EB';
