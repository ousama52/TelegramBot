CREATE TABLE IF NOT EXISTS games (
    id uuid PRIMARY KEY,
    type text NOT NULL CHECK (type IN ('big2', 'dominoes')),
    status text NOT NULL CHECK (status IN ('lobby', 'playing', 'finished', 'abandoned')),
    host_user_id bigint NOT NULL,
    state jsonb,
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    inline_message_id text UNIQUE,
    chat_id bigint,
    message_id integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((chat_id IS NULL) = (message_id IS NULL)),
    CHECK (inline_message_id IS NOT NULL OR chat_id IS NOT NULL),
    CHECK (state IS NOT NULL OR status IN ('lobby', 'abandoned')),
    UNIQUE (chat_id, message_id)
);

CREATE TABLE IF NOT EXISTS game_players (
    game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id bigint NOT NULL,
    display_name text NOT NULL,
    seat integer NOT NULL CHECK (seat >= 0),
    PRIMARY KEY (game_id, user_id),
    UNIQUE (game_id, seat)
);

CREATE TABLE IF NOT EXISTS user_active_game (
    user_id bigint PRIMARY KEY,
    game_id uuid NOT NULL,
    FOREIGN KEY (game_id, user_id) REFERENCES game_players(game_id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_active_game_game_id ON user_active_game (game_id);

CREATE TABLE IF NOT EXISTS accepted_inline_moves (
    game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    version integer NOT NULL,
    user_id bigint NOT NULL,
    inline_message_id text NOT NULL,
    PRIMARY KEY (game_id, version)
);

CREATE TABLE IF NOT EXISTS stickers (
    set_name text NOT NULL,
    key text NOT NULL,
    file_id text NOT NULL,
    file_unique_id text NOT NULL,
    PRIMARY KEY (set_name, key),
    UNIQUE (set_name, file_unique_id)
);
