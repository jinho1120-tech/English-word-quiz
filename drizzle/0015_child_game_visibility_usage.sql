ALTER TABLE child_profiles ADD COLUMN show_pacman boolean NOT NULL DEFAULT true, ADD COLUMN show_word_defense boolean NOT NULL DEFAULT true;
CREATE TABLE child_game_plays (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_profile_id uuid NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE, game varchar(24) NOT NULL CHECK (game IN ('pacman', 'word_defense')), started_at timestamp NOT NULL DEFAULT now());
CREATE INDEX child_game_plays_child_started_idx ON child_game_plays (child_profile_id, started_at);
CREATE INDEX child_game_plays_child_game_started_idx ON child_game_plays (child_profile_id, game, started_at);
